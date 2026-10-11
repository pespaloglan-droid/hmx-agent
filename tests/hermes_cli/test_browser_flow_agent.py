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
