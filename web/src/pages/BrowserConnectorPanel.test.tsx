// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import BrowserConnectorPanel from './BrowserConnectorPanel';
const mocks = vi.hoisted(() => ({ pairReadonlyChrome: vi.fn(), listReadonlyChrome: vi.fn(), readReadonlyChrome: vi.fn(), disconnectReadonlyChrome: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: mocks }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ locale: 'tr' }) }));
vi.mock('@nous-research/ui/ui/components/button', () => ({ Button: (props: React.ComponentProps<'button'>) => <button {...props} /> }));
let container: HTMLDivElement; let root: Root;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
async function click(el: Element) { await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))); }
function button(label: string) { return [...container.querySelectorAll('button')].find(el => el.textContent === label)!; }
async function input(label: string, value: string) {
  const el = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
beforeEach(async () => {
  vi.resetAllMocks(); container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  mocks.listReadonlyChrome.mockResolvedValue({ connections: ['Default', 'Profile 5'].map(folder => ({ browser_profile_id: `chrome:${folder}`, install_id: id, state: 'connected_readonly', busy: false })), agent_control: false });
  await act(async () => root.render(<BrowserConnectorPanel />));
});
afterEach(async () => { vi.useRealTimers(); await act(async () => root.unmount()); container.remove(); });
it('requires an explicit list, exact selection and fresh read consent', async () => {
  expect(mocks.listReadonlyChrome).not.toHaveBeenCalled(); expect(mocks.pairReadonlyChrome).not.toHaveBeenCalled();
  await click(button('Bağlı Chrome profillerini yenile')); await click(container.querySelectorAll('[name="readonly-chrome-profile"]')[1]);
  expect(button('Seçili profilin sekmelerini oku').disabled).toBe(true);
  await click(container.querySelector('[name="connector-read-consent"]')!); expect(mocks.readReadonlyChrome).not.toHaveBeenCalled();
  mocks.readReadonlyChrome.mockResolvedValue({ state: 'read_complete', tabs: [{ title: '<script>fixture</script>', origin: 'https://example.org' }], agent_control: false });
  await click(button('Seçili profilin sekmelerini oku')); expect(mocks.readReadonlyChrome).toHaveBeenCalledWith('chrome:Profile 5', 'browser_tabs');
  expect(container.querySelector('script')).toBeNull(); expect(container.textContent).toContain('<script>fixture</script>');
  await click(container.querySelectorAll('[name="readonly-chrome-profile"]')[0]);
  expect(container.querySelector<HTMLInputElement>('[name="connector-read-consent"]')!.checked).toBe(false); expect(container.querySelector('li')).toBeNull();
});
it('masks the secret code, expires it and resets consent on editing the profile', async () => {
  await input('Chrome directory', 'Default'); await input('Extension installation ID', id); await click(container.querySelector('[name="connector-pair-consent"]')!);
  mocks.pairReadonlyChrome.mockResolvedValue({ ticket: 'PRIVATE_TICKET', ttl_seconds: 30, browser_profile_id: 'chrome:Default', install_id: id });
  vi.useFakeTimers(); await click(button('30 saniyelik eşleştirme kodu oluştur'));
  expect(mocks.pairReadonlyChrome).toHaveBeenCalledWith('chrome:Default', id);
  expect(container.querySelector<HTMLInputElement>('[aria-label="Secret pairing code"]')!.type).toBe('password'); expect(container.textContent).not.toContain('PRIVATE_TICKET');
  await act(async () => vi.advanceTimersByTime(30001)); expect(container.querySelector('[aria-label="Secret pairing code"]')).toBeNull();
  vi.useRealTimers(); await input('Chrome directory', 'Profile 5'); expect(container.querySelector<HTMLInputElement>('[name="connector-pair-consent"]')!.checked).toBe(false);
});
it('never retries or displays raw failures', async () => {
  mocks.listReadonlyChrome.mockRejectedValue(new Error('PRIVATE_ERROR')); await click(button('Bağlı Chrome profillerini yenile'));
  expect(mocks.listReadonlyChrome).toHaveBeenCalledTimes(1); expect(container.textContent).not.toContain('PRIVATE_ERROR');
});
it('ignores a late response after leaving this Hermes profile', async () => {
  let release!: (data: unknown) => void; mocks.listReadonlyChrome.mockReturnValue(new Promise(resolve => { release = resolve; }));
  await click(button('Bağlı Chrome profillerini yenile')); await act(async () => root.render(<div>Another profile</div>));
  await act(async () => release({ connections: [], agent_control: false })); expect(container.textContent).toBe('Another profile');
});
