"""Exact-project guards against synthetic CDP, never real Google accounts."""
import asyncio
import json

import pytest
from hermes_cli import browser_flow_project as project

URL = "https://flow.google.com/project/11111111-2222-3333-4444-555555555555"
COLLECTION = URL + "/collection/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
MARKERS = {"project_match": True, "page_ready": True, "composer_empty": True,
           "agent_mode_visible": True, "stop_button_visible": False, "send_enabled": False,
           "textarea_count": 1, "contenteditable_count": 0, "send_button_count": 1}

@pytest.mark.parametrize("value,expected", [
    (URL, URL), (COLLECTION, URL), (URL + "/", URL),
    (URL + "?secret=PRIVATE", None), (URL + "#private", None),
    (URL + "/collection/not-a-uuid", None), (URL + "/other", None),
    (URL.replace("https:", "http:"), None),
    (URL.replace("flow.google.com", "flow.google.com.evil.invalid"), None),
    ("https://flow.google.com/", None), (None, None),
])
def test_project_url_scope(value, expected):
    assert project.canonical_project(value) == expected

@pytest.mark.parametrize("changed,state", [
    ({}, "project_ready"), ({"composer_empty": False}, "project_inconclusive"),
    ({"textarea_count": 2}, "project_inconclusive"), ({"stop_button_visible": True}, "project_inconclusive"),
    ({"agent_mode_visible": False}, "project_inconclusive"), ({"send_button_count": 0}, "project_inconclusive"),
    ({"project_match": False}, "project_mismatch"), ({"send_button_count": True}, "invalid_reply"),
])
def test_markers_not_production_authority(changed, state):
    result = project.project_result({"result": {"value": {**MARKERS, **changed, "private": "SECRET"}}})
    assert result["state"] == state
    assert result.get("production_authorized", False) is False
    assert result.get("account_verified", False) is False
    assert "SECRET" not in json.dumps(result)

@pytest.mark.parametrize("actual,state,attach", [(COLLECTION, "project_ready", True),
    (URL.replace("11111111", "99999999"), "project_mismatch", False),
    ("https://mail.google.com/", "project_mismatch", False)])
def test_wire_exact_target_and_project(actual, state, attach):
    async def scenario():
        from websockets.asyncio.server import serve
        commands = []
        async def handler(socket):
            async for data in socket:
                call = json.loads(data); commands.append(call)
                if call["method"] == "Target.getTargets":
                    result = {"targetInfos": [{"type": "page", "targetId": "chosen", "url": actual},
                                             {"type": "page", "targetId": "other", "url": URL}]}
                elif call["method"] == "Target.attachToTarget":
                    assert call["params"]["targetId"] == "chosen"; result = {"sessionId": "test-session"}
                elif call["method"] == "Runtime.evaluate":
                    assert call["params"]["throwOnSideEffect"] is True
                    assert call["params"]["expression"] == project.project_expression(URL)
                    result = {"result": {"value": MARKERS}}
                elif call["method"] == "Target.detachFromTarget":
                    result = {}
                else: pytest.fail("unexpected command")
                await socket.send(json.dumps({"id": call["id"], "result": result}))
        async with serve(handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            result = await project.inspect_project_endpoint(f"ws://127.0.0.1:{port}", "chosen", URL)
        assert result["state"] == state
        assert [c["method"] for c in commands] == (["Target.getTargets", "Target.attachToTarget", "Runtime.evaluate", "Target.detachFromTarget"] if attach else ["Target.getTargets"])
    asyncio.run(scenario())

def test_invalid_request_never_connects(monkeypatch):
    async def forbidden(**kwargs): pytest.fail("must not connect")
    monkeypatch.setattr(project, "run_browser_probe", forbidden)
    assert asyncio.run(project.check_flow_project("chosen", "https://evil.invalid"))["state"] == "invalid_project"
    assert asyncio.run(project.check_flow_project("bad/id", URL))["state"] == "target_unavailable"

def test_guard_failure_never_retries():
    assert project.project_result({"exceptionDetails": {"text": "SECRET"}}) == {"state": "read_blocked"}
