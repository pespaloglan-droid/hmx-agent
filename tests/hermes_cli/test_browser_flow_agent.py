"""Bounded Agent diagnostics never claim, write or click the recorded stage."""
import asyncio
import json
import uuid

import pytest
from hermes_cli import browser_flow_agent as agent
from hermes_cli.browser_flow_stage import StageStore, build_stage_message

URL = 'https://flow.google.com/project/11111111-2222-3333-4444-555555555555'
MARKERS = {'project_match': True, 'agent_total_count': 1, 'agent_visible_count': 1,
           'agent_selected_visible_count': 1, 'agent_enabled': True, 'agent_pressed': 'true'}


@pytest.mark.parametrize('changes,state', [
    ({}, 'agent_selected'),
    ({'agent_pressed': 'false', 'agent_selected_visible_count': 0}, 'agent_inactive'),
    ({'agent_pressed': 'unknown', 'agent_selected_visible_count': 0}, 'agent_unknown'),
    ({'agent_enabled': False}, 'agent_disabled'),
    ({'agent_total_count': 2, 'agent_visible_count': 2, 'agent_selected_visible_count': 2,
      'agent_enabled': False, 'agent_pressed': 'none'}, 'agent_ambiguous'),
    ({'agent_total_count': 1, 'agent_visible_count': 0, 'agent_selected_visible_count': 0,
      'agent_enabled': False, 'agent_pressed': 'none'}, 'agent_missing'),
    ({'agent_total_count': True}, 'invalid_reply'),
    ({'agent_total_count': 129}, 'invalid_reply'),
    ({'agent_selected_visible_count': 2}, 'invalid_reply'),
    ({'agent_pressed': 'PRIVATE_ATTRIBUTE'}, 'invalid_reply'),
    ({'agent_pressed': 'none'}, 'invalid_reply'),
    ({'project_match': False}, 'project_mismatch'),
])
def test_bounded_private_result(changes, state):
    result = agent.agent_result({'result': {'value': {'project_match': changes.get('project_match', True),
        'markers': {**MARKERS, **changes, 'private': 'PRIVATE_PROMPT'}}}})
    assert result['state'] == state and result['production_authorized'] is False
    assert 'PRIVATE' not in json.dumps(result)


def test_read_exception_is_not_selection():
    assert agent.agent_result({'exceptionDetails': {'text': 'PRIVATE'}}) == {
        'state': 'read_blocked', 'production_authorized': False}


def test_unknown_or_other_profile_record_never_connects(tmp_path, monkeypatch):
    async def forbidden(**kwargs): pytest.fail('must not connect')
    monkeypatch.setattr(agent, 'run_browser_probe', forbidden)
    store = StageStore(tmp_path / 'empty.db')
    assert asyncio.run(agent.inspect_flow_stage_agent(store, 'invalid'))['state'] == 'invalid_request'
    assert asyncio.run(agent.inspect_flow_stage_agent(store, str(uuid.uuid4())))['state'] == 'not_found'


