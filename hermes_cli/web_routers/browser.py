"""Browser panel phase 1: protected, read-only metadata and configuration."""

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from starlette.concurrency import run_in_threadpool

from hermes_cli.browser_inventory import browser_configuration_status, discover_browsers
from hermes_cli.web_deps import late
from hermes_cli.web_routers._common import config_scoped_to_thread

router = APIRouter()
_require_token = late("_require_token")
load_config = late("load_config", "hermes_cli.config")


class DiscoveryConsent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    consent: bool = False


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
    return await run_in_threadpool(discover_browsers)