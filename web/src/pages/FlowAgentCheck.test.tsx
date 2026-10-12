// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FlowAgentCheck from './FlowAgentCheck';
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
  await act(async () => root.render(<FlowAgentCheck key={id} stageId={id} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it('does nothing until separate consent and action, reads only the bound ID and displays predicate markers', async () => {
  const button = container.querySelector('button')!;
  expect(button.disabled).toBe(true); expect(mocks.checkFlowStageAgent).not.toHaveBeenCalled();
  await click(container.querySelector('input')!);
  expect(mocks.checkFlowStageAgent).not.toHaveBeenCalled();
  mocks.checkFlowStageAgent.mockResolvedValue({ state: 'agent_ambiguous', production_authorized: false,
    markers: { agent_total_count: 2, agent_visible_count: 2, agent_selected_visible_count: 1,
      agent_enabled: false, agent_pressed: 'none' } });
  await click(button);
  expect(mocks.checkFlowStageAgent).toHaveBeenCalledExactlyOnceWith(id);
  expect(container.textContent).toContain('agent_ambiguous');
  expect(container.textContent).toContain('aria-pressednone');
  expect(container.textContent).toContain('Düğme etkinfalse');
});
it('locks pending reads and discards results when a different ID remounts', async () => {
  let resolve!: (value: unknown) => void;
  mocks.checkFlowStageAgent.mockReturnValue(new Promise(r => { resolve = r; }));
  await click(container.querySelector('input')!); await click(container.querySelector('button')!);
  await click(container.querySelector('button')!); expect(mocks.checkFlowStageAgent).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<FlowAgentCheck key="new" stageId="bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee" />));
  await act(async () => resolve({ state: 'OLD_RESULT' }));
  expect(container.textContent).not.toContain('OLD_RESULT');
  expect(container.querySelector('input')!.checked).toBe(false);
});
it('does not automatically retry failures or submit production', async () => {
  mocks.checkFlowStageAgent.mockRejectedValue(new Error('PRIVATE'));
  await click(container.querySelector('input')!); await click(container.querySelector('button')!);
  expect(container.textContent).toContain('Otomatik tekrar ve gönderim yapılmadı');
  expect(container.textContent).not.toContain('PRIVATE');
  expect(mocks.checkFlowStageAgent).toHaveBeenCalledTimes(1);
});
