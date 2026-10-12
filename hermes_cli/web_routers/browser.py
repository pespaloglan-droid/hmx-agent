"""Protected browser metadata, configuration and explicit one-shot transport check."""

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool, ValidationError
from starlette.concurrency import run_in_threadpool

from hermes_cli.browser_inventory import browser_configuration_status, discover_browsers
from hermes_cli.browser_connection_probe import run_browser_probe
from hermes_cli.browser_flow_check import check_flow_tab, list_flow_tabs
from hermes_cli.browser_flow_project import check_flow_project
from hermes_cli.browser_flow_stage import StageStore, stage_flow_text
from hermes_cli.browser_flow_submit import submit_flow_stage
from hermes_cli.browser_flow_agent import inspect_flow_stage_agent
from hermes_constants import get_hermes_home
from hermes_cli.web_deps import late
from hermes_cli.web_routers._common import config_scoped_to_thread, destructive_profile

from hermes_cli.web_routers.browser_connector import router as connector_router

router = APIRouter()
router.include_router(connector_router)
_require_token = late("_require_token")
load_config = late("load_config", "hermes_cli.config")


class DiscoveryConsent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    consent: bool = False
    include_emails: StrictBool = False


class ProbeConsent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    consent: StrictBool = False


class FlowTargetConsent(ProbeConsent):
    target_id: str = Field(min_length=1, max_length=128)


class FlowProjectConsent(FlowTargetConsent):
    project_url: str = Field(min_length=1, max_length=512)


class StageItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=3000)


class FlowStageRequest(FlowProjectConsent):
    stage_id: str = Field(min_length=36, max_length=36)
    items: list[StageItem] = Field(min_length=1, max_length=2)
    fill_consent: StrictBool = False


class FlowSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stage_id: str = Field(min_length=36, max_length=36)
    items: list[StageItem] = Field(min_length=1, max_length=2)
    submit_consent: StrictBool = False
    settings_confirmed: StrictBool = False


class FlowAgentRequest(ProbeConsent):
    stage_id: str = Field(min_length=36, max_length=36)
    current_target_id: str | None = Field(default=None, min_length=1, max_length=128, pattern=r"^[A-Za-z0-9-]+$")


@router.post("/api/browser/flow/stage/agent-check")
async def browser_flow_agent_check(request: Request, profile: Optional[str] = None):
    _require_token(request)
    raw = await request.body()
    if len(raw) > 2048 or request.headers.get("content-type", "").split(";", 1)[0] != "application/json":
        raise HTTPException(status_code=422, detail="Invalid Agent diagnostic request")
    try:
        body = FlowAgentRequest.model_validate_json(raw)
    except ValidationError:
        raise HTTPException(status_code=422, detail="Invalid Agent diagnostic request")
    if body.consent is not True:
        raise HTTPException(status_code=400, detail="Read-only Agent diagnostic consent is required")
    profile = destructive_profile(profile, "Flow Agent diagnostic")
    path = await config_scoped_to_thread(profile, lambda: get_hermes_home() / "hmx-flow-stages.sqlite3")
    if body.current_target_id is None:
        return await inspect_flow_stage_agent(StageStore(path), body.stage_id)
    return await inspect_flow_stage_agent(StageStore(path), body.stage_id, current_target_id=body.current_target_id)


@router.post("/api/browser/flow/stage/submit")
async def browser_flow_submit(request: Request, profile: Optional[str] = None):
    _require_token(request)
    raw = await request.body()
    if len(raw) > 65536 or request.headers.get("content-type", "").split(";", 1)[0] != "application/json":
        raise HTTPException(status_code=422, detail="Invalid Flow submission request")
    try:
        body = FlowSubmitRequest.model_validate_json(raw)
    except ValidationError:
        raise HTTPException(status_code=422, detail="Invalid Flow submission request")
    if body.submit_consent is not True or body.settings_confirmed is not True:
        raise HTTPException(status_code=400, detail="Separate production consent and settings confirmation are required")
    profile = destructive_profile(profile, "Flow test submission")
    path = await config_scoped_to_thread(profile, lambda: get_hermes_home() / "hmx-flow-stages.sqlite3")
    return await submit_flow_stage(StageStore(path), body.stage_id, [item.model_dump() for item in body.items])


@router.post("/api/browser/flow/stage")
async def browser_flow_stage(request: Request, profile: Optional[str] = None):
    _require_token(request)
    # Safe validation errors: never echo submitted prompt text into API error logs.
    raw = await request.body()
    if len(raw) > 65536 or request.headers.get("content-type", "").split(";", 1)[0] != "application/json":
        raise HTTPException(status_code=422, detail="Invalid composer staging request")
    try:
        body = FlowStageRequest.model_validate_json(raw)
    except ValidationError:
        raise HTTPException(status_code=422, detail="Invalid composer staging request")
    if body.consent is not True or body.fill_consent is not True:
        raise HTTPException(status_code=400, detail="Separate composer-write consent is required")
    profile = destructive_profile(profile, "Flow composer staging")
    path = await config_scoped_to_thread(profile, lambda: get_hermes_home() / "hmx-flow-stages.sqlite3")
    return await stage_flow_text(StageStore(path), body.stage_id, body.target_id, body.project_url,
                                 [item.model_dump() for item in body.items])


@router.get("/api/browser/flow/stage/{stage_id}")
async def browser_flow_stage_status(request: Request, stage_id: str, profile: Optional[str] = None):
    _require_token(request)
    from uuid import UUID
    try:
        if str(UUID(stage_id)) != stage_id:
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid stage ID")
    profile = destructive_profile(profile, "Flow composer stage status")
    return await config_scoped_to_thread(profile, lambda: StageStore(get_hermes_home() / "hmx-flow-stages.sqlite3").status(stage_id))


@router.post("/api/browser/flow/project")
async def browser_flow_project(request: Request, body: FlowProjectConsent):
    _require_token(request)
    if body.consent is not True:
        raise HTTPException(status_code=400, detail="Flow project preflight consent is required")
    return await check_flow_project(body.target_id, body.project_url)


@router.post("/api/browser/flow/tabs")
async def browser_flow_tabs(request: Request, body: ProbeConsent):
    _require_token(request)
    if body.consent is not True:
        raise HTTPException(status_code=400, detail="Flow tab metadata consent is required")
    return await list_flow_tabs()


@router.post("/api/browser/flow/check")
async def browser_flow_check(request: Request, body: FlowTargetConsent):
    _require_token(request)
    if body.consent is not True:
        raise HTTPException(status_code=400, detail="Flow read-only check consent is required")
    return await check_flow_tab(body.target_id)


@router.post("/api/browser/probe")
async def browser_probe(request: Request, body: ProbeConsent):
    _require_token(request)
    if body.consent is not True:
        raise HTTPException(status_code=400, detail="Chrome connection test requires consent")
    # No profile ID: discovery selections aren't proof of Chrome identity.
    # No persistence, config mutation, fallback launch, tab or account access.
    return await run_browser_probe()


@router.get("/api/browser/status")
async def browser_status(request: Request, profile: Optional[str] = None):
    _require_token(request)
    return await config_scoped_to_thread(
        profile, lambda: browser_configuration_status(load_config()))


@router.post("/api/browser/discover")
async def browser_discover(request: Request, body: DiscoveryConsent):
    _require_token(request)
    if body.consent is not True:
        raise HTTPException(status_code=400, detail="Browser metadata discovery requires consent")
    # OS browser profiles belong to the server's user, not Hermes agent profiles.
    # No caller-controlled path, no network probe and no browser launch.
    return await run_in_threadpool(discover_browsers, include_emails=body.include_emails)