import { describe, expect, it } from "vitest";
import { resolvePageTitle } from "./resolve-page-title";
import type { Translations } from "@/i18n/types";
import { tr } from "@/i18n/tr";

// Minimal translations stub — only the fields resolvePageTitle touches.
const t = {
  app: {
    webUi: "Web UI",
    nav: {
      analytics: "Analytics",
      chat: "Chat",
      config: "Config",
      cron: "Cron",
      documentation: "Documentation",
      keys: "Keys",
      logs: "Logs",
      models: "Models",
      profiles: "Profiles",
      plugins: "Plugins",
      sessions: "Sessions",
      skills: "Skills",
    },
  },
} as unknown as Translations;

describe("resolvePageTitle", () => {
  it.each([
    ["/channels", "Kanallar"],
    ["/webhooks", "Web kancaları"],
    ["/pairing", "Eşleştirme"],
    ["/files", "Dosyalar"],
    ["/system", "Sistem"],
    ["/profiles", "Ajan profilleri"],
    ["/cron", "Zamanlanmış görevler"],
  ])("uses the Turkish title for %s", (path, title) => {
    expect(resolvePageTitle(path, tr, [])).toBe(title);
  });
  it.each([
    ["/channels", "Channels"],
    ["/webhooks", "Webhooks"],
    ["/pairing", "Pairing"],
    ["/files", "Files"],
    ["/system", "System"],
  ])("keeps the English fallback for older locales at %s", (path, title) => {
    expect(resolvePageTitle(path, t, [])).toBe(title);
  });
  it("translates Browser with an English fallback for older locales", () => {
    expect(resolvePageTitle("/browser", t, [])).toBe("Browser");
    const translated = { ...t, app: { ...t.app, nav: { ...t.app.nav, browser: "Tarayıcı" } } };
    expect(resolvePageTitle("/browser", translated, [])).toBe("Tarayıcı");
  });
  it("uses i18n nav keys for translated routes", () => {
    expect(resolvePageTitle("/sessions", t, [])).toBe("Sessions");
    expect(resolvePageTitle("/env", t, [])).toBe("Keys");
  });

  it("prefers plugin tab labels", () => {
    expect(
      resolvePageTitle("/kanban", t, [{ path: "/kanban", label: "Kanban" }]),
    ).toBe("Kanban");
  });

  it("falls back to capitalized path segment for unknown routes", () => {
    expect(resolvePageTitle("/whatever", t, [])).toBe("Whatever");
  });

  it("treats root as sessions and trailing slashes as equivalent", () => {
    expect(resolvePageTitle("/", t, [])).toBe("Sessions");
    expect(resolvePageTitle("/mcp/", t, [])).toBe("MCP");
  });
});
