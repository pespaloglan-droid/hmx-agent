"""Approved single-click wire contract and durable cross-process replay fence."""
import asyncio
import hashlib
import json
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from hermes_cli import browser_flow_submit as submit
from hermes_cli.browser_flow_stage import StageStore, build_stage_message

URL = 'https://flow.google.com/project/11111111-2222-3333-4444-555555555555'
ITEMS = [{'name': 'hmx_test_a', 'prompt': 'PRIVATE_PROMPT'}, {'name': 'hmx_test_b', 'prompt': 'Orman'}]


def prepared(tmp_path):
    store = StageStore(tmp_path / 'stages.db'); ident = str(uuid.uuid4())
    message = build_stage_message(ITEMS)
    store.claim(ident, 'chosen', URL, message, 2)
    store.finish(ident, {'state': 'text_staged', 'production_submitted': False})
    return store, ident, message


def test_atomic_submission_claim_survives_restart_without_prompt_storage(tmp_path):
    store, ident, message = prepared(tmp_path)
    digest = hashlib.sha256(message.encode()).hexdigest()
    assert not store.claim_submission(ident, "different", 2)
    assert not store.claim_submission(ident, digest, 1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        claims = list(pool.map(lambda _: StageStore(store.path).claim_submission(ident, digest, 2), range(2)))
    assert claims.count(True) == 1
    restarted = StageStore(store.path)
    status = restarted.status(ident)
    assert status['state'] == 'submission_uncertain' and status['production_submitted'] is None
    assert status['stage_meta'] == {'target_id': 'chosen', 'project_url': URL, 'item_count': 2}
    assert not restarted.claim_submission(ident, digest, 2)
    assert b'PRIVATE_PROMPT' not in store.path.read_bytes()


def test_wrong_rows_or_unstaged_record_never_connect(tmp_path, monkeypatch):
    store, ident, message = prepared(tmp_path)
    async def forbidden(**kwargs): pytest.fail('must not connect')
    monkeypatch.setattr(submit, 'run_browser_probe', forbidden)
    altered = [{**ITEMS[0], 'prompt': 'changed'}, ITEMS[1]]
    assert asyncio.run(submit.submit_flow_stage(store, ident, altered))['state'] == 'text_mismatch'
    assert asyncio.run(submit.submit_flow_stage(store, str(uuid.uuid4()), ITEMS))['state'] == 'not_found'
    assert asyncio.run(submit.submit_flow_stage(store, 'invalid', ITEMS))['state'] == 'invalid_request'
    assert store.claim_submission(ident, hashlib.sha256(message.encode()).hexdigest(), 2)
    assert asyncio.run(submit.submit_flow_stage(store, ident, ITEMS))['state'] == 'submission_fenced'


@pytest.mark.parametrize('preflight,effect,disconnect,state', [
    ('submit_ready', 'submit_clicked', False, 'submit_clicked'),
    ('agent_not_selected', 'submit_clicked', False, 'agent_not_selected'),
    ('text_mismatch', 'submit_clicked', False, 'text_mismatch'),
    ('project_mismatch', 'submit_clicked', False, 'project_mismatch'),
    ('composer_blocked', 'submit_clicked', False, 'composer_blocked'),
    ('submit_ready', 'text_mismatch', False, 'text_mismatch'),
    ('submit_ready', 'unexpected', False, 'submission_uncertain'),
    ('submit_ready', 'submit_clicked', True, 'submission_uncertain'),
])
def test_wire_rechecks_then_claims_before_one_effect_and_fences(preflight, effect, disconnect, state, tmp_path):
    store, ident, message = prepared(tmp_path); record = store.lookup(ident)
    async def scenario():
        from websockets.asyncio.server import serve
        effects = 0
        def evaluate(call):
            nonlocal effects
            if call['params'].get('throwOnSideEffect'):
                assert call['params']['expression'] == submit.submit_expression(URL, message)
                return {'result': {'value': {'state': preflight}}}
            effects += 1
            assert store.lookup(ident)['state'] == 'submission_attempt_started'
            assert call['params']['userGesture'] is True
            assert call['params']['expression'] == submit.submit_expression(URL, message, click=True)
            return None if disconnect else {'result': {'value': {'state': effect}}}
        def attach(call):
            assert call['params']['targetId'] == 'chosen'
            return {'sessionId': 'session'}
        handlers = {
            'Target.getTargets': lambda call: {'targetInfos': [{'targetId': 'chosen', 'type': 'page', 'url': URL}]},
            'Target.attachToTarget': attach, 'Runtime.evaluate': evaluate,
            'Target.detachFromTarget': lambda call: {},
        }
        async def handler(socket):
            async for raw in socket:
                call = json.loads(raw)
                assert call['method'] in handlers, 'no keyboard, navigation or other command'
                result = handlers[call['method']](call)
                if result is None:
                    await socket.close(); break
                await socket.send(json.dumps({'id': call['id'], 'result': result}))
        async with serve(handler, '127.0.0.1', 0) as server:
            endpoint = f'ws://127.0.0.1:{server.sockets[0].getsockname()[1]}'
            result = await submit.submit_endpoint(endpoint, store, record, message)
            assert result['state'] == state
            if preflight == 'submit_ready':
                # Even a concurrent caller holding stale metadata cannot click again.
                await submit.submit_endpoint(endpoint, store, record, message)
                assert effects == 1
            else:
                assert effects == 0 and store.lookup(ident)['state'] == 'text_staged'
        if state == 'submit_clicked':
            assert result['production_submitted'] is None
            assert store.status(ident)['state'] == 'submit_clicked'
        if disconnect:
            assert store.status(ident)['state'] == 'submission_uncertain'
    asyncio.run(scenario())


def test_outer_submission_persists_uncertain_receipt_and_never_replays(tmp_path, monkeypatch):
    store, ident, message = prepared(tmp_path)
    calls = []
    async def probe(**kwargs):
        calls.append(True)
        store.claim_submission(ident, hashlib.sha256(message.encode()).hexdigest(), 2)
        return {'state': 'submission_uncertain', 'production_submitted': None}
    monkeypatch.setattr(submit, 'run_browser_probe', probe)
    assert asyncio.run(submit.submit_flow_stage(store, ident, ITEMS))['state'] == 'submission_uncertain'
    assert asyncio.run(submit.submit_flow_stage(store, ident, ITEMS))['state'] == 'submission_fenced'
    assert len(calls) == 1


def test_another_profile_cannot_resume_or_submit_the_record(tmp_path, monkeypatch):
    store, ident, _ = prepared(tmp_path)
    async def forbidden(**kwargs): pytest.fail("must not connect")
    monkeypatch.setattr(submit, "run_browser_probe", forbidden)
    other = StageStore(tmp_path / "other-profile" / "stages.db")
    assert other.status(ident)["state"] == "not_found"
    assert asyncio.run(submit.submit_flow_stage(other, ident, ITEMS))["state"] == "not_found"
    assert store.status(ident)["state"] == "text_staged"
