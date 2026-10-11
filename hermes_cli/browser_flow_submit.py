"""One separately approved send-control click, not a production-success receipt."""
from __future__ import annotations

import asyncio
import hashlib
import json
import sqlite3
import uuid

from hermes_cli.browser_connection_probe import run_browser_probe, _QUIET_CDP_LOGGER
from hermes_cli.browser_flow_check import TARGET_ID, _CDP
from hermes_cli.browser_flow_project import canonical_project
from hermes_cli.browser_flow_stage import StageStore, build_stage_message

# Both evaluations execute the same synchronous guards. No editor rewriting,
# key events, account changes or fallback selectors. Prompt text is compared
# inside the browser and is never returned in the reply.
SUBMIT_EXPRESSION = r"""(() => {
  if (location.origin !== 'https://flow.google.com' || location.search || location.hash) return {state:'project_mismatch'};
  const match = /^\/project\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/collection\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})?\/?$/i.exec(location.pathname);
  if (!match || match[1].toLowerCase() !== EXPECTED_PROJECT) return {state:'project_mismatch'};
  const visible = el => el.isConnected && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden';
  const enabled = el => !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  if (document.readyState !== 'complete') return {state:'composer_blocked'};
  const editors = Array.from(document.querySelectorAll('textarea,[contenteditable="true"]')).filter(el=>visible(el) && enabled(el) && !el.readOnly);
  if (editors.length !== 1 || editors[0].tagName === 'TEXTAREA') return {state:'composer_blocked'};
  if ((editors[0].innerText || '').replace(/\r\n/g,'\n').trim() !== APPROVED_MESSAGE) return {state:'text_mismatch'};
  const agents = Array.from(document.querySelectorAll('flow-agent-mode-toggle-chip button.agent-mode-chip')).filter(visible);
  if (agents.length !== 1 || !enabled(agents[0]) || agents[0].getAttribute('aria-pressed') !== 'true') return {state:'agent_not_selected'};
  const buttons = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible);
  const label = el => (el.innerText || '').replace(/\s+/g,' ').trim();
  if (buttons.some(el=>/^(stop|stop generation|stop generating|durdur|остановить|stop_circle)$/i.test(label(el)) || /^(stop|stop generation|stop generating|durdur|остановить)$/i.test(el.getAttribute('aria-label') || ''))) return {state:'composer_blocked'};
  const send = buttons.filter(el=>/^(send|send prompt|submit|gönder|отправить|arrow_forward)$/i.test(label(el)) || /^(send|send prompt|submit|gönder|отправить)$/i.test(el.getAttribute('aria-label') || ''));
  if (send.length !== 1 || !enabled(send[0])) return {state:'composer_blocked'};
  SUBMIT_ACTION
})()"""

GUARD_STATES = {"project_mismatch", "composer_blocked", "text_mismatch", "agent_not_selected"}


def submit_expression(project: str, message: str, *, click: bool = False) -> str:
    canonical = canonical_project(project)
    if canonical is None:
        raise ValueError("invalid_project")
    action = "send[0].click(); return {state:'submit_clicked'};" if click else "return {state:'submit_ready'};"
    # Message LAST prevents literal placeholder words in user data becoming code.
    return SUBMIT_EXPRESSION.replace("EXPECTED_PROJECT", json.dumps(canonical.rsplit("/", 1)[1])).replace(
        "SUBMIT_ACTION", action).replace("APPROVED_MESSAGE", json.dumps(message, ensure_ascii=True))


def reply_state(reply: dict, allowed: set[str], fallback: str) -> str:
    value = reply.get("result", {}).get("value") if isinstance(reply.get("result"), dict) else None
    state = value.get("state") if isinstance(value, dict) else None
    return state if not reply.get("exceptionDetails") and state in allowed else fallback


