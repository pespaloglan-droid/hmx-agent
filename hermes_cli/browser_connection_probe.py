"""Explicit, one-shot Windows Chrome transport check. Never select or drive tabs."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from hermes_platform.host import facts

# This lock protects an OS-user browser resource, not a Hermes agent profile.
# It intentionally prevents two approval prompts from this dashboard process.
_PROBE_LOCK = threading.Lock()

# Private logger: never emit raw CDP frames or endpoints, even with global DEBUG.
_QUIET_CDP_LOGGER = logging.Logger("hmx.private_cdp")
_QUIET_CDP_LOGGER.disabled = True


def read_chrome_endpoint(root: Path) -> str:
    """Read only the fixed Chrome discovery file; never accept client paths."""
    path = root / "DevToolsActivePort"
    for part in (path, *path.parents):
        if part.is_symlink() or (hasattr(part, "is_junction") and part.is_junction()):
            raise ValueError("invalid_discovery")
    if not path.exists():
        raise FileNotFoundError
    if not path.is_file() or path.stat().st_size > 4096:
        raise ValueError("invalid_discovery")
    with path.open("rb") as stream:
        raw = stream.read(4097)
    if len(raw) > 4096:
        raise ValueError("invalid_discovery")
    lines = raw.decode("utf-8-sig").strip().splitlines()
    if len(lines) != 2:
        raise ValueError("invalid_discovery")
    port, browser_path = lines
    if not re.fullmatch(r"[0-9]{1,5}", port) or not 1 <= int(port) <= 65535:
        raise ValueError("invalid_discovery")
    if not re.fullmatch(r"/devtools/browser/[A-Za-z0-9-]+", browser_path):
        raise ValueError("invalid_discovery")
    return f"ws://127.0.0.1:{int(port)}{browser_path}"


async def probe_endpoint(endpoint: str) -> dict:
    """Only Browser.getVersion, with bounded approval/read/close timeouts."""
    try:
        from websockets.asyncio.client import connect
    except ImportError:
        return {"state": "dependency_missing"}
    try:
        async with connect(endpoint, proxy=None, open_timeout=60, close_timeout=1,
                           max_size=4096, ping_interval=None,
                           user_agent_header="HMX Chrome connection test", logger=_QUIET_CDP_LOGGER) as socket:
            await socket.send(json.dumps({"id": 1, "method": "Browser.getVersion"}))
            reply = json.loads(await asyncio.wait_for(socket.recv(), timeout=10))
            result = reply.get("result", {}) if isinstance(reply, dict) else {}
            product = result.get("product") if isinstance(result, dict) else None
            protocol = result.get("protocolVersion") if isinstance(result, dict) else None
            if (not isinstance(reply, dict) or reply.get("id") != 1 or reply.get("error")
                    or not isinstance(product, str) or not re.fullmatch(r"Chrome/[0-9.]+", product)
                    or not isinstance(protocol, str) or not re.fullmatch(r"[0-9.]+", protocol)):
                return {"state": "invalid_reply"}
            return {"state": "reachable", "product": product, "protocol_version": protocol}
    except TimeoutError:
        return {"state": "timeout"}
    except (ValueError, TypeError):
        return {"state": "invalid_reply"}
    except Exception:
        # Don't leak WebSocket IDs, paths, page data or raw library errors.
        return {"state": "connection_failed"}


async def probe_chrome_root(root: Path, *, check=None) -> dict:
    """OS-independent core, also usable with a synthetic discovery fixture."""
    if not _PROBE_LOCK.acquire(blocking=False):
        return {"state": "busy"}
    try:
        try:
            endpoint = await asyncio.to_thread(read_chrome_endpoint, root)
        except FileNotFoundError:
            return {"state": "not_found"}
        except (ValueError, UnicodeError):
            return {"state": "invalid_discovery"}
        except OSError:
            return {"state": "discovery_unavailable"}
        result = await (check or probe_endpoint)(endpoint)
        return {**result, "checked_at": datetime.now(timezone.utc).isoformat()}
    finally:
        _PROBE_LOCK.release()


async def run_browser_probe(*, check=None) -> dict:
    if facts.os_family() != "win32":
        return {"state": "unsupported_platform"}
    from hermes_cli.browser_connect import real_profile_data_dir
    root = real_profile_data_dir("chrome")
    return await probe_chrome_root(Path(root), check=check) if root else {"state": "not_found"}