// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlowTabCheck from "./FlowTabCheck";

const mocks = vi.hoisted(() => ({ listFlowTabs: vi.fn(), checkFlowTab: vi.fn() }));
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
const button = (text: string) => [...container.querySelectorAll("button")].find(
  (el) => el.textContent === text,
)!;
const targets = ["flow-1", "flow-2"].map((id) => ({ id, label: "Google Flow", origin: "https://flow.google.com" }));
async function discover() {
  await act(async () => root.render(<FlowTabCheck />));
  await click(container.querySelector("input")!);
  await click(button("Açık Flow sekmelerini bul"));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.listFlowTabs.mockResolvedValue({ state: "listed", targets });
  mocks.checkFlowTab.mockResolvedValue({ state: "workspace_visible", account_verified: false });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
});

describe("Flow target selection", () => {
  it("does not read tabs on mount or consent alone", async () => {
    await act(async () => root.render(<FlowTabCheck />));
    expect(button("Açık Flow sekmelerini bul").disabled).toBe(true);
    await click(container.querySelector("input")!);
    expect(mocks.listFlowTabs).not.toHaveBeenCalled();
    expect(mocks.checkFlowTab).not.toHaveBeenCalled();
  });

  it("requires explicit selection, checks only that tab and does not claim Gmail verification", async () => {
    await discover();
    const radios = container.querySelectorAll<HTMLInputElement>('input[name="flow-target"]');
    expect([...radios].some((radio) => radio.checked)).toBe(false);
    expect(button("Seçili Flow sekmesini kontrol et").disabled).toBe(true);
    await click(radios[1]);
    await click(button("Seçili Flow sekmesini kontrol et"));
    expect(mocks.checkFlowTab).toHaveBeenCalledWith("flow-2");
    expect(container.textContent).toContain("Flow çalışma alanı işaretleri görüldü");
    expect(container.textContent).toContain("Görsel üretim taslağı — gönderim yok");
    expect(container.textContent).toContain("Gmail adresini veya Chrome profil kimliğini doğrulamaz");
    await click(container.querySelector('input[name="flow-consent"]')!);
    expect(container.querySelectorAll('input[name="flow-target"]')).toHaveLength(0);
    expect(container.textContent).not.toContain("Görsel üretim taslağı — gönderim yok");
    expect(container.textContent).not.toContain("Flow çalışma alanı işaretleri görüldü");
  });

  it.each(["target_changed", "target_unavailable", "read_blocked", "timeout"])("shows %s without selecting another target", async (state) => {
    mocks.checkFlowTab.mockResolvedValue({ state });
    await discover();
    await click(container.querySelectorAll('input[name="flow-target"]')[1]);
    await click(button("Seçili Flow sekmesini kontrol et"));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(mocks.checkFlowTab).toHaveBeenCalledTimes(1);
    expect(mocks.checkFlowTab).toHaveBeenCalledWith("flow-2");
    expect(container.textContent).not.toContain("Flow çalışma alanı işaretleri görüldü");
  });

  it("handles an empty list without a fabricated connected profile", async () => {
    mocks.listFlowTabs.mockResolvedValue({ state: "listed", targets: [] });
    await discover();
    expect(container.textContent).toContain("Açık Flow sekmesi bulunamadı");
    expect(mocks.checkFlowTab).not.toHaveBeenCalled();
  });

  it("does not expose raw failures and allows rediscovery", async () => {
    mocks.listFlowTabs.mockRejectedValueOnce(new Error("SECRET token"));
    await discover();
    expect(container.textContent).not.toContain("SECRET");
    await click(button("Açık Flow sekmelerini bul"));
    expect(container.querySelectorAll('input[name="flow-target"]')).toHaveLength(2);
  });
});