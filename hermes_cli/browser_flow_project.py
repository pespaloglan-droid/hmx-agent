"""Exact-project, read-only composer preflight. Never fill, click or submit."""
from __future__ import annotations

import asyncio
import json
import re
from urllib.parse import urlsplit

from hermes_cli.browser_connection_probe import run_browser_probe
from hermes_cli.browser_flow_check import TARGET_ID, _CDP, _QUIET_CDP_LOGGER

UUID = r"[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"
PROJECT_PATH = re.compile(rf"/project/({UUID})(?:/collection/{UUID})?/?\Z")


def canonical_project(value: object) -> str | None:
    if not isinstance(value, str) or len(value) > 512:
        return None
    try:
        url = urlsplit(value.strip())
        if (url.scheme != "https" or url.hostname != "flow.google.com" or url.port not in (None, 443)
                or url.username or url.password or url.query or url.fragment):
            return None
        match = PROJECT_PATH.fullmatch(url.path)
        return f"https://flow.google.com/project/{match[1].lower()}" if match else None
    except ValueError:
        return None


# The exact origin and project guards execute synchronously before any DOM reads.
# Read lengths/counts only: no prompt content, account text, cookies or attributes returned.
PROJECT_EXPRESSION = r"""(() => {
  if (location.origin !== 'https://flow.google.com') return {project_match:false};
  const match = /^\/project\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/collection\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})?\/?$/i.exec(location.pathname);
  if (!match || match[1].toLowerCase() !== EXPECTED_PROJECT) return {project_match:false};
  const visible = el => el.getBoundingClientRect().width > 0 &&
    el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden';
  const editors = Array.from(document.querySelectorAll('textarea,[contenteditable="true"]'))
    .filter(el => visible(el) && !el.disabled && !el.readOnly);
  const labels = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)
    .map(el => ({label:(el.innerText || '').replace(/\s+/g,' ').trim(),
      aria:(el.getAttribute('aria-label') || '').trim(),disabled:!!el.disabled || el.getAttribute('aria-disabled') === 'true'}));
  const has = pattern => labels.some(el => pattern.test(el.label) || pattern.test(el.aria));
  const send = labels.filter(el => /^(send|send prompt|submit|gönder|отправить|arrow_forward)$/i.test(el.label) ||
    /^(send|send prompt|submit|gönder|отправить)$/i.test(el.aria));
  return {project_match:true,page_ready:document.readyState === 'complete',
    textarea_count:editors.filter(el => el.tagName === 'TEXTAREA').length,
    contenteditable_count:editors.filter(el => el.tagName !== 'TEXTAREA').length,
    composer_empty:editors.length === 1 && (editors[0].tagName === 'TEXTAREA' ?
      editors[0].value.length === 0 : (editors[0].textContent || '').trim().length === 0),
    agent_mode_visible:has(/^(agent|ajan|агент)$/i),
    stop_button_visible:has(/^(stop|stop generation|stop generating|durdur|остановить|stop_circle)$/i),
    send_button_count:send.length,send_enabled:send.length === 1 && !send[0].disabled};
})()"""


def project_expression(project: str) -> str:
    # Project is validated again here; never interpolate caller JS or arbitrary URLs.
    canonical = canonical_project(project)
    if canonical is None:
        raise ValueError("invalid_project")
    return PROJECT_EXPRESSION.replace("EXPECTED_PROJECT", json.dumps(canonical.rsplit("/", 1)[1]))


def project_result(reply: dict) -> dict:
    if reply.get("exceptionDetails"):
        return {"state": "read_blocked"}
    value = reply.get("result", {}).get("value") if isinstance(reply.get("result"), dict) else None
    if not isinstance(value, dict) or type(value.get("project_match")) is not bool:
        return {"state": "invalid_reply"}
    if not value["project_match"]:
        return {"state": "project_mismatch"}
    boolean_fields = ("page_ready", "composer_empty", "agent_mode_visible", "stop_button_visible", "send_enabled")
    count_fields = ("textarea_count", "contenteditable_count", "send_button_count")
    if (any(type(value.get(k)) is not bool for k in boolean_fields) or
            any(type(value.get(k)) is not int or not 0 <= value[k] <= 128 for k in count_fields)):
        return {"state": "invalid_reply"}
    markers = {k: value[k] for k in (*boolean_fields, *count_fields)}
    ready = (markers["page_ready"] and markers["composer_empty"] and markers["agent_mode_visible"]
             and not markers["stop_button_visible"] and
             markers["textarea_count"] + markers["contenteditable_count"] == 1 and markers["send_button_count"] == 1)
    return {"state": "project_ready" if ready else "project_inconclusive", "markers": markers,
            "account_verified": False, "production_authorized": False}


async def inspect_project_endpoint(endpoint: str, target_id: str, project: str, *,
                                   expression: str | None = None, read_result=project_result) -> dict:
    try:
        from websockets.asyncio.client import connect
    except ImportError:
        return {"state": "dependency_missing"}
    try:
        expression = project_expression(project) if expression is None else expression
        async with asyncio.timeout(75):
            async with connect(endpoint, proxy=None, open_timeout=60, close_timeout=1,
                               max_size=262144, ping_interval=None, logger=_QUIET_CDP_LOGGER,
                               user_agent_header="HMX Flow project preflight") as socket:
                cdp = _CDP(socket)
                infos = (await cdp.call("Target.getTargets")).get("targetInfos")
                if not isinstance(infos, list):
                    return {"state": "invalid_reply"}
                target = next((row for row in infos if isinstance(row, dict) and row.get("targetId") == target_id
                               and row.get("type") == "page"), None)
                if target is None:
                    return {"state": "target_unavailable"}
                if canonical_project(target.get("url")) != canonical_project(project):
                    return {"state": "project_mismatch"}
                session = (await cdp.call("Target.attachToTarget", {"targetId": target_id, "flatten": True})).get("sessionId")
                if not isinstance(session, str) or not TARGET_ID.fullmatch(session):
                    return {"state": "invalid_reply"}
                try:
                    reply = await cdp.call("Runtime.evaluate", {"expression": expression, "returnByValue": True,
                                                               "throwOnSideEffect": True, "timeout": 5000}, session=session)
                    return read_result(reply)
                finally:
                    await cdp.call("Target.detachFromTarget", {"sessionId": session})
    except TimeoutError:
        return {"state": "timeout"}
    except (ValueError, TypeError):
        return {"state": "invalid_reply"}
    except RuntimeError:
        return {"state": "read_blocked"}
    except Exception:
        return {"state": "connection_failed"}


async def check_flow_project(target_id: str, project_url: str) -> dict:
    project = canonical_project(project_url)
    if project is None:
        return {"state": "invalid_project"}
    if not TARGET_ID.fullmatch(target_id):
        return {"state": "target_unavailable"}
    async def check(endpoint):
        return await inspect_project_endpoint(endpoint, target_id, project)
    return await run_browser_probe(check=check)
