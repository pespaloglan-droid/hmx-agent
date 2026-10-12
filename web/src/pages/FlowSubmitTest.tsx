import FlowAgentCheck from "./FlowAgentCheck";
import { useEffect, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import type { FlowStageResult } from "@/lib/api-browser";
import { parseImageDraft, type ImageDraftItem } from "@/lib/flow-image-draft";

const sample = "hmx_test_003_sahil | Gün batımında sakin bir sahil, gerçekçi fotoğraf, yazı veya logo yok.\n"
  + "hmx_test_004_orman | Sabah sisinde yeşil bir orman, gerçekçi fotoğraf, yazı veya logo yok.";
const copy = {
  tr: {
    title: "Yerleştirilmiş testi gönder — ayrı üretim onayı",
    scope: "Yalnızca kayıtlı test metni için tek gönderme tıklaması. Metin yeniden yazılmaz. Agent seçimi, aynı metin ve aynı proje yeniden kontrol edilir. Toplu üretim, tamamlanma takibi ve indirme henüz yok.",
    id: "Deneme kimliği", rows: "Aynı isim ve prompt listesi (isim | prompt)", sample: "003/004 test listesini yükle",
    read: "Deneme kaydını oku", busy: "İşlem / Chrome onayı bekleniyor…",
    settings: "Flow'da doğru hesabı, Nano Banana 2.1 modelini, 16:9 ve x1 ayarlarını kendim kontrol ettim; Agent modu seçili.",
    consent: "Bu kayıtlı, en fazla 2 satırlık görsel isteğinin üretime bir kez gönderilmesine izin veriyorum. Kredi harcanabilir; maliyet hesaplanmadı ve Flow'un çıktı/kredi miktarı teknik olarak sınırlandırılmıyor.",
    send: "Testi üretime bir kez gönder", status: "Kayıt durumu",
    ready: "Kayıt bulundu. Flow'u yenilemeyin, metni değiştirmeyin ve elle göndermeyin. Liste kayıtla birebir aynı olmalı.",
    blocked: "Kayıt gönderime uygun değil veya kontrol engellendi. Yeniden yazma/gönderme yapılmadı. Flow ekranını ve sonucu paylaşın.",
    clicked: "Gönderme düğmesine bir kez basıldı. Flow'un isteği kabul ettiği, görsellerin tamamlandığı veya kredi miktarı henüz doğrulanmadı. Elle tekrar göndermeyin; Flow ekranını paylaşın.",
    uncertain: "Gönderim sonucu belirsiz veya deneme kilitli. Tekrar gönderilmedi. Flow ekranını kontrol edip paylaşın.",
    failure: "Kayıt/sonuç okunamadı. Otomatik tekrar yapılmadı; Flow'u kontrol edin.",
    limit: "Kayıttaki aynı 1–2 satırı girin. İsimler hmx_test_ ile başlamalı; prompt başına en fazla 3000 karakter.",
  },
  en: {
    title: "Submit staged test — separate production consent",
    scope: "One send-control click for a recorded test. No rewriting. Selected Agent mode, exact text and project are checked again. Batch production, completion tracking and download are not implemented.",
    id: "Attempt ID", rows: "Identical names and prompts (name | prompt)", sample: "Load 003/004 test list",
    read: "Read attempt record", busy: "Waiting for operation / Chrome approval…",
    settings: "I checked the correct account, Nano Banana 2.1, 16:9 and x1 in Flow myself; Agent mode is selected.",
    consent: "Allow this recorded image request of at most 2 rows to be submitted once for production. Credits may be spent; cost is unknown and Flow's output/credit count is not technically capped.",
    send: "Submit test once for production", status: "Record status",
    ready: "Record found. Do not reload Flow, edit the text or submit manually. The list must exactly match the record.",
    blocked: "Record is not eligible or a check blocked submission. No rewrite/resubmission. Share the Flow screen and result.",
    clicked: "Send was clicked once. Flow acceptance, completed images and credit usage are not yet verified. Do not resend manually; share the Flow screen.",
    uncertain: "Submission is uncertain or the attempt is fenced. No resubmission. Check and share the Flow screen.",
    failure: "Could not read the record/result. No automatic retry; check Flow.",
    limit: "Enter the same recorded 1–2 rows, with hmx_test_ names and at most 3000 characters per prompt.",
  },
};

function validTestRows(items: ImageDraftItem[], issues: number) {
  return !issues && items.length > 0 && items.length <= 2
    && items.every(row => /^hmx_test_[A-Za-z0-9_-]{1,60}$/.test(row.name) && row.prompt.length <= 3000);
}
function canSubmit(record: FlowStageResult | null, id: string, count: number, validRows: boolean) {
  return record?.state === "text_staged" && record.stage_id === id
    && record.stage_meta?.item_count === count && validRows;
}

interface ResultProps {
  busy: boolean; failed: boolean; result: FlowStageResult | null;
  busyLabel: string; failedLabel: string; outcome: (data: FlowStageResult) => string;
}
function SubmitOutcome({ busy, failed, result, busyLabel, failedLabel, outcome }: ResultProps) {
  return <div aria-live="polite">{busy && <p role="status">{busyLabel}</p>}
    {failed && <p role="alert">{failedLabel}</p>}
    {result && <p role="status">{outcome(result)} ({result.state})</p>}</div>;
}

export default function FlowSubmitTest() {
  const { locale } = useI18n(); const text = copy[locale === "tr" ? "tr" : "en"];
  const [id, setId] = useState(""); const [source, setSource] = useState("");
  const [record, setRecord] = useState<FlowStageResult | null>(null);
  const [result, setResult] = useState<FlowStageResult | null>(null);
  const [settings, setSettings] = useState(false); const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const pending = useRef(false); const attempt = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const parsed = parseImageDraft(source);
  const validId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
  const validRows = validTestRows(parsed.items, parsed.issues.length);
  const eligible = canSubmit(record, id, parsed.items.length, validRows);
  function resetReview() { setRecord(null); setResult(null); setSettings(false); setConsent(false); setFailed(false); }
  async function read() {
    if (!validId || pending.current || attempt.current) return;
    pending.current = true; setBusy(true); resetReview();
    try { const data = await api.getFlowStageStatus(id); if (mounted.current) setRecord(data); }
    catch { if (mounted.current) setFailed(true); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  async function submit() {
    if (!eligible || !settings || !consent || pending.current || attempt.current) return;
    attempt.current = true; setAttempted(true); pending.current = true; setBusy(true); setFailed(false);
    try { const data = await api.submitFlowStage(id, parsed.items); if (mounted.current) setResult(data); }
    catch {
      // Read-only reconciliation, never replay a possibly executed click.
      try { const data = await api.getFlowStageStatus(id); if (mounted.current) setResult(data); }
      catch { if (mounted.current) setFailed(true); }
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  function outcome(data: FlowStageResult) {
    if (data.state === "submit_clicked") return text.clicked;
    if (data.state === "submission_uncertain" || data.state === "submission_fenced") return text.uncertain;
    return text.blocked;
  }
  const buttonClass = "h-auto min-h-9 max-w-full whitespace-normal px-3 py-2 leading-relaxed";
  return <section className="space-y-4 border border-border p-5" translate="no">
    <h3 className="font-semibold">{text.title}</h3><p className="text-sm text-muted-foreground">{text.scope}</p>
    <label className="block space-y-1"><span>{text.id}</span><input aria-label={text.id} value={id} disabled={busy || attempted}
      className="w-full min-w-0 rounded border border-border bg-transparent p-2"
      onChange={event => { setId(event.target.value.trim()); resetReview(); }} /></label>
    {validId && <FlowAgentCheck key={id} stageId={id} />}
    <label className="block space-y-1"><span>{text.rows}</span><textarea aria-label={text.rows} value={source}
      disabled={busy || attempted} className="w-full min-w-0 rounded border border-border bg-transparent p-2" rows={4}
      onChange={event => { setSource(event.target.value); resetReview(); }} /></label>
    <div className="flex flex-wrap gap-2">
      <Button className={buttonClass} disabled={busy || attempted} onClick={() => { setSource(sample); resetReview(); }}>{text.sample}</Button>
      <Button className={buttonClass} disabled={!validId || busy || attempted} onClick={() => void read()}>{text.read}</Button>
    </div>
    {!validRows && <p className="text-sm">{text.limit}</p>}
    {record && <div className="space-y-2 text-sm"><p>{text.status}: {record.state}</p>
      {record.stage_meta && <p className="break-all">{record.stage_meta.project_url} · {record.stage_meta.item_count}</p>}
      <p role="status">{record.state === "text_staged" ? text.ready : outcome(record)}</p></div>}
    <label className="flex items-start gap-3"><input type="checkbox" checked={settings} name="flow-submit-settings"
      disabled={!eligible || busy || attempted} className="mt-1 shrink-0" onChange={event => setSettings(event.target.checked)} /><span>{text.settings}</span></label>
    <label className="flex items-start gap-3"><input type="checkbox" checked={consent} name="flow-submit-consent"
      disabled={!eligible || busy || attempted} className="mt-1 shrink-0" onChange={event => setConsent(event.target.checked)} /><span>{text.consent}</span></label>
    <Button className={buttonClass} disabled={!eligible || !settings || !consent || busy || attempted}
      onClick={() => void submit()}>{text.send}</Button>
    <SubmitOutcome busy={busy} failed={failed} result={result}
      busyLabel={text.busy} failedLabel={text.failure} outcome={outcome} />
  </section>;
}