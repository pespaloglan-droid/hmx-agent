"""Protected browser metadata, configuration and explicit one-shot transport check."""

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, StrictBool
from starlette.concurrency import run_in_threadpool

from hermes_cli.browser_inventory import browser_configuration_status, discover_browsers
from hermes_cli.browser_connection_probe import run_browser_probe
from hermes_cli.browser_flow_check import check_flow_tab, list_flow_tabs
from hermes_cli.web_deps import late
from hermes_cli.web_routers._common import config_scoped_to_thread

router = APIRouter()
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
    target_id: str


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