async def submit_endpoint(endpoint: str, store: StageStore, record: dict, message: str) -> dict:
    try:
        from websockets.asyncio.client import connect
        from websockets.exceptions import WebSocketException
    except ImportError:
        return {"state": "dependency_missing", "production_submitted": False}
    claimed = False
    try:
        async with asyncio.timeout(75):
            async with connect(endpoint, proxy=None, open_timeout=60, close_timeout=1,
                               max_size=262144, ping_interval=None, logger=_QUIET_CDP_LOGGER,
                               user_agent_header="HMX Flow approved test submission") as socket:
                cdp = _CDP(socket)
                infos = (await cdp.call("Target.getTargets")).get("targetInfos")
                if not isinstance(infos, list):
                    return {"state": "invalid_reply", "production_submitted": False}
                target = next((row for row in infos if isinstance(row, dict) and
                               row.get("targetId") == record["target"] and row.get("type") == "page"), None)
                if target is None:
                    return {"state": "target_unavailable", "production_submitted": False}
                if canonical_project(target.get("url")) != record["project"]:
                    return {"state": "project_mismatch", "production_submitted": False}
                session = (await cdp.call("Target.attachToTarget", {
                    "targetId": record["target"], "flatten": True})).get("sessionId")
                if not isinstance(session, str) or not TARGET_ID.fullmatch(session):
                    return {"state": "invalid_reply", "production_submitted": False}
                try:
                    reply = await cdp.call("Runtime.evaluate", {
                        "expression": submit_expression(record["project"], message),
                        "returnByValue": True, "throwOnSideEffect": True, "timeout": 5000}, session=session)
                    state = reply_state(reply, GUARD_STATES | {"submit_ready"}, "read_blocked")
                    if state != "submit_ready":
                        return {"state": state, "production_submitted": False}
                    claimed = await asyncio.to_thread(store.claim_submission, record["id"], record["digest"], record["count"])
                    if not claimed:
                        return {"state": "submission_fenced", "production_submitted": None}
                    reply = await cdp.call("Runtime.evaluate", {
                        "expression": submit_expression(record["project"], message, click=True),
                        "returnByValue": True, "userGesture": True, "timeout": 5000}, session=session)
                    state = reply_state(reply, GUARD_STATES | {"submit_clicked"}, "submission_uncertain")
                    # A click does not prove server acceptance, output count or spending.
                    result = {"state": state, "production_submitted": False if state in GUARD_STATES else None}
                    await asyncio.to_thread(store.finish, record["id"], result)
                    return result
                finally:
                    await cdp.call("Target.detachFromTarget", {"sessionId": session})
    except (OSError, TimeoutError, ValueError, TypeError, RuntimeError, sqlite3.Error, WebSocketException):
        return {"state": "submission_uncertain" if claimed else "connection_failed",
                "production_submitted": None if claimed else False}


async def submit_flow_stage(store: StageStore, stage_id: str, items: list[dict]) -> dict:
    try:
        if str(uuid.UUID(stage_id)) != stage_id:
            raise ValueError("invalid_id")
        message = build_stage_message(items)
    except (ValueError, TypeError):
        return {"state": "invalid_request", "production_submitted": False}
    record = await asyncio.to_thread(store.lookup, stage_id)
    if record is None:
        return {"state": "not_found", "production_submitted": False}
    if record["state"] != "text_staged":
        return {"state": "submission_fenced", "production_submitted": None, "stage_id": stage_id}
    if record["digest"] != hashlib.sha256(message.encode()).hexdigest() or record["count"] != len(items):
        return {"state": "text_mismatch", "production_submitted": False}
    async def check(endpoint):
        return await submit_endpoint(endpoint, store, record, message)
    result = await run_browser_probe(check=check)
    result = {"production_submitted": False, **result}
    # Preserve permanent fence on failures after claim; never overwrite another
    # concurrent request's receipt when this request lost the compare-and-swap.
    if result["state"] == "submission_uncertain":
        await asyncio.to_thread(store.finish, stage_id, result)
    return {**result, "stage_id": stage_id}