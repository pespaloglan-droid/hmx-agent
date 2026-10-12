import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeVersion, readEndpoint } from "../scripts/hmx/chrome-connection-probe.mjs";

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function discovery(content) {
  const root = mkdtempSync(join(tmpdir(), "chrome-probe-test-"));
  roots.push(root);
  const file = join(root, "DevToolsActivePort");
  writeFileSync(file, content);
  return file;
}

describe("Chrome connection probe", () => {
  it("reads a loopback websocket directly, including Windows CRLF/BOM", () => {
    const file = discovery("\uFEFF9222\r\n/devtools/browser/synthetic-id\r\n");
    expect(readEndpoint(file)).toBe("ws://127.0.0.1:9222/devtools/browser/synthetic-id");
  });

  it.each([
    "0\n/devtools/browser/id",
    "65536\n/devtools/browser/id",
    "9222\nws://remote.invalid/devtools/browser/id",
    "9222\n/devtools/browser/id?token=secret",
    "9222\n/devtools/browser/id\nextra",
    "x".repeat(4097),
  ])("rejects malformed discovery data", (content) => {
    expect(() => readEndpoint(discovery(content))).toThrow("Invalid discovery file");
  });

  it("requests only Browser.getVersion and closes only its socket", async () => {
    class Socket extends EventTarget {
      static instance;
      sent = [];
      closed = false;
      constructor() {
        super();
        Socket.instance = this;
        queueMicrotask(() => this.dispatchEvent(new Event("open")));
      }
      send(data) {
        this.sent.push(JSON.parse(data));
        const reply = { id: 1, result: { product: "Chrome/154.0.8037.98",
          protocolVersion: "1.3", userAgent: "DO NOT EXPOSE" } };
        queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
          data: JSON.stringify(reply),
        })));
      }
      close() { this.closed = true; }
    }
    expect(await probeVersion("ws://127.0.0.1:9222/devtools/browser/id", { Socket }))
      .toEqual({ product: "Chrome/154.0.8037.98", protocolVersion: "1.3" });
    expect(Socket.instance.sent).toEqual([{ id: 1, method: "Browser.getVersion" }]);
    expect(Socket.instance.closed).toBe(true);
  });

  it("times out without sending tab operations", async () => {
    class Socket extends EventTarget {
      static instance;
      closed = false;
      constructor() { super(); Socket.instance = this; }
      close() { this.closed = true; }
    }
    await expect(probeVersion("ws://127.0.0.1:9222/devtools/browser/id",
      { Socket, timeoutMs: 10 })).rejects.toThrow("TIMEOUT");
    expect(Socket.instance.closed).toBe(true);
  });

  it.each(["error", "close", "invalid-reply"])("fails safely on %s", async (kind) => {
    class Socket extends EventTarget {
      static instance;
      closed = false;
      constructor() {
        super();
        Socket.instance = this;
        queueMicrotask(() => this.dispatchEvent(kind === "invalid-reply"
          ? new MessageEvent("message", { data: JSON.stringify({
            id: 1, result: { product: "OtherBrowser/1", protocolVersion: "1.3" },
          }) })
          : new Event(kind)));
      }
      close() { this.closed = true; }
    }
    await expect(probeVersion("ws://127.0.0.1:9222/devtools/browser/id",
      { Socket })).rejects.toThrow();
    expect(Socket.instance.closed).toBe(true);
  });
});