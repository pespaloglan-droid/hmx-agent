// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  api,
  authedFetch,
  fetchJSON,
  getManagementProfile,
  setManagementProfile,
} from "./api";

const reloadMocks = vi.hoisted(() => ({
  attemptDashboardTokenReloadOnce: vi.fn(() => false),
  clearDashboardTokenReloadAttempt: vi.fn(),
}));

vi.mock("./dashboard-auth-reload", () => ({
  attemptDashboardTokenReloadOnce: reloadMocks.attemptDashboardTokenReloadOnce,
  clearDashboardTokenReloadAttempt: reloadMocks.clearDashboardTokenReloadAttempt,
}));

const SESSION_HEADER = "X-Hermes-Session-Token";

beforeEach(() => {
  reloadMocks.attemptDashboardTokenReloadOnce.mockReset();
  reloadMocks.attemptDashboardTokenReloadOnce.mockReturnValue(false);
  reloadMocks.clearDashboardTokenReloadAttempt.mockReset();

  Object.defineProperty(window, "__HERMES_SESSION_TOKEN__", {
    configurable: true,
    value: "stale-token",
    writable: true,
  });
  Object.defineProperty(window, "__HERMES_AUTH_REQUIRED__", {
    configurable: true,
    value: false,
    writable: true,
  });
});

