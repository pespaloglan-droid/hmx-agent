// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlowSubmitTest from './FlowSubmitTest';
const mocks = vi.hoisted(() => ({ getFlowStageStatus: vi.fn(), submitFlowStage: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: mocks }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ locale: 'tr' }) }));
vi.mock('@nous-research/ui/ui/components/button', () => ({ Button: (props: React.ComponentProps<'button'>) => <button {...props} /> }));
let container: HTMLDivElement; let root: Root;
const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const record = { state: 'text_staged', stage_id: id, production_submitted: false,
  stage_meta: { target_id: 'chosen', project_url: 'https://flow.google.com/project/11111111-2222-3333-4444-555555555555', item_count: 2 } };
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function click(el: Element) { await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))); }
function button(label: string) { return [...container.querySelectorAll('button')].find(el => el.textContent === label)!; }
async function input(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function review() {
  await input(container.querySelector('input')!, id);
  await click(button('003/004 test listesini yükle'));
  await click(button('Deneme kaydını oku'));
}
async function approve() {
  await click(container.querySelector('[name="flow-submit-settings"]')!);
  await click(container.querySelector('[name="flow-submit-consent"]')!);
}
beforeEach(async () => {
  vi.resetAllMocks(); mocks.getFlowStageStatus.mockResolvedValue(record);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<FlowSubmitTest />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
describe('one separately authorized production request', () => {
  it('does nothing on mount/review/consent alone, then sends exactly once and does not claim completed images', async () => {
    expect(mocks.getFlowStageStatus).not.toHaveBeenCalled(); expect(mocks.submitFlowStage).not.toHaveBeenCalled();
    expect(button('Testi üretime bir kez gönder').disabled).toBe(true);
    await review(); await click(container.querySelector('[name="flow-submit-settings"]')!);
    expect(button('Testi üretime bir kez gönder').disabled).toBe(true);
    await click(container.querySelector('[name="flow-submit-consent"]')!);
    expect(mocks.submitFlowStage).not.toHaveBeenCalled();
    mocks.submitFlowStage.mockResolvedValue({ state: 'submit_clicked', production_submitted: null });
    await click(button('Testi üretime bir kez gönder')); await click(button('Testi üretime bir kez gönder'));
    expect(mocks.submitFlowStage).toHaveBeenCalledTimes(1);
    expect(mocks.submitFlowStage.mock.calls[0][0]).toBe(id);
    expect(mocks.submitFlowStage.mock.calls[0][1]).toEqual([
      { name: 'hmx_test_003_sahil', prompt: 'Gün batımında sakin bir sahil, gerçekçi fotoğraf, yazı veya logo yok.' },
      { name: 'hmx_test_004_orman', prompt: 'Sabah sisinde yeşil bir orman, gerçekçi fotoğraf, yazı veya logo yok.' },
    ]);
    expect(container.textContent).toContain('henüz doğrulanmadı');
    expect(button('Testi üretime bir kez gönder').disabled).toBe(true);
    expect(container.textContent).toContain('teknik olarak sınırlandırılmıyor');
  });
  it.each(['submission_uncertain', 'submit_clicked', 'not_found', 'stage_uncertain'])('refuses an ineligible durable record: %s', async state => {
    mocks.getFlowStageStatus.mockResolvedValue({ ...record, state }); await review();
    expect(container.querySelector<HTMLInputElement>('[name="flow-submit-consent"]')!.disabled).toBe(true);
    expect(button('Testi üretime bir kez gönder').disabled).toBe(true);
    expect(mocks.submitFlowStage).not.toHaveBeenCalled();
  });
  it('after response loss only reads status, never repeats the submission', async () => {
    await review(); await approve(); mocks.submitFlowStage.mockRejectedValue(new Error('SECRET'));
    mocks.getFlowStageStatus.mockResolvedValue({ ...record, state: 'submission_uncertain' });
    await click(button('Testi üretime bir kez gönder'));
    expect(mocks.submitFlowStage).toHaveBeenCalledTimes(1);
    expect(mocks.getFlowStageStatus).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Tekrar gönderilmedi'); expect(container.textContent).not.toContain('SECRET');
    expect(button('Testi üretime bir kez gönder').disabled).toBe(true);
  });
  it('changing approved input clears the record and both consents', async () => {
    await review(); await approve();
    await input(container.querySelector('textarea')!, 'hmx_test_changed | new');
    expect(container.querySelector<HTMLInputElement>('[name="flow-submit-consent"]')!.checked).toBe(false);
    expect(container.querySelector<HTMLInputElement>('[name="flow-submit-settings"]')!.checked).toBe(false);
    expect(button('Testi üretime bir kez gönder').disabled).toBe(true);
    expect(mocks.submitFlowStage).not.toHaveBeenCalled();
  });
  it('locks while pending and ignores a late result after leaving the panel', async () => {
    let release!: (value: unknown) => void;
    await review(); await approve(); mocks.submitFlowStage.mockReturnValue(new Promise(resolve => { release = resolve; }));
    await click(button('Testi üretime bir kez gönder'));
    expect(container.querySelector('textarea')!.disabled).toBe(true);
    await act(async () => root.render(<div>Left</div>)); await act(async () => release({ state: 'submit_clicked' }));
    expect(container.textContent).toBe('Left'); expect(mocks.submitFlowStage).toHaveBeenCalledTimes(1);
  });
});
