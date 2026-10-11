// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrowserPage from "./BrowserPage";

const mocks = vi.hoisted(() => ({
  getBrowserStatus: vi.fn(), discoverBrowserProfiles: vi.fn(),
  profile: "default",
}));
vi.mock("@/lib/api", () => ({ api: mocks }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ locale: "tr" }) }));
vi.mock("@/contexts/useProfileScope", () => ({ useProfileScope: () => ({ profile: mocks.profile }) }));
// Keep tests about page behavior rather than design-system internal contexts.
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
const status = {
  backend: "browser-use", cdp_configured: true, real_profile_consent: false,
  connection_state: "not_verified",
  capabilities: { profile_discovery: true, profile_attach: false, parallel_tasks: false, live_preview: false },
};
const inventory = {
  read_only: true, emails_included: false,
  browsers: [{
    id: "chrome", label: "Google Chrome", installed: true, warning: null,
    profiles: ["Default", "Profile 1"].map((directory) => ({
      id: `chrome:${directory}`, label: directory, directory,
      connection_state: "not_connected", site_session: "not_checked",
    })),
  }],
};

async function render() {
  await act(async () => root.render(<BrowserPage />));
}
async function click(element: Element) {
  await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}
const discoverButton = () => [...container.querySelectorAll("button")].find(
  (button) => button.textContent === "Profilleri keşfet",
)!;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.profile = "default";
  mocks.getBrowserStatus.mockResolvedValue(status);
  mocks.discoverBrowserProfiles.mockResolvedValue(inventory);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Browser panel", () => {
  it("does not discover profiles without explicit consent or claim a verified connection", async () => {
    await render();
    expect(mocks.discoverBrowserProfiles).not.toHaveBeenCalled();
    expect(discoverButton().disabled).toBe(true);
    expect(container.textContent).toContain("Henüz doğrulanmadı");
    expect(container.textContent).toContain("Bu sürümde henüz uygulanmadı");
  });

  it("discovers metadata only after consent and supports independent transient selections", async () => {
    await render();
    await click(container.querySelector("input")!);
    await click(discoverButton());
    expect(mocks.discoverBrowserProfiles).toHaveBeenCalledTimes(1);
    expect(mocks.discoverBrowserProfiles).toHaveBeenCalledWith(false);
    expect(container.textContent).toContain("Google Chrome");
    expect(container.textContent).toContain("Bağlı değil");
    const boxes = container.querySelectorAll('input[name="browser-profile"]');
    await click(boxes[0]);
    await click(boxes[1]);
    expect(container.textContent).toContain("Seçilen profiller: 2");
    await click(boxes[0]);
    expect(container.textContent).toContain("Seçilen profiller: 1");
    await click(container.querySelector('input[name="metadata-consent"]')!);
    expect(container.textContent).not.toContain("Google Chrome");
    expect(container.textContent).toContain("Seçilen profiller: 0");
  });

  it("protects the dynamic counter from browser translation and counts four selections", async () => {
    // Emulate an external translator replacing text nodes outside translate=no.
    // Such replacement detaches React's text nodes and can freeze visible text.
    const profiles = Array.from({ length: 4 }, (_, i) => ({
      id: `chrome:Profile ${i}`, label: `Profile ${i}`, directory: `Profile ${i}`,
      connection_state: "not_connected", site_session: "not_checked",
    }));
    mocks.discoverBrowserProfiles.mockResolvedValue({
      ...inventory, browsers: [{ ...inventory.browsers[0], profiles }],
    });
    await render();
    await click(container.querySelector('input[name="metadata-consent"]')!);
    await click(discoverButton());
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.parentElement?.closest('[translate="no"]')) nodes.push(node);
    }
    nodes.forEach((node) => node.replaceWith(document.createTextNode(node.textContent || "")));
    const boxes = container.querySelectorAll<HTMLInputElement>('input[name="browser-profile"]');
    for (const box of boxes) await click(box);
    expect([...boxes].every((box) => box.checked)).toBe(true);
    expect(container.textContent).toContain("Seçilen profiller: 4");
    await click(boxes[0]);
    expect(container.textContent).toContain("Seçilen profiller: 3");
  });

  it("shows recorded emails only after separate consent and clears them on revocation", async () => {
    mocks.discoverBrowserProfiles.mockResolvedValue({
      ...inventory, emails_included: true,
      browsers: [{ ...inventory.browsers[0], profiles: [
        { ...inventory.browsers[0].profiles[0], email: "test@example.com" },
        { ...inventory.browsers[0].profiles[1], email: null },
      ] }],
    });
    await render();
    const emailBox = container.querySelector<HTMLInputElement>('input[name="email-consent"]')!;
    expect(emailBox.disabled).toBe(true);
    await click(container.querySelector('input[name="metadata-consent"]')!);
    await click(discoverButton());
    expect(container.textContent).not.toContain("test@example.com");
    await click(emailBox);
    expect(container.textContent).not.toContain("Google Chrome");
    await click(discoverButton());
    expect(mocks.discoverBrowserProfiles).toHaveBeenLastCalledWith(true);
    expect(container.textContent).toContain("test@example.com");
    expect(container.textContent).toContain("Yerel kayıtta e-posta bulunamadı");
    await click(emailBox);
    expect(container.textContent).not.toContain("test@example.com");
    expect(container.querySelector("output")?.textContent).toBe("0");
    await click(discoverButton());
    expect(mocks.discoverBrowserProfiles).toHaveBeenLastCalledWith(false);
  });

  it("reports configuration errors without showing sensitive backend error details", async () => {
    mocks.getBrowserStatus.mockRejectedValue(new Error("SECRET"));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("okunamadı");
    expect(container.textContent).not.toContain("SECRET");
  });

  it("reports discovery failures and permits retry", async () => {
    mocks.discoverBrowserProfiles.mockRejectedValueOnce(new Error("SECRET"));
    await render();
    await click(container.querySelector("input")!);
    await click(discoverButton());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("tamamlanamadı");
    expect(container.textContent).not.toContain("SECRET");
    await click(discoverButton());
    expect(container.textContent).toContain("Google Chrome");
  });

  it("shows partial permission failures without presenting them as an empty success", async () => {
    mocks.discoverBrowserProfiles.mockResolvedValue({
      read_only: true, emails_included: false,
      browsers: [{ id: "chrome", label: "Google Chrome", installed: true,
        warning: "access_denied", profiles: [] }],
    });
    await render();
    await click(container.querySelector("input")!);
    await click(discoverButton());
    expect(container.textContent).toContain("erişim reddedildi");
  });

  it("clears consent and selections on an agent-profile switch", async () => {
    await render();
    await click(container.querySelector("input")!);
    await click(discoverButton());
    await click(container.querySelector('input[name="browser-profile"]')!);
    mocks.profile = "worker";
    await render();
    expect(mocks.getBrowserStatus).toHaveBeenLastCalledWith("worker");
    expect(discoverButton().disabled).toBe(true);
    expect(container.textContent).not.toContain("Google Chrome");
    expect(container.textContent).toContain("Seçilen profiller: 0");
  });
});