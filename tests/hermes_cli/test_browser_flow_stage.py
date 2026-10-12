"""Composer-write consent and durable replay fence; synthetic CDP only."""
import asyncio
import json
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from hermes_cli import browser_flow_stage as stage
URL = "https://flow.google.com/project/11111111-2222-3333-4444-555555555555"
COLLECTION = URL + "/collection/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
MARKERS = {"project_match": True, "page_ready": True, "composer_empty": True,
           "agent_mode_visible": True, "stop_button_visible": False, "send_enabled": False,
           "textarea_count": 1, "contenteditable_count": 0, "send_button_count": 1}

ITEMS = [{"name": "hmx_test_003_sahil", "prompt": "PRIVATE_PROMPT Gün batımı"},
         {"name": "hmx_test_004_orman", "prompt": "Sisli orman"}]
READY = {**MARKERS, "textarea_count": 0, "contenteditable_count": 1}

@pytest.mark.parametrize("items", [[], ITEMS * 2,
    [{"name": "original", "prompt": "prompt"}],
    [{"name": "hmx_test_../file", "prompt": "prompt"}],
    [{"name": "hmx_test_a", "prompt": ""}],
    [{"name": "hmx_test_a", "prompt": "x" * 3001}],
    [{"name": "hmx_test_a", "prompt": "a"}, {"name": "hmx_test_A", "prompt": "b"}],
    [{"name": "hmx_test_a", "prompt": "a", "expression": "BAD"}]])
def test_server_validates_independent_of_client(items):
    with pytest.raises(ValueError): stage.build_stage_message(items)


def test_message_treats_rows_as_data_and_bounds_request():
    message = stage.build_stage_message(ITEMS)
    assert "toplam 2 görsel" in message and "Video oluşturma" in message
    assert json.loads(message.split("JSON: ", 1)[1]) == [
        {"NAME": row["name"], "PROMPT": row["prompt"]} for row in ITEMS]


def test_store_survives_restart_and_does_not_store_prompts(tmp_path):
    path = tmp_path / "profile" / "stages.db"
    store = stage.StageStore(path); ident = str(uuid.uuid4()); message = stage.build_stage_message(ITEMS)
    assert store.claim(ident, "chosen", URL, message, 2) is None
    restarted = stage.StageStore(path)
    assert restarted.status(ident)["state"] == "stage_uncertain"
    assert restarted.claim(ident, "chosen", URL, message, 2)["state"] == "attempt_exists"
    assert restarted.claim(str(uuid.uuid4()), "other", URL, message, 2)["state"] == "attempt_exists"
    store.finish(ident, {"state": "text_staged", "production_submitted": False})
    assert restarted.status(ident)["state"] == "text_staged"
    assert b"PRIVATE_PROMPT" not in path.read_bytes()


def test_store_claim_is_atomic_and_profile_local(tmp_path):
    store = stage.StageStore(tmp_path / "a" / "stages.db"); message = stage.build_stage_message(ITEMS)
    def claim(_): return store.claim(str(uuid.uuid4()), "chosen", URL, message, 2)
    with ThreadPoolExecutor(max_workers=2) as pool: results = list(pool.map(claim, range(2)))
    assert sum(row is None for row in results) == 1
    assert stage.StageStore(tmp_path / "b" / "stages.db").claim(str(uuid.uuid4()), "chosen", URL, message, 2) is None


@pytest.mark.parametrize("actual,preflight,effect,state", [
    (COLLECTION, READY, "text_staged", "text_staged"),
    (URL.replace("11111111", "99999999"), READY, "text_staged", "project_mismatch"),
    (URL, {**READY, "composer_empty": False}, "text_staged", "composer_blocked"),
    (URL, READY, "composer_not_empty", "composer_not_empty"),
    (URL, READY, "stage_uncertain", "stage_uncertain"),
])
def test_wire_read_then_fixed_editor_mutation_no_send(actual, preflight, effect, state):
    async def scenario():
        from websockets.asyncio.server import serve
        commands = []; reads = 0
        async def handler(socket):
            nonlocal reads
            async for raw in socket:
                call = json.loads(raw); commands.append(call)
                if call["method"] == "Target.getTargets":
                    result = {"targetInfos": [{"type": "page", "targetId": "chosen", "url": actual},
                                             {"type": "page", "targetId": "other", "url": URL}]}
                elif call["method"] == "Target.attachToTarget":
                    assert call["params"]["targetId"] == "chosen"; result = {"sessionId": "session"}
                elif call["method"] == "Runtime.evaluate":
                    reads += 1
                    if reads in (1, 3):
                        assert call["params"]["throwOnSideEffect"] is True
                        result = {"result": {"value": preflight if reads == 1 else {**READY, "composer_empty": False, "send_enabled": True}}}
                    else:
                        assert reads == 2
                        assert call["params"]["expression"] == stage.stage_expression(URL, stage.build_stage_message(ITEMS))
                        result = {"result": {"value": {"state": effect}}}
                elif call["method"] == "Target.detachFromTarget": result = {}
                else: pytest.fail("no clicks, keyboard or navigation allowed")
                await socket.send(json.dumps({"id": call["id"], "result": result}))
        async with serve(handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            result = await stage.stage_endpoint(f"ws://127.0.0.1:{port}", "chosen", URL, stage.build_stage_message(ITEMS))
        assert result["state"] == state and result["production_submitted"] is False
        if state == "text_staged": assert result["send_enabled"] is True
        assert reads == (0 if state == "project_mismatch" else 1 if state == "composer_blocked" else 3 if state == "text_staged" else 2)
        if reads: assert commands[-1]["method"] == "Target.detachFromTarget"
    asyncio.run(scenario())


def test_durable_fence_precedes_browser_even_after_uncertain_result(tmp_path, monkeypatch):
    calls = []
    async def probe(**kwargs): calls.append(True); return {"state": "stage_uncertain"}
    monkeypatch.setattr(stage, "run_browser_probe", probe)
    store = stage.StageStore(tmp_path / "stages.db"); ident = str(uuid.uuid4())
    result = asyncio.run(stage.stage_flow_text(store, ident, "chosen", URL, ITEMS))
    assert result["state"] == "stage_uncertain"
    assert asyncio.run(stage.stage_flow_text(store, ident, "chosen", URL, ITEMS))["state"] == "attempt_exists"
    assert len(calls) == 1


def test_invalid_inputs_never_record_or_connect(tmp_path, monkeypatch):
    async def forbidden(**kwargs): pytest.fail("no connection allowed")
    monkeypatch.setattr(stage, "run_browser_probe", forbidden)
    path = tmp_path / "stages.db"
    result = asyncio.run(stage.stage_flow_text(stage.StageStore(path), "bad-id", "chosen", URL, ITEMS))
    assert result["state"] == "invalid_request" and not path.exists()
