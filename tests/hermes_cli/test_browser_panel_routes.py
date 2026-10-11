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
    monkeypatch.setattr(browser, "discover_browsers", lambda: pytest.fail("must not discover"))
    assert client.post("/api/browser/discover", json={"consent": True}).status_code == 401
    assert client.get("/api/browser/status").status_code == 401


def test_discovery_requires_consent(client, monkeypatch):
    monkeypatch.setattr(browser, "discover_browsers", lambda: pytest.fail("must not discover"))
    assert client.post("/api/browser/discover", headers=HEADERS, json={}).status_code == 400
    assert client.post("/api/browser/discover", headers=HEADERS, json={"consent": False}).status_code == 400


def test_no_client_filesystem_paths(client, monkeypatch):
    monkeypatch.setattr(browser, "discover_browsers", lambda: pytest.fail("must not discover"))
    assert client.post("/api/browser/discover", headers=HEADERS,
                       json={"consent": True, "path": "/secret"}).status_code == 422


def test_metadata_response(client, monkeypatch):
    expected = {"browsers": [], "read_only": True}
    monkeypatch.setattr(browser, "discover_browsers", lambda: expected)
    response = client.post("/api/browser/discover", headers=HEADERS, json={"consent": True})
    assert response.status_code == 200
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