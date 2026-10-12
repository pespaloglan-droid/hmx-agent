"""Dashboard-authenticated, profile-scoped local Chrome read-only connector."""
from __future__ import annotations
import asyncio
import contextlib
import json
import re
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, StrictBool, ValidationError

from hermes_cli.browser_connector import REGISTRY, CAPABILITIES, readonly_principal
from hermes_cli.browser_connector_result import MAX_FRAME
from hermes_cli.browser_inventory import PROFILE_DIR, inspect_profiles
from hermes_cli.config import load_config
from hermes_cli.dashboard_auth.ws_tickets import TTL_SECONDS, TicketInvalid, consume_ticket, mint_ticket
from hermes_cli.web_deps import late
from hermes_cli.web_routers._common import config_scoped_to_thread, destructive_profile
from hermes_constants import get_hermes_home

router = APIRouter()
_require_token = late('_require_token')
PROTOCOL = 'hermes-browser-readonly-v1'
TICKET_PREFIX = 'hermes-browser-ticket.'
PURPOSE = 'browser-readonly-connector'
ORIGIN = re.compile(r'chrome-extension://[a-p]{32}\Z')


class ProfileRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    browser_profile_id: str
    consent: StrictBool = False


class PairRequest(ProfileRequest):
    install_id: uuid.UUID


class ReadRequest(ProfileRequest):
    action: Literal['browser_tabs', 'browser_screenshot']


def directory(ident):
    if not isinstance(ident, str) or not ident.startswith('chrome:'):
        return None
    value = ident[7:]
    return value if PROFILE_DIR.fullmatch(value) else None


def _settings():
    browser = load_config().get('browser', {})
    setting = browser.get('readonly_connector', {}) if isinstance(browser, dict) else {}
    origin = setting.get('extension_origin', '') if isinstance(setting, dict) else ''
    if not isinstance(origin, str) or not ORIGIN.fullmatch(origin):
        raise HTTPException(400, 'Readonly connector extension origin is not configured')
    return str(get_hermes_home().resolve()), origin



def _principal(request, home):
    session = getattr(request.state, 'session', None)
    return readonly_principal(home, getattr(session, 'user_id', 'local'), getattr(session, 'provider', 'loopback'))


def _known_profile(ident):
    from hermes_cli.browser_connect import real_profile_data_dir
    folder = directory(ident)
    root = real_profile_data_dir('chrome')
    rows, _warning = inspect_profiles(Path(root)) if root else ([], None)
    return folder is not None and any(row['directory'] == folder for row in rows)


async def _body(request, model):
    _require_token(request)
    raw = await request.body()
    if len(raw) > 2048 or request.headers.get('content-type', '').split(';')[0] != 'application/json':
        raise HTTPException(422, 'Invalid readonly connector request')
    try:
        body = model.model_validate_json(raw)
    except ValidationError:
        raise HTTPException(422, 'Invalid readonly connector request')
    if body.consent is not True or directory(body.browser_profile_id) is None:
        raise HTTPException(400, 'Explicit readonly consent and Chrome profile are required')
    return body


@router.post('/api/browser/connectors/pair')
async def pair(request: Request, profile: str | None = None):
    body = await _body(request, PairRequest)
    profile = destructive_profile(profile, 'Readonly Chrome pairing')
    home, origin = await config_scoped_to_thread(profile, _settings)
    if not await config_scoped_to_thread(profile, lambda: _known_profile(body.browser_profile_id)):
        raise HTTPException(400, 'Chrome profile was not found')
    session = getattr(request.state, 'session', None)
    ticket = mint_ticket(user_id=getattr(session, 'user_id', 'local'), provider=getattr(session, 'provider', 'loopback'),
        extra={'purpose': PURPOSE, 'hermes_home': home, 'hermes_profile': profile or 'default', 'extension_origin': origin,
               'browser_profile_id': body.browser_profile_id, 'install_id': str(body.install_id), 'session_id': uuid.uuid4().hex})
    return {'ticket': ticket, 'ttl_seconds': TTL_SECONDS, 'browser_profile_id': body.browser_profile_id,
            'install_id': str(body.install_id)}


@router.get('/api/browser/connectors')
async def connections(request: Request, profile: str | None = None):
    _require_token(request)
    profile = destructive_profile(profile, 'Readonly Chrome connections')
    home = await config_scoped_to_thread(profile, lambda: str(get_hermes_home().resolve()))
    return {'connections': REGISTRY.list(home, principal_id=_principal(request, home)), 'agent_control': False}


@router.post('/api/browser/connectors/read')
async def read(request: Request, profile: str | None = None):
    body = await _body(request, ReadRequest)
    profile = destructive_profile(profile, 'Readonly Chrome read')
    home, _origin = await config_scoped_to_thread(profile, _settings)
    result = await asyncio.to_thread(REGISTRY.read, home, body.browser_profile_id, body.action, principal_id=_principal(request, home))
    return {**result, 'agent_control': False}