@pytest.mark.parametrize('state', ['text_staged', 'submission_uncertain'])
def test_read_only_wire_and_ledger_preserved(tmp_path, monkeypatch, state):
    store = StageStore(tmp_path / 'stage.db'); ident = str(uuid.uuid4())
    message = build_stage_message([{'name': 'hmx_test_a', 'prompt': 'PRIVATE_PROMPT'}])
    store.claim(ident, 'chosen', URL, message, 1)
    store.finish(ident, {'state': state, 'production_submitted': None})
    before = store.lookup(ident)
    async def scenario():
        from websockets.asyncio.server import serve
        commands = []
        async def handler(socket):
            async for data in socket:
                call = json.loads(data); commands.append(call['method'])
                def attach():
                    assert call['params']['targetId'] == 'chosen'
                    return {'sessionId': 'test-session'}
                def evaluate():
                    assert call['params'] == {'expression': agent.agent_expression(URL),
                        'returnByValue': True, 'throwOnSideEffect': True, 'timeout': 5000}
                    return {'result': {'value': {'project_match': True, 'markers': MARKERS}}}
                handlers = {
                    'Target.getTargets': lambda: {'targetInfos': [{'type': 'page', 'targetId': 'chosen', 'url': URL}]},
                    'Target.attachToTarget': attach, 'Runtime.evaluate': evaluate,
                    'Target.detachFromTarget': dict,
                }
                assert call['method'] in handlers, 'unexpected effect command'
                result = handlers[call['method']]()
                await socket.send(json.dumps({'id': call['id'], 'result': result}))
        async with serve(handler, '127.0.0.1', 0) as server:
            async def probe(*, check):
                return await check(f'ws://127.0.0.1:{server.sockets[0].getsockname()[1]}')
            monkeypatch.setattr(agent, 'run_browser_probe', probe)
            result = await agent.inspect_flow_stage_agent(store, ident)
        assert result['state'] == 'agent_selected' and result['stage_id'] == ident
        assert commands == ['Target.getTargets', 'Target.attachToTarget', 'Runtime.evaluate', 'Target.detachFromTarget']
    asyncio.run(scenario())
    assert store.lookup(ident) == before
    assert b'PRIVATE_PROMPT' not in store.path.read_bytes()


def test_current_selection_is_diagnostic_only_and_preserves_saved_binding(tmp_path, monkeypatch):
    store = StageStore(tmp_path / 'stage.db'); ident = str(uuid.uuid4())
    message = build_stage_message([{'name': 'hmx_test_a', 'prompt': 'PRIVATE_PROMPT'}])
    store.claim(ident, 'closed-tab', URL, message, 1)
    store.finish(ident, {'state': 'submission_uncertain', 'production_submitted': None})
    before = store.lookup(ident); calls = []
    async def read(endpoint, target, project, *, expression, read_result):
        calls.append((target, project))
        assert expression == agent.agent_expression(URL)
        return read_result({'result': {'value': {'project_match': True, 'markers': MARKERS}}})
    async def probe(*, check): return await check('test-endpoint')
    monkeypatch.setattr(agent, 'inspect_project_endpoint', read)
    monkeypatch.setattr(agent, 'run_browser_probe', probe)
    result = asyncio.run(agent.inspect_flow_stage_agent(store, ident, current_target_id='current-tab'))
    assert result['state'] == 'agent_selected' and result['production_authorized'] is False
    assert calls == [('current-tab', URL)]
    assert store.lookup(ident) == before
    assert asyncio.run(agent.inspect_flow_stage_agent(store, ident, current_target_id='bad/id'))['state'] == 'invalid_request'
    assert asyncio.run(agent.inspect_flow_stage_agent(store, str(uuid.uuid4()), current_target_id='current-tab'))['state'] == 'not_found'
    assert calls == [('current-tab', URL)]


def test_current_target_different_project_is_refused_before_reading_dom(tmp_path, monkeypatch):
    store = StageStore(tmp_path / 'stage.db'); ident = str(uuid.uuid4())
    store.claim(ident, 'closed-tab', URL, 'fixture', 1)
    before = store.lookup(ident)
    async def scenario():
        from websockets.asyncio.server import serve
        commands = []
        async def handler(socket):
            async for raw in socket:
                call = json.loads(raw); commands.append(call['method'])
                assert call['method'] == 'Target.getTargets'
                result = {'targetInfos': [{'type': 'page', 'targetId': 'current-tab',
                                         'url': URL.replace('11111111', '99999999')}]}
                await socket.send(json.dumps({'id': call['id'], 'result': result}))
        async with serve(handler, '127.0.0.1', 0) as server:
            async def probe(*, check): return await check(f'ws://127.0.0.1:{server.sockets[0].getsockname()[1]}')
            monkeypatch.setattr(agent, 'run_browser_probe', probe)
            result = await agent.inspect_flow_stage_agent(store, ident, current_target_id='current-tab')
        assert result['state'] == 'project_mismatch' and result['production_authorized'] is False
        assert commands == ['Target.getTargets']
    asyncio.run(scenario())
    assert store.lookup(ident) == before
