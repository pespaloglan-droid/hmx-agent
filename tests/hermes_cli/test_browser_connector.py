"""Read-only connection scope, bounded results and broker behavior."""
import base64
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from gateway.browser_control_broker import BrowserControlBroker
from hermes_cli.browser_connector import BrowserConnectorRegistry
from hermes_cli.browser_connector_result import tab_result, screenshot_result


def info(home='/fixture/a', folder='Default', install='a'):
    return {'hermes_home': home, 'browser_profile_id': 'chrome:' + folder,
            'provider': 'fixture', 'user_id': 'fixture', 'hermes_profile': 'default',
            'session_id': home + folder, 'install_id': install}


def test_scope_isolates_homes_installations_and_refuses_duplicate_or_writes():
    registry = BrowserConnectorRegistry(BrowserControlBroker(command_timeout=2, developer_mode=False))
    owners = [object(), object(), object()]
    for item, owner in zip([info(), info(folder='Profile 5', install='b'), info('/fixture/b', install='c')], owners):
        def send(frame, item=item):
            scope = next(row.scope for row in registry._connections.values() if row.scope.controller_id == item['install_id'])
            registry.broker.complete(frame['params']['command_id'], scope=scope, ok=True,
                                    result={'tabs': [{'title': item['install_id'], 'origin': 'https://example.com', 'url': 'PRIVATE'}]})
        registry.attach(item, owner, send)
    assert len(registry.list('/fixture/a')) == 2
    assert registry.list('/fixture/a', principal_id='other-user') == []
    assert registry.read('/fixture/a', 'chrome:Default', 'browser_tabs', principal_id='other-user') == {'state': 'not_connected'}
    assert registry.detach('/fixture/a', 'chrome:Default', principal_id='other-user') is None
    assert registry.read('/fixture/a', 'chrome:Default', 'browser_tabs')['tabs'][0]['title'] == 'a'
    assert registry.read('/fixture/b', 'chrome:Default', 'browser_tabs')['tabs'][0]['title'] == 'c'
    assert registry.read('/fixture/a', 'chrome:Default', 'browser_click') == {'state': 'invalid_request'}
    assert registry.read('/fixture/absent', 'chrome:Default', 'browser_tabs') == {'state': 'not_connected'}
    with pytest.raises(ValueError): registry.attach(info(), object(), lambda _: None)
    assert registry.detach('/fixture/a', 'chrome:Default', owner=object()) is None
    assert registry.detach('/fixture/a', 'chrome:Default', owner=owners[0]) is owners[0]
    assert registry.read('/fixture/a', 'chrome:Default', 'browser_tabs') == {'state': 'not_connected'}


def test_pending_disconnect_fails_closed_and_busy_never_dispatches_twice():
    registry = BrowserConnectorRegistry(BrowserControlBroker(command_timeout=3, developer_mode=False))
    sent = threading.Event(); frames = []
    def send(frame): frames.append(frame); sent.set()
    owner = object(); registry.attach(info(), owner, send)
    with ThreadPoolExecutor() as pool:
        task = pool.submit(registry.read, '/fixture/a', 'chrome:Default', 'browser_tabs')
        assert sent.wait(2)
        assert registry.read('/fixture/a', 'chrome:Default', 'browser_tabs') == {'state': 'busy'}
        registry.detach('/fixture/a', 'chrome:Default')
        assert task.result(3) == {'state': 'controller_read_failed'}
    assert len(frames) == 1


@pytest.mark.parametrize('origin', ['file:///tmp/x', 'javascript:x', 'https://user:pass@example.com', 'https://example.com/private?secret=x', 'https://example.com#private'])
def test_tab_results_strip_private_paths_and_reject_non_origins(origin):
    assert tab_result({'tabs': [{'origin': origin, 'title': 'x'}]})['state'] == 'invalid_read_result'


def test_result_decoders_reject_html_oversized_bad_base64_and_keep_only_safe_fields():
    assert tab_result({'tabs': [{'title': 'x\x00', 'origin': 'https://example.com', 'url': 'private'}]}) == {'state': 'read_complete', 'tabs': [{'title': 'x', 'origin': 'https://example.com'}]}
    for value in ['data:text/html;base64,abcd', 'data:image/png;base64,!', 'data:image/png;base64,YQ==']:
        assert screenshot_result({'image_data_url': value})['state'] == 'invalid_read_result'
    png = base64.b64encode(bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489')).decode()
    assert screenshot_result({'image_data_url': 'data:image/png;base64,' + png})['state'] == 'read_complete'