afterEach(() => {
  setManagementProfile("");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonFetchMock(body: unknown = { ok: true }) {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
  );
}

describe("fetchJSON", () => {
  it("sends explicit current-target consent only for diagnostics, never a caller-selected project", async () => {
    setManagementProfile("worker");
    const fetchMock = jsonFetchMock({ state: "agent_selected", production_authorized: false });
    vi.stubGlobal("fetch", fetchMock);
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await api.checkFlowStageAgent(id, "current-tab");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/browser/flow/stage/agent-check?profile=worker");
    expect((init?.headers as Headers).get(SESSION_HEADER)).toBe("stale-token");
    expect(JSON.parse(init?.body as string)).toEqual({ stage_id: id, consent: true, current_target_id: "current-tab" });
  });

  it("binds read-only Agent diagnostics to the owning profile without prompt or target input", async () => {
    setManagementProfile("worker");
    const fetchMock = jsonFetchMock({ state: "agent_selected", production_authorized: false });
    vi.stubGlobal("fetch", fetchMock);
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await api.checkFlowStageAgent(id);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/browser/flow/stage/agent-check?profile=worker");
    expect((init?.headers as Headers).get(SESSION_HEADER)).toBe("stale-token");
    expect(JSON.parse(init?.body as string)).toEqual({ stage_id: id, consent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("binds approved submission to the owning profile and sends no caller-selected target", async () => {
    setManagementProfile("worker");
    const fetchMock = jsonFetchMock({ state: "submit_clicked", production_submitted: null });
    vi.stubGlobal("fetch", fetchMock);
    const items = [{ name: "hmx_test_x", prompt: "Fixture" }];
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await api.submitFlowStage(id, items);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/browser/flow/stage/submit?profile=worker");
    expect((init?.headers as Headers).get(SESSION_HEADER)).toBe("stale-token");
    expect(JSON.parse(init?.body as string)).toEqual({ stage_id: id, items, submit_consent: true, settings_confirmed: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("binds composer staging and durable status to the selected Hermes profile", async () => {
    setManagementProfile("worker");
    const fetchMock = jsonFetchMock({ state: "text_staged", production_submitted: false });
    vi.stubGlobal("fetch", fetchMock);
    const items = [{ name: "hmx_test_x", prompt: "Fixture" }];
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await api.stageFlowText(id, "chosen", "https://flow.google.com/project/11111111-2222-3333-4444-555555555555", items);
    await api.getFlowStageStatus(id);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/browser/flow/stage?profile=worker");
    expect((init?.headers as Headers).get("Content-Type")).toBe("application/json");
    expect((init?.headers as Headers).get(SESSION_HEADER)).toBe("stale-token");
    expect(JSON.parse(init?.body as string)).toEqual({ consent: true, fill_consent: true,
      stage_id: id, target_id: "chosen", project_url: "https://flow.google.com/project/11111111-2222-3333-4444-555555555555", items });
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/browser/flow/stage/${id}?profile=worker`);
  });

  it("sends only explicit project preflight consent, selected target and project with auth", async () => {
    const fetchMock = jsonFetchMock({ state: "project_ready", production_authorized: false });
    vi.stubGlobal("fetch", fetchMock);
    const project = "https://flow.google.com/project/11111111-2222-3333-4444-555555555555";
    await api.checkFlowProject("chosen", project);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/browser/flow/project");
    expect((init?.headers as Headers).get("Content-Type")).toBe("application/json");
    expect((init?.headers as Headers).get(SESSION_HEADER)).toBe("stale-token");
    expect(JSON.parse(init?.body as string)).toEqual({ consent: true, target_id: "chosen", project_url: project });
  });

  it("sends only Flow consent and the explicitly selected target", async () => {
    const fetchMock = jsonFetchMock({ state: "listed", targets: [] });
    vi.stubGlobal("fetch", fetchMock);
    await api.listFlowTabs();
    await api.checkFlowTab("flow-2");
    const [listUrl, listOptions] = fetchMock.mock.calls[0];
    const [checkUrl, checkOptions] = fetchMock.mock.calls[1];
    expect(listUrl).toBe("/api/browser/flow/tabs");
    expect(checkUrl).toBe("/api/browser/flow/check");
    expect(JSON.parse(listOptions?.body as string)).toEqual({ consent: true });
    expect(JSON.parse(checkOptions?.body as string)).toEqual({ consent: true, target_id: "flow-2" });
    for (const options of [listOptions, checkOptions]) {
      expect(new Headers(options?.headers).get("Content-Type")).toBe("application/json");
      expect(new Headers(options?.headers).get(SESSION_HEADER)).toBe("stale-token");
    }
  });
  it("sends authenticated JSON consent for the one-shot connection test", async () => {
    const fetchMock = jsonFetchMock({ state: "reachable" });
    vi.stubGlobal("fetch", fetchMock);
    await api.probeBrowserConnection();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/browser/probe");
    expect(options?.method).toBe("POST");
    expect(new Headers(options?.headers).get("Content-Type")).toBe("application/json");
    expect(new Headers(options?.headers).get(SESSION_HEADER)).toBe("stale-token");
    expect(JSON.parse(options?.body as string)).toEqual({ consent: true });
  });
  it("protects browser discovery with the session header and explicit consent", async () => {
    const fetchMock = jsonFetchMock({ browsers: [], read_only: true });
    vi.stubGlobal("fetch", fetchMock);
    await api.discoverBrowserProfiles();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/browser/discover");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toEqual({ consent: true, include_emails: false });
    expect(new Headers(options?.headers).get("Content-Type")).toBe("application/json");
    expect(new Headers(options?.headers).get(SESSION_HEADER)).toBe("stale-token");
  });

  it("scopes browser configuration to the selected agent profile", async () => {
    const fetchMock = jsonFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    setManagementProfile("worker");
    await api.getBrowserStatus();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/browser/status?profile=worker");
  });
  it("requests email metadata only when explicitly enabled", async () => {
    const fetchMock = jsonFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    await api.discoverBrowserProfiles(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      consent: true, include_emails: true,
    });
  });
  it("tries the one-shot reload path for loopback 401s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        clone: () => ({
          json: async () => ({}),
        }),
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Unauthorized",
      })),
    );
    reloadMocks.attemptDashboardTokenReloadOnce.mockReturnValue(true);

    const pending = fetchJSON("/api/status");
    await expect(Promise.race([pending, Promise.resolve("pending")])).resolves.toBe(
      "pending",
    );

    expect(reloadMocks.attemptDashboardTokenReloadOnce).toHaveBeenCalledTimes(1);
    expect(reloadMocks.clearDashboardTokenReloadAttempt).not.toHaveBeenCalled();
  });

  it("clears the reload latch after a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ ok: true }),
        ok: true,
        status: 200,
      })),
    );

    await expect(fetchJSON("/api/status")).resolves.toEqual({ ok: true });

    expect(reloadMocks.clearDashboardTokenReloadAttempt).toHaveBeenCalledTimes(1);
  });
});

describe("api.getModelOptions", () => {

  it("keeps explicit profile scoping when refreshing", async () => {
    vi.stubGlobal("window", {});

    const fetchMock = jsonFetchMock({ providers: [] });
    vi.stubGlobal("fetch", fetchMock);

    await api.getModelOptions({ profile: "default", refresh: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/model/options?profile=default&refresh=1&include_unconfigured=1",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});

describe("management profile scope", () => {
  // Every family whose routes write into a named profile's home must carry the
  // scope; an unprofiled request 400s on a host that merely HAS a second profile.
  it.each([
    "/api/credentials/pool/anthropic/0",
    "/api/dashboard/plugin-providers",
    "/api/model/recommended-default",
    "/api/local-models",
    "/api/ops/restart",
  ])("scopes %s to the selected management profile", async (path) => {
    vi.stubGlobal("window", {});
    const fetchMock = jsonFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    setManagementProfile("worker");

    await fetchJSON(path, { method: "POST" });

    expect(fetchMock.mock.calls[0][0]).toBe(`${path}?profile=worker`);
  });

  it("leaves endpoints outside the scoped families alone", async () => {
    vi.stubGlobal("window", {});
    const fetchMock = jsonFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    setManagementProfile("worker");

    await fetchJSON("/api/sessions");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/sessions");
  });

  it("falls back to the profile this backend serves when nothing is selected", async () => {
    vi.stubGlobal("window", { __HERMES_DASHBOARD_PROFILE__: "served" });
    const fetchMock = jsonFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    setManagementProfile("");

    expect(getManagementProfile()).toBe("served");

    await fetchJSON("/api/credentials/pool/anthropic/0", { method: "DELETE" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/credentials/pool/anthropic/0?profile=served",
    );
  });

  it("keeps the selected profile ahead of the serving profile", async () => {
    vi.stubGlobal("window", { __HERMES_DASHBOARD_PROFILE__: "served" });
    const fetchMock = jsonFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    setManagementProfile("worker");

    expect(getManagementProfile()).toBe("worker");

    await fetchJSON("/api/credentials/pool/anthropic/0", { method: "DELETE" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/credentials/pool/anthropic/0?profile=worker",
    );
  });

  it("names no profile at all when neither a selection nor a serving profile exists", async () => {
    vi.stubGlobal("window", {});
    const fetchMock = jsonFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    setManagementProfile("");

    expect(getManagementProfile()).toBe("");

    await fetchJSON("/api/credentials/pool/anthropic/0", { method: "DELETE" });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/credentials/pool/anthropic/0");
  });

  it.each([
    ["/api/ops/backup/download", "/api/ops/backup/download?profile=worker"],
    ["/api/ops/backup/download?full=1", "/api/ops/backup/download?full=1&profile=worker"],
    ["/api/ops/backup/download?profile=other", "/api/ops/backup/download?profile=other"],
    ["/api/sessions/abc/export", "/api/sessions/abc/export"],
  ])(
    "authedFetch resolves %s through the same management scope",
    async (path, expected) => {
      vi.stubGlobal("window", {});
      const fetchMock = vi.fn<typeof fetch>(async () => new Response("binary"));
      vi.stubGlobal("fetch", fetchMock);
      setManagementProfile("worker");

      await authedFetch(path);

      expect(fetchMock.mock.calls[0][0]).toBe(expected);
    },
  );
});

describe("api OAuth helpers", () => {
  it("starts OAuth login in gated mode without requiring an injected session token", async () => {
    vi.stubGlobal("window", { __HERMES_AUTH_REQUIRED__: true });
    const fetchMock = jsonFetchMock({
      flow: "device_code",
      session_id: "oauth-session",
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.startOAuthLogin("openai-codex");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/providers/oauth/openai-codex/start",
      expect.objectContaining({
        body: "{}",
        credentials: "include",
        method: "POST",
      }),
    );
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.has(SESSION_HEADER)).toBe(false);
  });

  it("still sends the injected session token for OAuth login in loopback mode", async () => {
    vi.stubGlobal("window", { __HERMES_SESSION_TOKEN__: "loopback-token" });
    const fetchMock = jsonFetchMock({
      flow: "device_code",
      session_id: "oauth-session",
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.startOAuthLogin("openai-codex");

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get(SESSION_HEADER)).toBe("loopback-token");
  });

  it("runs provider auth mutations in gated mode via cookie auth", async () => {
    vi.stubGlobal("window", { __HERMES_AUTH_REQUIRED__: true });
    const fetchMock = jsonFetchMock({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await api.disconnectOAuthProvider("anthropic");
    await api.submitOAuthCode("anthropic", "oauth-session", "code-123");
    await api.cancelOAuthSession("oauth-session");
    await api.revealEnvVar("OPENAI_API_KEY");

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.credentials).toBe("include");
      expect((init.headers as Headers).has(SESSION_HEADER)).toBe(false);
    }
  });

  it("keeps every OAuth operation on the selected management profile", async () => {
    vi.stubGlobal("window", {});
    const fetchMock = jsonFetchMock({
      flow: "device_code",
      session_id: "oauth-session",
    });
    vi.stubGlobal("fetch", fetchMock);
    setManagementProfile("worker");

    await api.getOAuthProviders();
    await api.disconnectOAuthProvider("anthropic");
    await api.startOAuthLogin("openai-codex");
    await api.submitOAuthCode("anthropic", "oauth-session", "code-123");
    await api.pollOAuthSession("anthropic", "oauth-session");
    await api.cancelOAuthSession("oauth-session");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/providers/oauth?profile=worker",
      "/api/providers/oauth/anthropic?profile=worker",
      "/api/providers/oauth/openai-codex/start?profile=worker",
      "/api/providers/oauth/anthropic/submit?profile=worker",
      "/api/providers/oauth/anthropic/poll/oauth-session?profile=worker",
      "/api/providers/oauth/sessions/oauth-session?profile=worker",
    ]);
  });
});

describe("api.getAuthMe loopback contract", () => {
  it("accepts a token-authenticated synthetic loopback identity", async () => {
    vi.stubGlobal("window", { __HERMES_SESSION_TOKEN__: "loopback-token" });
    const identity = {
      display_name: "Local",
      email: "",
      expires_at: 0,
      org_id: "",
      provider: "loopback",
      user_id: "local",
    };
    const fetchMock = jsonFetchMock(identity);
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.getAuthMe()).resolves.toEqual(identity);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).get(SESSION_HEADER)).toBe("loopback-token");
  });
});
