// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlowProjectPreflight from "./FlowProjectPreflight";
const mocks = vi.hoisted(() => ({ checkFlowProject: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ locale: "tr" }) }));
vi.mock("@nous-research/ui/ui/components/button", () => ({ Button: (props: React.ComponentProps<"button">) => <button {...props} /> }));
let container: HTMLDivElement; let root: Root;
const url = "https://flow.google.com/project/11111111-2222-3333-4444-555555555555";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function click(el: Element) { await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
beforeEach(async () => { vi.resetAllMocks(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); await act(async () => root.render(<FlowProjectPreflight targetId="chosen" projectUrl={url} />)); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
describe("explicit project preflight", () => {
  it("does nothing until consent AND click, sends exact target and project, clears on revocation", async () => {
    mocks.checkFlowProject.mockResolvedValue({ state: "project_ready", production_authorized: false });
    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(true); expect(mocks.checkFlowProject).not.toHaveBeenCalled();
    await click(container.querySelector("input")!); expect(mocks.checkFlowProject).not.toHaveBeenCalled();
    await click(button); expect(mocks.checkFlowProject).toHaveBeenCalledWith("chosen", url);
    expect(container.textContent).toContain("Proje eşleşti; tek boş Agent");
    expect(container.textContent).toContain("Kontrol sonucu üretim izni değildir");
    await click(container.querySelector("input")!); expect(container.textContent).not.toContain("Proje eşleşti; tek boş Agent");
  });
  it("reveals a separate write permission only after a confirmed contenteditable preflight", async () => {
    await act(async () => root.render(<FlowProjectPreflight targetId="chosen" projectUrl={url}
      items={[{ name: "hmx_test_x", prompt: "Fixture" }]} />));
    expect(container.querySelector('[name="flow-stage-consent"]')).toBeNull();
    mocks.checkFlowProject.mockResolvedValue({ state: "project_ready", markers: { contenteditable_count: 1 } });
    await click(container.querySelector('[name="flow-project-consent"]')!); await click(container.querySelector("button")!);
    expect(container.querySelector<HTMLInputElement>('[name="flow-stage-consent"]')?.checked).toBe(false);
    await click(container.querySelector('[name="flow-project-consent"]')!);
    expect(container.querySelector('[name="flow-stage-consent"]')).toBeNull();
  });

  it.each(["project_inconclusive", "project_mismatch", "target_unavailable", "read_blocked", "timeout"])("shows %s without another request or production claim", async (state) => {
    mocks.checkFlowProject.mockResolvedValue({ state }); await click(container.querySelector("input")!); await click(container.querySelector("button")!);
    expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(mocks.checkFlowProject).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Proje eşleşti; tek boş Agent");
  });
  it("does not expose raw errors and permits manual retry", async () => {
    mocks.checkFlowProject.mockRejectedValueOnce(new Error("SECRET")); await click(container.querySelector("input")!); await click(container.querySelector("button")!);
    expect(container.textContent).not.toContain("SECRET"); mocks.checkFlowProject.mockResolvedValue({ state: "project_ready" });
    await click(container.querySelector("button")!); expect(mocks.checkFlowProject).toHaveBeenCalledTimes(2);
  });
  it("locks controls while awaiting approval and ignores late unmounted replies", async () => {
    let release!: (value: unknown) => void;
    mocks.checkFlowProject.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    await click(container.querySelector("input")!); await click(container.querySelector("button")!);
    expect(container.querySelector("input")!.disabled).toBe(true); expect(container.querySelector("button")!.disabled).toBe(true);
    await act(async () => root.render(<div>Left panel</div>)); await act(async () => release({ state: "project_ready" }));
    expect(container.textContent).toBe("Left panel");
  });
});