@router.post('/api/browser/connectors/disconnect')
async def disconnect(request: Request, profile: str | None = None):
    body = await _body(request, ProfileRequest)
    profile = destructive_profile(profile, 'Readonly Chrome disconnect')
    home = await config_scoped_to_thread(profile, lambda: str(get_hermes_home().resolve()))
    owner = await asyncio.to_thread(REGISTRY.detach, home, body.browser_profile_id, principal_id=_principal(request, home))
    if owner is not None:
        try:
            await owner.close(code=4000)
        except RuntimeError:
            pass  # The transport may already have completed its close.
    return {'state': 'disconnected', 'agent_control': False}


def _socket_ticket(ws):
    # Loopback only. Ordinary dashboard WS origin policy is not relaxed.
    if ws.client is None or ws.client.host not in {'127.0.0.1', '::1', 'localhost'}:
        return None
    if ws.url.hostname not in {'127.0.0.1', 'localhost', '::1'} or ws.query_params:
        return None
    if not re.fullmatch(r'(?:127\.0\.0\.1|localhost|\[::1\])(?::[0-9]{1,5})?', ws.headers.get('host', '')):
        return None
    protocols = [p.strip() for p in ws.headers.get('sec-websocket-protocol', '').split(',')]
    tickets = [p[len(TICKET_PREFIX):] for p in protocols if p.startswith(TICKET_PREFIX)]
    if PROTOCOL not in protocols or len(tickets) != 1:
        return None
    try:
        info = consume_ticket(tickets[0])
    except TicketInvalid:
        return None
    if info.get('purpose') != PURPOSE or ws.headers.get('origin') != info.get('extension_origin'):
        return None
    return info


def _hello(frame, info):
    params = frame.get('params') if isinstance(frame, dict) else None
    if (not isinstance(params, dict) or frame.get('method') != 'hermes.browser.hello'
            or set(params) != {'protocol_version', 'install_id', 'folder_label', 'capabilities'}):
        return False
    return (type(params.get('protocol_version')) is int and params['protocol_version'] == 1
            and params.get('install_id') == info['install_id']
            and params.get('folder_label') == directory(info['browser_profile_id'])
            and params.get('capabilities') == sorted(CAPABILITIES))


async def _frame(ws, scope, frame):
    params = frame.get('params') if isinstance(frame, dict) else None
    if not isinstance(params, dict):
        raise ValueError('invalid_frame')
    method = frame.get('method')
    if method == 'browser.controller.heartbeat':
        nonce = params.get('nonce')
        if not isinstance(nonce, str) or len(nonce) > 128:
            raise ValueError('invalid_nonce')
        await ws.send_json({'method': method, 'params': {'nonce': nonce, 'ok': True}})
        return
    if method != 'browser.controller.result' or not isinstance(params.get('command_id'), str):
        raise ValueError('invalid_method')
    if type(params.get('ok')) is not bool:
        raise ValueError('invalid_result')
    REGISTRY.broker.complete(params['command_id'], scope=scope, ok=params['ok'],
                             result=params.get('result') if params['ok'] else 'controller_read_failed')


@router.websocket('/api/browser/connectors/ws')
async def connector_ws(ws: WebSocket):
    info = _socket_ticket(ws)
    if info is None:
        await ws.close(code=4401)
        return
    await ws.accept(subprotocol=PROTOCOL)
    scope = None
    try:
        hello = await asyncio.wait_for(ws.receive_text(), 10)
        if len(hello) > 2048 or not _hello(json.loads(hello), info):
            raise ValueError('invalid_hello')
        loop = asyncio.get_running_loop()
        def send(frame):
            future = asyncio.run_coroutine_threadsafe(ws.send_json(frame), loop)
            try:
                future.result(timeout=5)
            except TimeoutError:
                future.cancel()
                raise
        scope = await asyncio.to_thread(REGISTRY.attach, info, ws, send)
        await ws.send_json({'method': 'hermes.browser.ready', 'params': {
            'browser_profile_id': info['browser_profile_id'], 'install_id': info['install_id'],
            'capabilities': sorted(CAPABILITIES), 'agent_control': False}})
        while True:
            raw = await asyncio.wait_for(ws.receive_text(), 45)
            if len(raw) > MAX_FRAME:
                raise ValueError('oversized_frame')
            await _frame(ws, scope, json.loads(raw))
    except WebSocketDisconnect:
        pass
    except (ValueError, TimeoutError, RuntimeError):
        with contextlib.suppress(RuntimeError):
            await ws.close(code=4403)
    finally:
        if scope is not None:
            await asyncio.to_thread(REGISTRY.detach, info['hermes_home'], info['browser_profile_id'], owner=ws)
