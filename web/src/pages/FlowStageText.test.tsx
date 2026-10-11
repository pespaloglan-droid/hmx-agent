// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlowStageText from "./FlowStageText";
const mocks = vi.hoisted(() => ({ stageFlowText: vi.fn(), getFlowStageStatus: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ locale: "tr" }) }));
vi.mock("@nous-research/ui/ui/components/button", () => ({ Button: (props: React.ComponentProps<"button">) => <button {...props} /> }));
let container: HTMLDivElement; let root: Root;
const url = "https://flow.google.com/project/11111111-2222-3333-4444-555555555555";
const items = [{ name: "hmx_test_003_sahil", prompt: "Sahil" }, { name: "hmx_test_004_orman", prompt: "Orman" }];
const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function click(el: Element) { await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
beforeEach(async () => {
  vi.resetAllMocks(); vi.spyOn(crypto, "randomUUID").mockReturnValue(id);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<FlowStageText targetId="chosen" projectUrl={url} items={items} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
describe("separate editor-write permission", () => {
  it("does not write on mount or consent alone; explicit click writes once, never submits", async () => {
    mocks.stageFlowText.mockResolvedValue({ state: "text_staged", production_submitted: false });
    expect(container.querySelector("button")!.disabled).toBe(true);
    await click(container.querySelector("input")!); expect(mocks.stageFlowText).not.toHaveBeenCalled();
    await click(container.querySelector("button")!); await click(container.querySelector("button")!);
    expect(mocks.stageFlowText).toHaveBeenCalledTimes(1);
    expect(mocks.stageFlowText).toHaveBeenCalledWith(id, "chosen", url, items);
    expect(mocks.getFlowStageStatus).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Gönderme düğmesine basılmadı");
    expect(container.querySelector("button")!.disabled).toBe(true);
  });
  it.each([{ rows: items.slice(0, 1).map((row) => ({ ...row, name: "old_name" })) }, { rows: [...items, items[0]] }, { rows: [{ name: "hmx_test_x", prompt: "x".repeat(3001) }] }])("refuses unsupported test rows", async ({ rows }) => {
    await act(async () => root.render(<FlowStageText targetId="chosen" projectUrl={url} items={rows} />));
    expect(container.querySelector("input")!.disabled).toBe(true);
    expect(container.querySelector("button")!.disabled).toBe(true);
    expect(mocks.stageFlowText).not.toHaveBeenCalled();
  });
  it("after a network error reads durable status but never retries mutation", async () => {
    mocks.stageFlowText.mockRejectedValue(new Error("SECRET"));
    mocks.getFlowStageStatus.mockResolvedValue({ state: "stage_uncertain", production_submitted: false });
    await click(container.querySelector("input")!); await click(container.querySelector("button")!);
    expect(mocks.getFlowStageStatus).toHaveBeenCalledWith(id);
    expect(mocks.stageFlowText).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("SECRET");
    expect(container.textContent).toContain("Otomatik tekrar yapılmadı");
    expect(container.querySelector("button")!.disabled).toBe(true);
  });
  it("does not retry an existing attempt or claim generation", async () => {
    mocks.stageFlowText.mockResolvedValue({ state: "attempt_exists", production_submitted: false });
    await click(container.querySelector("input")!); await click(container.querySelector("button")!);
    expect(container.textContent).toContain("Yeniden yazma yapılmadı");
    expect(mocks.stageFlowText).toHaveBeenCalledTimes(1);
  });
  it("locks while writing and ignores late responses after leaving the panel", async () => {
    let release!: (value: unknown) => void;
    mocks.stageFlowText.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    await click(container.querySelector("input")!); await click(container.querySelector("button")!);
    expect(container.querySelector("input")!.disabled).toBe(true);
    expect(container.querySelector("button")!.disabled).toBe(true);
    await act(async () => root.render(<div>Left panel</div>)); await act(async () => release({ state: "text_staged" }));
    expect(container.textContent).toBe("Left panel");
  });
});
