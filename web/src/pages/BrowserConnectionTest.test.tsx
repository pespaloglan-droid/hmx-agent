// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrowserConnectionTest from "./BrowserConnectionTest";

const mocks = vi.hoisted(() => ({ probeBrowserConnection: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ locale: "tr" }) }));
vi.mock("@nous-research/ui/ui/components/button", () => ({
  Button: (props: React.ComponentProps<"button">) => <button {...props} />,
}));
vi.mock("@nous-research/ui/ui/components/card", () => ({
  Card: (props: React.ComponentProps<"div">) => <div {...props} />,
  CardContent: (props: React.ComponentProps<"div">) => <div {...props} />,
}));

let container: HTMLDivElement;
let root: Root;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function click(element: Element) {
  await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}
async function render() {
  await act(async () => root.render(<BrowserConnectionTest />));
}
beforeEach(() => {
  vi.resetAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Explicit one-shot Chrome connection test", () => {
  it("never probes automatically and requires its own consent", async () => {
    await render();
    expect(mocks.probeBrowserConnection).not.toHaveBeenCalled();
    expect(container.querySelector("button")?.disabled).toBe(true);
    expect(container.textContent).toContain("Seçili profil kutuları testin hedefini belirlemez");
    expect(container.textContent).toContain("Flow'da işlem yapmaz");
  });

  it("waits for approval, blocks repeat clicks and never claims a verified Flow profile", async () => {
    let resolve!: (value: unknown) => void;
    mocks.probeBrowserConnection.mockReturnValue(new Promise((done) => { resolve = done; }));
    await render();
    await click(container.querySelector("input")!);
    await click(container.querySelector("button")!);
    expect(container.querySelector("button")?.disabled).toBe(true);
    expect(container.querySelector("input")?.disabled).toBe(true);
    expect(container.textContent).toContain("Chrome onayı / bağlantı bekleniyor");
    await click(container.querySelector("button")!);
    expect(mocks.probeBrowserConnection).toHaveBeenCalledTimes(1);
    await act(async () => resolve({
      state: "reachable", product: "Chrome/154.0.8037.98",
      protocol_version: "1.3", checked_at: "2026-10-11T12:00:00Z",
    }));
    expect(container.textContent).toContain("test bağlantısı kapatıldı");
    expect(container.textContent).toContain("Chrome/154.0.8037.98");
    expect(container.textContent).toContain("Kalıcı bağlantı kurulmadı");
    await click(container.querySelector("input")!);
    expect(container.textContent).not.toContain("Chrome/154.0.8037.98");
  });

  it.each(["busy", "timeout", "invalid_reply", "not_found"])("shows %s without claiming connection", async (state) => {
    mocks.probeBrowserConnection.mockResolvedValue({ state });
    await render();
    await click(container.querySelector("input")!);
    await click(container.querySelector("button")!);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Bağlantı testi başarılı");
    expect(container.querySelector("button")?.disabled).toBe(false);
  });

  it("does not expose raw errors and allows retry", async () => {
    mocks.probeBrowserConnection.mockRejectedValueOnce(new Error("ws://SECRET?token=PRIVATE"));
    await render();
    await click(container.querySelector("input")!);
    await click(container.querySelector("button")!);
    expect(container.textContent).not.toContain("SECRET");
    expect(container.textContent).not.toContain("PRIVATE");
    mocks.probeBrowserConnection.mockResolvedValue({ state: "reachable", product: "Chrome/154.0.0", protocol_version: "1.3" });
    await click(container.querySelector("button")!);
    expect(container.textContent).toContain("Bağlantı testi başarılı");
  });
});