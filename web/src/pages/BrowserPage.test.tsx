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
  read_only: true,
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
    expect(container.textContent).toContain("Google Chrome");
    expect(container.textContent).toContain("Bağlı değil");
    const boxes = container.querySelectorAll("input");
    await click(boxes[1]);
    await click(boxes[2]);
    expect(container.textContent).toContain("Seçilen profiller: 2");
    await click(boxes[1]);
    expect(container.textContent).toContain("Seçilen profiller: 1");
    await click(boxes[0]);
    expect(container.textContent).not.toContain("Google Chrome");
    expect(container.textContent).toContain("Seçilen profiller: 0");
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
      read_only: true,
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
    await click(container.querySelectorAll("input")[1]);
    mocks.profile = "worker";
    await render();
    expect(mocks.getBrowserStatus).toHaveBeenLastCalledWith("worker");
    expect(discoverButton().disabled).toBe(true);
    expect(container.textContent).not.toContain("Google Chrome");
    expect(container.textContent).toContain("Seçilen profiller: 0");
  });
});