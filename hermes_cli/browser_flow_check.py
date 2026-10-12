"""Explicit Flow-only metadata discovery and side-effect-guarded DOM marker check."""

from __future__ import annotations

import asyncio
import json
import re
from urllib.parse import urlsplit

from hermes_cli.browser_connection_probe import run_browser_probe, _QUIET_CDP_LOGGER

TARGET_ID = re.compile(r"[A-Za-z0-9-]{1,128}\Z")

# Fixed expression, never supplied by the caller. No clicks, navigation, account
# menus, storage, cookies, fetch, form values or project content. The origin guard
# runs before any DOM read, including if the tab navigated after discovery.
FLOW_MARKERS = """(() => {
  if (location.origin !== 'https://flow.google.com') return {origin_allowed:false};
  const visible = (el) => el.getBoundingClientRect().width > 0 &&
    el.getBoundingClientRect().height > 0 &&
    getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  const labels = Array.from(document.querySelectorAll('button,[role="button"],a'))
    .filter(visible).map(el => (el.innerText || '').replace(/\\s+/g, ' ').trim());
  return {
    origin_allowed:true,
    page_ready:document.readyState === 'complete',
    new_project_visible:labels.some(t => /(?:^|\\s)(new project|yeni proje|новый проект)$/i.test(t)),
    sign_in_visible:labels.some(t => /^(sign in|log in|giriş yap|oturum aç|войти)$/i.test(t))
  };
})()"""


def is_flow_url(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        url = urlsplit(value)
        return (url.scheme == "https" and url.hostname == "flow.google.com"
                and url.port in (None, 443) and not url.username and not url.password)
    except ValueError:
        return False


def flow_targets(infos: object) -> list[dict]:
    if not isinstance(infos, list):
        raise ValueError("invalid_reply")
    targets = []
    for row in infos:
        if not isinstance(row, dict) or row.get("type") != "page" or not is_flow_url(row.get("url")):
            continue
        target = row.get("targetId")
        if not isinstance(target, str) or not TARGET_ID.fullmatch(target):
            continue
        title = row.get("title")
        label = "".join(c for c in title if c.isprintable())[:100] if isinstance(title, str) else ""
        targets.append({"id": target, "label": label or "Google Flow",
                        "origin": "https://flow.google.com"})
        if len(targets) == 64:
            break
    return targets


class _CDP:
    def __init__(self, socket):
        self.socket = socket
        self.next_id = 0

    async def call(self, method, params=None, session=None):
        self.next_id += 1
        ident = self.next_id
        message = {"id": ident, "method": method, "params": params or {}}
        if session:
            message["sessionId"] = session
        await self.socket.send(json.dumps(message))
        for _ in range(64):
            reply = json.loads(await asyncio.wait_for(self.socket.recv(), timeout=10))
            if not isinstance(reply, dict):
                raise ValueError("invalid_reply")
            if reply.get("id") != ident:
                continue
            if reply.get("error"):
                raise RuntimeError("cdp_error")
            result = reply.get("result")
            if not isinstance(result, dict):
                raise ValueError("invalid_reply")
            return result
        raise ValueError("invalid_reply")


def marker_result(reply: dict) -> dict:
    if reply.get("exceptionDetails"):
        return {"state": "read_blocked"}
    remote = reply.get("result", {})
    value = remote.get("value") if isinstance(remote, dict) else None
    if not isinstance(value, dict):
        return {"state": "invalid_reply"}
    if value.get("origin_allowed") is not True:
        return {"state": "target_changed"}
    fields = ("page_ready", "new_project_visible", "sign_in_visible")
    if any(type(value.get(key)) is not bool for key in fields):
        return {"state": "invalid_reply"}
    markers = {key: value[key] for key in fields}
    state = "inconclusive"
    if markers["page_ready"]:
        if markers["new_project_visible"] and not markers["sign_in_visible"]:
            state = "workspace_visible"
        elif markers["sign_in_visible"] and not markers["new_project_visible"]:
            state = "login_prompt"
    return {"state": state, "markers": markers, "account_verified": False}


async def _inspect_target(cdp, target_id):
    session = (await cdp.call("Target.attachToTarget",
                             {"targetId": target_id, "flatten": True})).get("sessionId")
    if not isinstance(session, str) or not TARGET_ID.fullmatch(session):
        return {"state": "invalid_reply"}
    try:
        reply = await cdp.call("Runtime.evaluate", {
            "expression": FLOW_MARKERS, "returnByValue": True,
            "throwOnSideEffect": True, "timeout": 5000,
        }, session=session)
        return marker_result(reply)
    finally:
        # Detach only this test session; never close or navigate the page.
        await cdp.call("Target.detachFromTarget", {"sessionId": session})


async def _flow_operation(endpoint: str, target_id: str | None) -> dict:
    try:
        from websockets.asyncio.client import connect
    except ImportError:
        return {"state": "dependency_missing"}
    try:
        async with asyncio.timeout(75):
            async with connect(endpoint, proxy=None, open_timeout=60, close_timeout=1,
                               max_size=262144, ping_interval=None,
                               user_agent_header="HMX Flow read-only test", logger=_QUIET_CDP_LOGGER) as socket:
                cdp = _CDP(socket)
                targets = flow_targets((await cdp.call("Target.getTargets")).get("targetInfos"))
                if target_id is None:
                    return {"state": "listed", "targets": targets, "account_verified": False}
                if not any(row["id"] == target_id for row in targets):
                    return {"state": "target_unavailable"}
                return await _inspect_target(cdp, target_id)
    except TimeoutError:
        return {"state": "timeout"}
    except (ValueError, TypeError):
        return {"state": "invalid_reply"}
    except RuntimeError:
        return {"state": "read_blocked"}
    except Exception:
        return {"state": "connection_failed"}


async def list_flow_tabs() -> dict:
    async def check(endpoint):
        return await _flow_operation(endpoint, None)
    return await run_browser_probe(check=check)


async def check_flow_tab(target_id: str) -> dict:
    if not TARGET_ID.fullmatch(target_id):
        return {"state": "target_unavailable"}
    async def check(endpoint):
        return await _flow_operation(endpoint, target_id)
    return await run_browser_probe(check=check)