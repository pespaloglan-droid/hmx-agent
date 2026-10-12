"""Real FastAPI WebSocket upgrade + one-use dashboard auth tickets, no external site."""
import importlib
import json
import uuid
from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from gateway.browser_control_broker import BrowserControlBroker
from hermes_cli.browser_connector import BrowserConnectorRegistry
from hermes_cli.dashboard_auth import ws_tickets

mod = importlib.import_module('hermes_cli.web_routers.browser_connector')
ORIGIN = 'chrome-extension://fgpieoocbpkfjaidphijghloijhfgead'
INSTALL = str(uuid.uuid4())


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    root = tmp_path / 'Chrome'; (root / 'Default').mkdir(parents=True); (root / 'Profile 5').mkdir()
    (root / 'Local State').write_text(json.dumps({'profile': {'info_cache': {'Default': {'name': 'A'}, 'Profile 5': {'name': 'B'}}}}))
    from hermes_cli import browser_connect
    monkeypatch.setattr(browser_connect, 'real_profile_data_dir', lambda _: root)
    monkeypatch.setattr(mod, 'load_config', lambda: {'browser': {'readonly_connector': {'extension_origin': ORIGIN}}})
    monkeypatch.setattr(mod, 'REGISTRY', BrowserConnectorRegistry(BrowserControlBroker(command_timeout=3, developer_mode=False)))
    def auth(request):
        if request.headers.get('authorization') != 'Bearer fixture-session': raise HTTPException(401, 'Unauthorized')
        request.state.session = SimpleNamespace(user_id=request.headers.get('x-fixture-user', 'fixture'), provider='fixture')
    monkeypatch.setattr(mod, '_require_token', auth)
    app = FastAPI(); app.include_router(mod.router)
    with TestClient(app, base_url='http://127.0.0.1:9119', client=('127.0.0.1', 50000)) as client:
        yield client


def post(client, route, **body):
    return client.post('/api/browser/connectors/' + route, headers={'Authorization': 'Bearer fixture-session'}, json=body)


def pairing(client, folder='Default'):
    response = post(client, 'pair', browser_profile_id='chrome:' + folder, install_id=INSTALL, consent=True)
    assert response.status_code == 200, response.text
    return response.json()['ticket']


def socket(client, ticket, origin=ORIGIN):
    return client.websocket_connect('ws://127.0.0.1:9119/api/browser/connectors/ws', headers={'Origin': origin}, subprotocols=[mod.PROTOCOL, mod.TICKET_PREFIX + ticket])


def hello(ws, folder='Default', install=INSTALL):
    ws.send_json({'method': 'hermes.browser.hello', 'params': {'protocol_version': 1, 'install_id': install, 'folder_label': folder, 'capabilities': sorted(mod.CAPABILITIES)}})


def test_authenticated_pair_requires_consent_and_rejects_unknown_fields(app_client):
    client = app_client
    assert client.post('/api/browser/connectors/pair', json={}).status_code == 401
    assert post(client, 'pair', browser_profile_id='chrome:Default', install_id=INSTALL, consent='true').status_code == 422
    assert post(client, 'pair', browser_profile_id='chrome:Default', install_id=INSTALL, consent=False).status_code == 400
    assert post(client, 'pair', browser_profile_id='chrome:Default', install_id=INSTALL, consent=True, path='private').status_code == 422
    assert post(client, 'pair', browser_profile_id='chrome:Profile 99', install_id=INSTALL, consent=True).status_code == 400
    assert post(client, 'read', browser_profile_id='chrome:Default', action='browser_click', consent=True).status_code == 422


def test_one_use_origin_and_exact_hello_binding(app_client):
    client = app_client; ticket = pairing(client)
    with pytest.raises(WebSocketDisconnect), socket(client, ticket, 'https://example.com'): pass
    with pytest.raises(WebSocketDisconnect), socket(client, ticket): pass
    with socket(client, pairing(client)) as ws:
        hello(ws, install=str(uuid.uuid4()))
        with pytest.raises(WebSocketDisconnect): ws.receive_json()
    with socket(client, pairing(client)) as ws:
        hello(ws, folder='Profile 5')
        with pytest.raises(WebSocketDisconnect): ws.receive_json()


