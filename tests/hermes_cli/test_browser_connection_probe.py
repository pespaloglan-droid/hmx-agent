"""Read-only transport checks against synthetic discovery files and a local CDP fixture."""

import asyncio
import json

import pytest

from hermes_cli.browser_connection_probe import probe_chrome_root, probe_endpoint, read_chrome_endpoint
from hermes_cli import browser_connection_probe as probe


def test_endpoint_reads_windows_line_endings_without_exposing_other_metadata(tmp_path):
    (tmp_path / "DevToolsActivePort").write_bytes(
        b"\xef\xbb\xbf9222\r\n/devtools/browser/synthetic-id\r\n")
    assert read_chrome_endpoint(tmp_path) == "ws://127.0.0.1:9222/devtools/browser/synthetic-id"


@pytest.mark.parametrize("content", [
    "0\n/devtools/browser/id",
    "65536\n/devtools/browser/id",
    "9222\nws://remote.invalid/devtools/browser/id",
    "9222\n/devtools/browser/id?token=SECRET",
    "9222\n/devtools/browser/id\nextra",
    "x" * 4097,
])
def test_invalid_endpoint_is_refused(tmp_path, content):
    (tmp_path / "DevToolsActivePort").write_text(content)
    with pytest.raises(ValueError):
        read_chrome_endpoint(tmp_path)


def test_missing_discovery_file(tmp_path):
    with pytest.raises(FileNotFoundError):
        read_chrome_endpoint(tmp_path)


@pytest.mark.platforms("posix")
def test_unsupported_host_never_attempts_a_connection(monkeypatch):
    async def forbidden(root):
        pytest.fail("must not connect on an unsupported host")
    monkeypatch.setattr(probe, "probe_chrome_root", forbidden)
    assert asyncio.run(probe.run_browser_probe()) == {"state": "unsupported_platform"}


def test_timeout_is_reported_without_raw_details(monkeypatch):
    from websockets.asyncio import client
    def expired(*args, **kwargs):
        raise TimeoutError("SECRET endpoint")
    monkeypatch.setattr(client, "connect", expired)
    assert asyncio.run(probe_endpoint("ws://127.0.0.1:9222/devtools/browser/SECRET")) == {
        "state": "timeout",
    }


def test_discovery_symlink_is_refused(tmp_path):
    target = tmp_path / "secret"
    target.write_text("9222\n/devtools/browser/secret")
    (tmp_path / "DevToolsActivePort").symlink_to(target)
    with pytest.raises(ValueError):
        read_chrome_endpoint(tmp_path)


@pytest.mark.parametrize("reply,expected_state", [
    ({"id": 1, "result": {"product": "Chrome/154.0.8037.98",
                        "protocolVersion": "1.3", "userAgent": "SECRET"}}, "reachable"),
    ({"id": 1, "result": {"product": "OtherBrowser/1", "protocolVersion": "1.3"}}, "invalid_reply"),
    ({"id": 1, "error": {"message": "SECRET"}}, "invalid_reply"),
    ([], "invalid_reply"),
])
def test_real_websocket_wire_reads_only_version_and_closes(reply, expected_state):
    async def scenario():
        from websockets.asyncio.server import serve
        requests = []
        closed = asyncio.Event()

        async def handler(socket):
            requests.append(json.loads(await socket.recv()))
            await socket.send(json.dumps(reply))
            await socket.wait_closed()
            closed.set()

        async with serve(handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            result = await probe_endpoint(f"ws://127.0.0.1:{port}/devtools/browser/fixture")
            await asyncio.wait_for(closed.wait(), timeout=2)
        assert result["state"] == expected_state
        assert requests == [{"id": 1, "method": "Browser.getVersion"}]
        assert "SECRET" not in json.dumps(result)
        if expected_state == "reachable":
            assert result == {"state": "reachable", "product": "Chrome/154.0.8037.98",
                              "protocol_version": "1.3"}

    asyncio.run(scenario())


def test_connection_failure_does_not_leak_endpoint():
    async def scenario():
        from websockets.asyncio.server import serve
        async with serve(lambda socket: None, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
        result = await probe_endpoint(f"ws://127.0.0.1:{port}/devtools/browser/SECRET")
        assert result == {"state": "connection_failed"}
    asyncio.run(scenario())


def test_concurrent_probes_are_refused_and_lock_is_released(tmp_path):
    async def scenario():
        from websockets.asyncio.server import serve
        requested = asyncio.Event()
        release = asyncio.Event()
        calls = []
        async def handler(socket):
            calls.append(json.loads(await socket.recv()))
            requested.set()
            await release.wait()
            await socket.send(json.dumps({"id": 1, "result": {
                "product": "Chrome/154.0.8037.98", "protocolVersion": "1.3",
            }}))

        async with serve(handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            (tmp_path / "DevToolsActivePort").write_text(f"{port}\n/devtools/browser/fixture")
            first = asyncio.create_task(probe_chrome_root(tmp_path))
            await asyncio.wait_for(requested.wait(), timeout=2)
            try:
                assert await probe_chrome_root(tmp_path) == {"state": "busy"}
            finally:
                release.set()
            result = await first
        assert result["state"] == "reachable"
        assert result["checked_at"]
        assert calls == [{"id": 1, "method": "Browser.getVersion"}]
        (tmp_path / "DevToolsActivePort").unlink()
        assert await probe_chrome_root(tmp_path) == {"state": "not_found"}

    asyncio.run(scenario())