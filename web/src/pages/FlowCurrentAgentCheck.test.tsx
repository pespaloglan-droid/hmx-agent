// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FlowCurrentAgentCheck from './FlowCurrentAgentCheck';
const mocks = vi.hoisted(() => ({ checkFlowStageAgent: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: mocks }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ locale: 'tr' }) }));
vi.mock('@nous-research/ui/ui/components/button', () => ({ Button: (props: React.ComponentProps<'button'>) => <button {...props} /> }));
let container: HTMLDivElement; let root: Root;
const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function click(el: Element) { await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))); }
beforeEach(async () => {
  vi.resetAllMocks(); container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<FlowCurrentAgentCheck key="tab-a" targetId="tab-a" />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function enter(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[aria-label]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('reads the explicitly selected current tab only after ID, fresh diagnostic consent and click', async () => {
  expect(container.querySelector('button')).toBeNull(); expect(mocks.checkFlowStageAgent).not.toHaveBeenCalled();
  await enter(id); expect(mocks.checkFlowStageAgent).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Seçili güncel sekmede Agent tanısı');
  await click(container.querySelector('[name="flow-agent-read-consent"]')!);
  expect(mocks.checkFlowStageAgent).not.toHaveBeenCalled();
  mocks.checkFlowStageAgent.mockResolvedValue({ state: 'agent_selected', production_authorized: false });
  await click(container.querySelector('button')!);
  expect(mocks.checkFlowStageAgent).toHaveBeenCalledExactlyOnceWith(id, 'tab-a');
  expect(container.textContent).toContain('agent_selected');
});
it('changing attempt ID discards consent and an in-flight result; changing selected tab remounts the form', async () => {
  let resolve!: (value: unknown) => void;
  mocks.checkFlowStageAgent.mockReturnValue(new Promise(r => { resolve = r; }));
  await enter(id); await click(container.querySelector('[name="flow-agent-read-consent"]')!);
  await click(container.querySelector('button')!);
  await enter('bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee');
  await act(async () => resolve({ state: 'OLD_RESULT' }));
  expect(container.textContent).not.toContain('OLD_RESULT');
  expect(container.querySelector<HTMLInputElement>('[name="flow-agent-read-consent"]')!.checked).toBe(false);
  await act(async () => root.render(<FlowCurrentAgentCheck key="tab-b" targetId="tab-b" />));
  expect(container.querySelector<HTMLInputElement>('input[aria-label]')!.value).toBe('');
  expect(container.querySelector('button')).toBeNull();
  expect(mocks.checkFlowStageAgent).toHaveBeenCalledTimes(1);
});
