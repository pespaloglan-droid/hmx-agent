"""Read-only browser metadata inventory. Never launch, copy, or attach a browser.

Discovery is explicitly requested by the dashboard user. Only the profile
directory names and display names in Local State are exposed by default. A
separate opt-in may expose the recorded account email, not account credentials.
Cookies, passwords, encryption keys and full filesystem paths are never returned.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

MAX_STATE_BYTES = 8 * 1024 * 1024
MAX_PROFILES = 256
PROFILE_DIR = re.compile(r"(?:Default|Profile [0-9]+)\Z")
BROWSERS = (("chrome", "Google Chrome"), ("edge", "Microsoft Edge"),
            ("brave", "Brave"), ("chromium", "Chromium"))


def _safe_directory(path: Path) -> bool:
    # Do not traverse profile symlinks/junctions into unrelated directories.
    for part in (path, *path.parents):
        if part.is_symlink() or (hasattr(part, "is_junction") and part.is_junction()):
            return False
    return path.is_dir()


def _label(value: object, fallback: str) -> str:
    if not isinstance(value, str) or "@" in value:
        return fallback
    text = "".join(c for c in value if c.isprintable()).strip()
    return text[:100] or fallback


def _email(value: object) -> str | None:
    """Return only a plausible recorded email; never infer it from the label."""
    if not isinstance(value, str):
        return None
    value = value.strip()
    if len(value) > 254 or not value.isprintable():
        return None
    return value if re.fullmatch(r"[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+", value) else None


def inspect_profiles(root: Path, *, include_emails: bool = False) -> tuple[list[dict], str | None]:
    """Inspect one fixed browser data root, without reading profile contents."""
    try:
        if not _safe_directory(root):
            return [], "not_found_or_unsupported_path"
        cache = {}
        warning = None
        state = root / "Local State"
        if state.exists():
            if state.is_symlink() or state.stat().st_size > MAX_STATE_BYTES:
                warning = "metadata_unavailable"
            else:
                try:
                    # Bounded read even if the file grows after stat().
                    with state.open("rb") as stream:
                        raw = stream.read(MAX_STATE_BYTES + 1)
                    if len(raw) > MAX_STATE_BYTES:
                        raise ValueError("oversized metadata")
                    data = json.loads(raw)
                    cache = data.get("profile", {}).get("info_cache", {})
                    if not isinstance(cache, dict):
                        cache = {}
                        warning = "metadata_unavailable"
                except (ValueError, AttributeError, OSError):
                    warning = "metadata_unavailable"
        rows = []
        # Enumerate Default / Profile N only; never inspect files inside them.
        for child in root.iterdir():
            if not PROFILE_DIR.fullmatch(child.name) or not _safe_directory(child):
                continue
            entry = cache.get(child.name, {})
            name = entry.get("name") if isinstance(entry, dict) else None
            rows.append({"directory": child.name, "label": _label(name, child.name),
                         "connection_state": "not_connected", "site_session": "not_checked"})
            if include_emails:
                rows[-1]["email"] = _email(entry.get("user_name")) if isinstance(entry, dict) else None
            if len(rows) >= MAX_PROFILES:
                warning = "profile_limit"
                break
        return sorted(rows, key=lambda row: row["directory"]), warning
    except PermissionError:
        return [], "access_denied"
    except OSError:
        return [], "discovery_failed"


def discover_browsers(*, include_emails: bool = False) -> dict:
    from hermes_cli.browser_connect import chromium_executable, real_profile_data_dir

    browsers = []
    for key, label in BROWSERS:
        try:
            root = real_profile_data_dir(key)
            profiles, warning = (inspect_profiles(Path(root), include_emails=include_emails)
                                 if root else ([], "unsupported_platform"))
            installed = bool(chromium_executable(key))
        except OSError:
            profiles, warning, installed = [], "discovery_failed", False
        browsers.append({
            "id": key, "label": label, "installed": installed, "warning": warning,
            "profiles": [{"id": f"{key}:{row['directory']}", **row} for row in profiles],
        })
    return {"browsers": browsers, "read_only": True, "emails_included": include_emails}


def browser_configuration_status(config: dict) -> dict:
    """Configuration is NOT a connection health check. Do not expose CDP URLs."""
    browser = config.get("browser", {})
    if not isinstance(browser, dict):
        browser = {}
    backend = browser.get("backend", "default")
    if backend not in ("default", "browser-use", "browser_use", "agent-browser", "agent_browser"):
        backend = "other"
    return {
        "backend": backend,
        "cdp_configured": bool(browser.get("cdp_url")),
        "real_profile_consent": browser.get("use_real_profile") is True,
        "connection_state": "not_verified",
        "capabilities": {"profile_discovery": True, "profile_attach": False,
                         "parallel_tasks": False, "live_preview": False},
    }