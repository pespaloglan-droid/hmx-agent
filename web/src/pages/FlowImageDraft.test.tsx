// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlowImageDraft from "./FlowImageDraft";
vi.mock("@/i18n", () => ({ useI18n: () => ({ locale: "tr" }) }));
vi.mock("@nous-research/ui/ui/components/button", () => ({ Button: (props: React.ComponentProps<"button">) => <button {...props} /> }));
vi.mock("@nous-research/ui/ui/components/card", () => ({ Card: (props: React.ComponentProps<"div">) => <div {...props} />, CardContent: (props: React.ComponentProps<"div">) => <div {...props} /> }));
let container: HTMLDivElement; let root: Root;
const network = vi.fn();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const project = "https://flow.google.com/project/11111111-2222-3333-4444-555555555555";
const button = (name: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === name)!;
async function click(el: Element) { await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
async function input(name: string, value: string) {
  const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
  const prototype = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(async () => {
  network.mockReset(); vi.stubGlobal("fetch", network);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<FlowImageDraft targetLabel="Google Flow fixture" />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("offline image preparation", () => {
  it("starts empty and never connects or spends on example load or draft preview", async () => {
    expect(container.querySelector("output")).toBeNull();
    await input("flow-draft-project", project);
    await click(button("2 örnek promptu yükle"));
    await click(button("Taslağı kontrol et"));
    expect(container.textContent).toContain("Taslak kontrol edildi — üretim başlamadı");
    expect([...container.querySelectorAll("output")].map((o) => o.textContent)).toEqual(["2", "1"]);
    expect(container.textContent).toContain("001_sahil.jpg");
    expect(container.textContent).toContain("002_orman.jpg");
    expect(network).not.toHaveBeenCalled();
    expect(container.textContent).toContain("eşleşmesi henüz doğrulanmaz");
  });
  it("blocks missing project URLs, empty prompts and name collisions", async () => {
    await click(button("Taslağı kontrol et"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Geçerli bir");
    await input("flow-draft-project", project); await click(button("Taslağı kontrol et"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("En az bir prompt");
    await input("flow-draft-source", "img | first\nIMG | second"); await click(button("Taslağı kontrol et"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("aynı isim tekrar ediyor");
    expect(container.querySelector("output")).toBeNull(); expect(network).not.toHaveBeenCalled();
  });
  it("invalidates the preview after either input changes", async () => {
    await input("flow-draft-project", project); await click(button("2 örnek promptu yükle")); await click(button("Taslağı kontrol et"));
    await input("flow-draft-source", "different | prompt"); expect(container.querySelector("output")).toBeNull();
    await click(button("Taslağı kontrol et")); expect(container.querySelector("output")?.textContent).toBe("1");
    await input("flow-draft-project", project.replace("11111111", "99999999")); expect(container.querySelector("output")).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });
  it("clears draft when remounted for a different selected tab", async () => {
    await input("flow-draft-source", "private_name | PRIVATE PROMPT");
    await act(async () => root.render(<FlowImageDraft key="new-tab" targetLabel="Another Flow tab" />));
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe("");
    expect(container.textContent).not.toContain("PRIVATE PROMPT");
  });
});
