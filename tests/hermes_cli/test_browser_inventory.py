"""Phase-1 browser inventory regressions; no actual browser or secrets needed."""

import json
from pathlib import Path
from unittest.mock import patch

from hermes_cli.browser_inventory import (
    MAX_STATE_BYTES, browser_configuration_status, inspect_profiles,
)


def test_metadata_allowlist_and_no_secret_output(tmp_path):
    (tmp_path / "Default").mkdir()
    (tmp_path / "Profile 2").mkdir()
    (tmp_path / "Cookies").write_text("DO NOT READ")
    (tmp_path / "Local State").write_text(json.dumps({
        "os_crypt": {"encrypted_key": "SECRET"},
        "profile": {"info_cache": {
            "Default": {"name": "Personal", "user_name": "private@example.com"},
            "Profile 2": {"name": "private@example.com"},
            "../../escape": {"name": "Outside"},
        }},
    }))
    rows, warning = inspect_profiles(tmp_path)
    assert warning is None
    assert [row["label"] for row in rows] == ["Personal", "Profile 2"]
    assert all(row["connection_state"] == "not_connected" for row in rows)
    assert "SECRET" not in json.dumps(rows)
    assert "private@example.com" not in json.dumps(rows)
    assert str(tmp_path) not in json.dumps(rows)


def test_malformed_state_falls_back_without_claiming_connection(tmp_path):
    (tmp_path / "Default").mkdir()
    (tmp_path / "Local State").write_text("{invalid")
    rows, warning = inspect_profiles(tmp_path)
    assert rows[0]["label"] == "Default"
    assert rows[0]["site_session"] == "not_checked"
    assert warning == "metadata_unavailable"


def test_symlink_profile_is_not_followed(tmp_path):
    root = tmp_path / "browser"
    root.mkdir()
    target = tmp_path / "other"
    target.mkdir()
    (root / "Profile 1").symlink_to(target, target_is_directory=True)
    assert inspect_profiles(root)[0] == []


def test_symlink_metadata_is_not_read(tmp_path):
    (tmp_path / "Default").mkdir()
    target = tmp_path / "secret.json"
    target.write_text('{"profile": {"info_cache": {"Default": {"name": "SECRET"}}}}')
    (tmp_path / "Local State").symlink_to(target)
    rows, warning = inspect_profiles(tmp_path)
    assert rows[0]["label"] == "Default"
    assert warning == "metadata_unavailable"


def test_missing_directory(tmp_path):
    assert inspect_profiles(tmp_path / "missing") == ([], "not_found_or_unsupported_path")


def test_access_denied_is_reported_without_path(tmp_path):
    with patch.object(Path, "is_dir", side_effect=PermissionError("private path")):
        assert inspect_profiles(tmp_path) == ([], "access_denied")


def test_oversized_metadata(tmp_path):
    (tmp_path / "Default").mkdir()
    with (tmp_path / "Local State").open("wb") as stream:
        stream.truncate(MAX_STATE_BYTES + 1)
    rows, warning = inspect_profiles(tmp_path)
    assert warning == "metadata_unavailable"
    assert rows[0]["label"] == "Default"


def test_configuration_never_claims_verified_or_returns_endpoint():
    result = browser_configuration_status({"browser": {
        "cdp_url": "https://user:SECRET@example.com/path?token=SECRET",
        "backend": "browser-use", "use_real_profile": True,
    }})
    assert result["connection_state"] == "not_verified"
    assert result["cdp_configured"] is True
    assert result["real_profile_consent"] is True
    assert "SECRET" not in json.dumps(result)
    assert result["capabilities"]["parallel_tasks"] is False
    assert result["capabilities"]["profile_attach"] is False


def test_invalid_configuration_is_safe():
    assert browser_configuration_status({"browser": None})["backend"] == "default"
    assert browser_configuration_status({"browser": {"backend": ["secret"]}})["backend"] == "other"