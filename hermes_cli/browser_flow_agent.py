"""Explicit read-only diagnostics for the exact Agent predicate; no prompt reads."""
from __future__ import annotations

import asyncio
import json
import uuid

from hermes_cli.browser_connection_probe import run_browser_probe
from hermes_cli.browser_flow_check import TARGET_ID
from hermes_cli.browser_flow_project import canonical_project, inspect_project_endpoint
from hermes_cli.browser_flow_stage import StageStore

# Shared with the submission guard. Only bounded counts, booleans and a closed
# attribute enum leave the browser; neither labels nor prompt text are returned.
AGENT_MARKERS = r"""
  const agentNodes = Array.from(document.querySelectorAll('button.agent-mode-chip'));
  const agents = agentNodes.filter(visible);
  const pressed = agents.length === 1 ? agents[0].getAttribute('aria-pressed') : null;
  const agentMarkers = {
    agent_total_count: agentNodes.length,
    agent_visible_count: agents.length,
    agent_selected_visible_count: agents.filter(el=>el.getAttribute('aria-pressed') === 'true').length,
    agent_enabled: agents.length === 1 && enabled(agents[0]),
    agent_pressed: agents.length !== 1 ? 'none' : pressed === 'true' ? 'true' : pressed === 'false' ? 'false' : 'unknown'
  };
"""
AGENT_EXPRESSION = r"""(() => {
  if (location.origin !== 'https://flow.google.com' || location.search || location.hash) return {project_match:false};
  const match = /^\/project\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/collection\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})?\/?$/i.exec(location.pathname);
  if (!match || match[1].toLowerCase() !== EXPECTED_PROJECT) return {project_match:false};
  const visible = el => el.isConnected && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden';
  const enabled = el => !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  AGENT_CHECK
  return {project_match:true, markers:agentMarkers};
})()"""


def agent_expression(project: str) -> str:
    canonical = canonical_project(project)
    if canonical is None:
        raise ValueError('invalid_project')
    return AGENT_EXPRESSION.replace('AGENT_CHECK', AGENT_MARKERS).replace(
        'EXPECTED_PROJECT', json.dumps(canonical.rsplit('/', 1)[1]))


def _markers(value: dict) -> dict | None:
    names = ('agent_total_count', 'agent_visible_count', 'agent_selected_visible_count')
    counts = [value.get(name) for name in names]
    if any(type(count) is not int or not 0 <= count <= 128 for count in counts):
        return None
    total, visible, selected = counts
    if not selected <= visible <= total or type(value.get('agent_enabled')) is not bool:
        return None
    pressed = value.get('agent_pressed')
    if pressed not in ('true', 'false', 'unknown', 'none'):
        return None
    if visible == 1:
        if pressed == 'none' or selected != int(pressed == 'true'):
            return None
    elif pressed != 'none' or value['agent_enabled']:
        return None
    return {**dict(zip(names, counts)), 'agent_enabled': value['agent_enabled'], 'agent_pressed': pressed}


def _agent_state(markers: dict) -> str:
    count = markers['agent_visible_count']
    if count == 0:
        return 'agent_missing'
    if count > 1:
        return 'agent_ambiguous'
    if not markers['agent_enabled']:
        return 'agent_disabled'
    return {'true': 'agent_selected', 'false': 'agent_inactive', 'unknown': 'agent_unknown'}[markers['agent_pressed']]


def agent_result(reply: dict) -> dict:
    result = reply.get('result')
    value = result.get('value') if isinstance(result, dict) else None
    base = {'production_authorized': False}
    if reply.get('exceptionDetails') or not isinstance(value, dict):
        return {**base, 'state': 'read_blocked'}
    if value.get('project_match') is not True:
        return {**base, 'state': 'project_mismatch'}
    raw_markers = value.get("markers")
    markers = _markers(raw_markers) if isinstance(raw_markers, dict) else None
    if markers is None:
        return {**base, 'state': 'invalid_reply'}
    return {**base, 'state': _agent_state(markers), 'markers': markers}


async def inspect_flow_stage_agent(store: StageStore, stage_id: str) -> dict:
    base = {'production_authorized': False}
    try:
        if str(uuid.UUID(stage_id)) != stage_id:
            raise ValueError('invalid_id')
    except (ValueError, TypeError, AttributeError):
        return {**base, 'state': 'invalid_request'}
    record = await asyncio.to_thread(store.lookup, stage_id)
    if record is None:
        return {**base, 'state': 'not_found'}
    project = canonical_project(record['project'])
    if project is None or not TARGET_ID.fullmatch(record['target']):
        return {**base, 'state': 'invalid_request'}
    async def check(endpoint):
        return await inspect_project_endpoint(endpoint, record['target'], project,
                                              expression=agent_expression(project), read_result=agent_result)
    result = await run_browser_probe(check=check)
    return {**result, **base, 'stage_id': stage_id}
