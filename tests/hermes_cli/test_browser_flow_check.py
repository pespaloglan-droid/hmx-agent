"""Flow-only checks against synthetic local CDP; no real browser/accounts."""

import asyncio
import json

import pytest

from hermes_cli import browser_flow_check as flow


@pytest.mark.parametrize("url,allowed", [
    ("https://flow.google.com/", True),
    ("https://flow.google.com:443/project/fixture?private=SECRET", True),
    ("http://flow.google.com/", False),
    ("https://flow.google.com.evil.invalid/", False),
    ("https://flow.google.com@evil.invalid/", False),
    ("https://user:pass@flow.google.com/", False),
    ("https://flow.google.com:9222/", False),
    ("https://labs.google/fx/tools/flow", False),
    (None, False),
])
def test_exact_flow_origin(url, allowed):
    assert flow.is_flow_url(url) is allowed


INFOS = [
    {"type": "page", "targetId": "flow-1", "title": "Google Flow",
     "url": "https://flow.google.com/?secret=PRIVATE"},
    {"type": "page", "targetId": "flow-2", "title": "Another Flow tab",
     "url": "https://flow.google.com/project/PRIVATE"},
    {"type": "page", "targetId": "mail", "title": "SECRET unrelated account",
     "url": "https://mail.google.com/"},
    {"type": "service_worker", "targetId": "worker", "title": "SECRET worker",
     "url": "https://flow.google.com/"},
]
MARKERS = {"origin_allowed": True, "page_ready": True,
           "new_project_visible": True, "sign_in_visible": False}


def test_listing_filters_other_sites_workers_paths_and_queries():
    assert flow.flow_targets(INFOS) == [
        {"id": "flow-1", "label": "Google Flow", "origin": "https://flow.google.com"},
        {"id": "flow-2", "label": "Another Flow tab", "origin": "https://flow.google.com"},
    ]


@pytest.mark.parametrize("markers,state", [
    (MARKERS, "workspace_visible"),
    ({**MARKERS, "new_project_visible": False, "sign_in_visible": True}, "login_prompt"),
    ({**MARKERS, "sign_in_visible": True}, "inconclusive"),
    ({**MARKERS, "page_ready": False}, "inconclusive"),
    ({"origin_allowed": False}, "target_changed"),
    ({**MARKERS, "page_ready": "SECRET"}, "invalid_reply"),
])
def test_markers_never_prove_account_identity(markers, state):
    result = flow.marker_result({"result": {"value": {**markers, "email": "SECRET"}}})
    assert result["state"] == state
    assert result.get("account_verified", False) is False
    assert "SECRET" not in json.dumps(result)


@pytest.mark.parametrize("target,state,methods", [
    (None, "listed", ["Target.getTargets"]),
    ("mail", "target_unavailable", ["Target.getTargets"]),
    ("closed-flow", "target_unavailable", ["Target.getTargets"]),
    ("flow-1", "workspace_visible", ["Target.getTargets", "Target.attachToTarget",
                                   "Runtime.evaluate", "Target.detachFromTarget"]),
])
def test_wire_only_attaches_to_explicit_allowed_target(target, state, methods):
    async def scenario():
        from websockets.asyncio.server import serve
        commands = []
        closed = asyncio.Event()
        async def handler(socket):
            try:
                async for payload in socket:
                    command = json.loads(payload)
                    commands.append(command)
                    method = command["method"]
                    if method == "Target.getTargets":
                        result = {"targetInfos": INFOS}
                    elif method == "Target.attachToTarget":
                        assert command["params"] == {"targetId": "flow-1", "flatten": True}
                        result = {"sessionId": "session-1"}
                    elif method == "Runtime.evaluate":
                        assert command["sessionId"] == "session-1"
                        assert command["params"]["throwOnSideEffect"] is True
                        assert command["params"]["returnByValue"] is True
                        result = {"result": {"value": MARKERS}}
                    elif method == "Target.detachFromTarget":
                        assert command["params"] == {"sessionId": "session-1"}
                        result = {}
                    else:
                        pytest.fail(f"Unexpected operation: {method}")
                    await socket.send(json.dumps({"id": command["id"], "result": result}))
            finally:
                closed.set()
        async with serve(handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            result = await flow._flow_operation(f"ws://127.0.0.1:{port}", target)
            await asyncio.wait_for(closed.wait(), timeout=5)
        assert result["state"] == state
        assert [row["method"] for row in commands] == methods
        assert "SECRET" not in json.dumps(result)
        assert "PRIVATE" not in json.dumps(result)
        assert result.get("account_verified", False) is False
    asyncio.run(scenario())


def test_side_effect_guard_failure_does_not_retry_with_broader_access():
    result = flow.marker_result({"exceptionDetails": {"text": "SECRET side effect"}})
    assert result == {"state": "read_blocked"}


def test_invalid_target_never_opens_a_connection(monkeypatch):
    async def forbidden(**kwargs):
        pytest.fail("must not connect")
    monkeypatch.setattr(flow, "run_browser_probe", forbidden)
    assert asyncio.run(flow.check_flow_tab("https://evil.invalid/")) == {
        "state": "target_unavailable",
    }