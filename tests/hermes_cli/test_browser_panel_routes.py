"""Real router requests with isolated auth/config seams (not a full agent run)."""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from hermes_cli.web_routers import browser


@pytest.fixture
def client(monkeypatch):
    def require_token(request):
        if request.headers.get("X-Hermes-Session-Token") != "test-session":
            raise HTTPException(status_code=401)

    monkeypatch.setattr(browser, "_require_token", require_token)
    app = FastAPI()
    app.include_router(browser.router)
    with TestClient(app) as client:
        yield client


HEADERS = {"X-Hermes-Session-Token": "test-session"}


def test_discovery_requires_auth_before_reading(client, monkeypatch):
    monkeypatch.setattr(browser, "discover_browsers", lambda **kwargs: pytest.fail("must not discover"))
    assert client.post("/api/browser/discover", json={"consent": True}).status_code == 401
    assert client.get("/api/browser/status").status_code == 401


def test_discovery_requires_consent(client, monkeypatch):
    monkeypatch.setattr(browser, "discover_browsers", lambda **kwargs: pytest.fail("must not discover"))
    assert client.post("/api/browser/discover", headers=HEADERS, json={}).status_code == 400
    assert client.post("/api/browser/discover", headers=HEADERS, json={"consent": False}).status_code == 400


def test_no_client_filesystem_paths(client, monkeypatch):
    monkeypatch.setattr(browser, "discover_browsers", lambda **kwargs: pytest.fail("must not discover"))
    assert client.post("/api/browser/discover", headers=HEADERS,
                       json={"consent": True, "path": "/secret"}).status_code == 422


def test_metadata_response(client, monkeypatch):
    expected = {"browsers": [], "read_only": True}
    monkeypatch.setattr(browser, "discover_browsers", lambda **kwargs: expected)
    response = client.post("/api/browser/discover", headers=HEADERS, json={"consent": True})
    assert response.status_code == 200
    assert response.json() == expected


@pytest.mark.parametrize("include_emails", [False, True])
def test_email_scope_is_explicit(client, monkeypatch, include_emails):
    scopes = []

    def discover(**kwargs):
        scopes.append(kwargs["include_emails"])
        return {"read_only": True, "browsers": [], "emails_included": kwargs["include_emails"]}

    monkeypatch.setattr(browser, "discover_browsers", discover)
    body = {"consent": True}
    if include_emails:
        body["include_emails"] = True
    response = client.post("/api/browser/discover", headers=HEADERS, json=body)
    assert response.status_code == 200
    assert scopes == [include_emails]
    assert response.json()["emails_included"] is include_emails


def test_email_flag_does_not_replace_discovery_consent(client, monkeypatch):
    monkeypatch.setattr(browser, "discover_browsers",
                        lambda **kwargs: pytest.fail("must not discover"))
    response = client.post("/api/browser/discover", headers=HEADERS,
                           json={"include_emails": True})
    assert response.status_code == 400
    response = client.post("/api/browser/discover", headers=HEADERS,
                           json={"consent": True, "include_emails": "true"})
    assert response.status_code == 422


@pytest.mark.parametrize("content_type,expected_status", [
    ("text/plain;charset=UTF-8", 422),
    ("application/json", 200),
])
def test_serialized_consent_requires_json_content_type(client, monkeypatch,
                                                       content_type, expected_status):
    expected = {"browsers": [], "read_only": True}
    calls = []

    def discover(**kwargs):
        calls.append(True)
        return expected

    monkeypatch.setattr(browser, "discover_browsers", discover)
    response = client.post("/api/browser/discover",
                           headers={**HEADERS, "Content-Type": content_type},
                           content='{"consent":true}')
    assert response.status_code == expected_status
    assert calls == ([True] if expected_status == 200 else [])
    if expected_status == 200:
        assert response.json() == expected


def test_status_preserves_requested_profile_and_hides_cdp(client, monkeypatch):
    scopes = []

    async def scoped(profile, fn):
        scopes.append(profile)
        return fn()

    monkeypatch.setattr(browser, "config_scoped_to_thread", scoped)
    monkeypatch.setattr(browser, "load_config", lambda: {"browser": {"cdp_url": "https://SECRET"}})
    response = client.get("/api/browser/status?profile=worker", headers=HEADERS)
    assert response.status_code == 200
    assert scopes == ["worker"]
    assert response.json()["connection_state"] == "not_verified"
    assert "SECRET" not in response.text


def test_probe_never_runs_without_auth_and_explicit_consent(client, monkeypatch):
    async def forbidden():
        pytest.fail("must not connect")
    monkeypatch.setattr(browser, "run_browser_probe", forbidden)
    assert client.post("/api/browser/probe", json={"consent": True}).status_code == 401
    for body in ({}, {"consent": False}):
        assert client.post("/api/browser/probe", headers=HEADERS, json=body).status_code == 400
    assert client.post("/api/browser/probe", headers=HEADERS,
                       json={"consent": "true"}).status_code == 422
    for field in ("url", "path", "profile_id"):
        assert client.post("/api/browser/probe", headers=HEADERS,
                           json={"consent": True, field: "SECRET"}).status_code == 422


def test_probe_returns_only_transport_result(client, monkeypatch):
    expected = {"state": "reachable", "product": "Chrome/154.0.8037.98",
                "protocol_version": "1.3"}
    calls = []
    async def probe():
        calls.append(True)
        return expected
    monkeypatch.setattr(browser, "run_browser_probe", probe)
    response = client.post("/api/browser/probe", headers=HEADERS, json={"consent": True})
    assert response.status_code == 200
    assert response.json() == expected
    assert calls == [True]