def test_real_wire_request_only_dispatches_scoped_read_and_disconnects(app_client):
    client = app_client
    with socket(client, pairing(client)) as ws:
        hello(ws); ready = ws.receive_json()
        assert ready['params']['agent_control'] is False
        assert ready['params']['browser_profile_id'] == 'chrome:Default'
        ws.send_json({'method': 'browser.controller.heartbeat', 'params': {'nonce': 'fixture'}})
        assert ws.receive_json()['params'] == {'nonce': 'fixture', 'ok': True}
        with ThreadPoolExecutor() as pool:
            task = pool.submit(post, client, 'read', browser_profile_id='chrome:Default', action='browser_tabs', consent=True)
            command = ws.receive_json()['params']; assert command['arguments'] == {}
            assert command['controller_id'] == INSTALL and command['browser_profile_id'] == 'chrome:Default'
            ws.send_json({'method': 'browser.controller.result', 'params': {'command_id': command['command_id'], 'ok': True, 'result': {'tabs': [{'title': 'fixture', 'origin': 'http://127.0.0.1:9199'}]}}})
            assert task.result(4).json()['tabs'] == [{'title': 'fixture', 'origin': 'http://127.0.0.1:9199'}]
        assert post(client, 'read', browser_profile_id='chrome:Profile 5', action='browser_tabs', consent=True).json()['state'] == 'not_connected'
        assert post(client, 'disconnect', browser_profile_id='chrome:Default', consent=True).json()['state'] == 'disconnected'
        with pytest.raises(WebSocketDisconnect): ws.receive_json()


def test_ticket_expired_wrong_purpose_and_bad_method_fail_closed(app_client, monkeypatch):
    client = app_client; ticket = pairing(client); now = ws_tickets.time.time()
    monkeypatch.setattr(ws_tickets.time, 'time', lambda: now + 40)
    with pytest.raises(WebSocketDisconnect), socket(client, ticket): pass



def test_readonly_socket_refuses_unsolicited_action_frames(app_client):
    with socket(app_client, pairing(app_client)) as ws:
        hello(ws); ws.receive_json()
        ws.send_json({'method': 'browser_click', 'params': {}})
        with pytest.raises(WebSocketDisconnect): ws.receive_json()


def test_two_connected_profiles_cannot_complete_each_others_reads(app_client):
    client = app_client
    with socket(client, pairing(client)) as a, socket(client, pairing(client, 'Profile 5')) as b:
        hello(a); a.receive_json(); hello(b, folder='Profile 5'); b.receive_json()
        with ThreadPoolExecutor() as pool:
            task = pool.submit(post, client, 'read', browser_profile_id='chrome:Default', action='browser_tabs', consent=True)
            command = a.receive_json()['params']
            b.send_json({'method': 'browser.controller.result', 'params': {'command_id': command['command_id'], 'ok': True, 'result': {'tabs': [{'title': 'wrong', 'origin': 'https://example.org'}]}}})
            b.send_json({'method': 'browser.controller.heartbeat', 'params': {'nonce': 'wrong-profile-done'}})
            assert b.receive_json()['params']['nonce'] == 'wrong-profile-done'
            a.send_json({'method': 'browser.controller.result', 'params': {'command_id': command['command_id'], 'ok': True, 'result': {'tabs': [{'title': 'correct', 'origin': 'https://example.com'}]}}})
            assert task.result(4).json()['tabs'][0]['title'] == 'correct'


def test_wrong_ticket_purpose_and_remote_host_are_rejected(app_client):
    ticket = ws_tickets.mint_ticket(user_id='fixture', provider='fixture', extra={'purpose': 'another-endpoint'})
    with pytest.raises(WebSocketDisconnect), socket(app_client, ticket): pass
    with pytest.raises(WebSocketDisconnect), app_client.websocket_connect('ws://127.0.0.1:9119/api/browser/connectors/ws', headers={'host': 'evil.example', 'Origin': ORIGIN}, subprotocols=[mod.PROTOCOL, mod.TICKET_PREFIX + pairing(app_client)]): pass


def test_other_authenticated_identity_cannot_list_read_or_disconnect_connection(app_client):
    client = app_client
    with socket(client, pairing(client)) as ws:
        hello(ws); ws.receive_json()
        headers = {'Authorization': 'Bearer fixture-session', 'x-fixture-user': 'another-user'}
        assert client.get('/api/browser/connectors', headers=headers).json()['connections'] == []
        body = {'browser_profile_id': 'chrome:Default', 'consent': True}
        assert client.post('/api/browser/connectors/read', headers=headers, json={**body, 'action': 'browser_tabs'}).json()['state'] == 'not_connected'
        client.post('/api/browser/connectors/disconnect', headers=headers, json=body)
        assert len(client.get('/api/browser/connectors', headers={'Authorization': 'Bearer fixture-session'}).json()['connections']) == 1
