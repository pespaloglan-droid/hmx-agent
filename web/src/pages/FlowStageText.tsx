import { useEffect, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import type { ImageDraftItem } from "@/lib/flow-image-draft";
import type { FlowStageResult } from "@/lib/api-browser";
interface Props { targetId: string; projectUrl: string; items: ImageDraftItem[] }
const copy = {
  tr: {
    title: "Test metnini Flow'a yerleştir — gönderim yok", scope: "Bu adım boş Agent alanına metin yazar, gönderme düğmesine basmaz. Üretim veya indirme yapmaz. Gönderim ayrı bir adım olacak; henüz uygulanmadı.",
    consent: "Bu test metninin seçili projedeki boş Agent alanına yazılmasına izin veriyorum; üretime gönderilmesine değil.",
    limit: "İlk yazma testi en fazla 2 prompt kabul eder; promptlar en fazla 3000 karakter olmalı. Yeni test isimleri hmx_test_ ile başlamalı (örnek: hmx_test_003_sahil, hmx_test_004_orman). Yukarıdaki listeyi düzenleyip taslak ve proje kontrolünü tekrar yapın.",
    record: "Deneme kaydı aktif Hermes profilinde yerel tutulur: proje, sekme ve metnin özeti (SHA-256); prompt metni kaydedilmez. Aynı metin/proje denemesi yeniden yazılmaz. Yenileme, başlamış yazma işlemini iptal etmez.",
    button: "Test metnini yerleştir (gönderme)", busy: "Chrome onayı / metin yerleştirme bekleniyor…", success: "Test metni yerleştirildi. Gönderme düğmesine basılmadı. Flow sekmesindeki metni kontrol edip ekranını paylaşın; elle göndermeyin.",
    failure: "Metin yerleştirme doğrulanamadı veya engellendi. Otomatik tekrar yapılmadı. Flow sekmesini kontrol edip sonucu paylaşın; aynı isteği yeniden göndermeyin.",
    duplicate: "Bu deneme daha önce kaydedilmiş. Yeniden yazma yapılmadı. Önce Flow'daki alanı kontrol edin.", id: "Deneme kimliği", send: "Gönderme kontrolü etkin", yes: "Evet", no: "Hayır",
  },
  en: {
    title: "Stage test text in Flow — no submission", scope: "Writes text into the empty Agent composer without pressing send. No production or download. Submission is a separate step and is not implemented yet.",
    consent: "Allow writing this test text into the selected project's empty Agent composer, not submitting it for production.",
    limit: "The first writing test accepts at most 2 prompts, each up to 3000 characters. Use new names beginning hmx_test_ (e.g. hmx_test_003_coast, hmx_test_004_forest). Edit the list and repeat draft/project checks.",
    record: "A local attempt record lives in the active Hermes profile: project, tab and SHA-256 text digest, not the prompt text. The same project/text attempt is not written twice. Refresh does not cancel an already-started write.",
    button: "Stage test text (do not send)", busy: "Waiting for Chrome approval / text staging…", success: "Test text staged. Send was not pressed. Check the text in Flow and share its screen; do not send manually.",
    failure: "Text staging could not be verified or was blocked. No automatic retry. Check Flow and share the result; do not repeat the same request.", duplicate: "This attempt was recorded previously. No rewrite was performed. Check the Flow composer first.", id: "Attempt ID", send: "Send control enabled", yes: "Yes", no: "No",
  },
};
export default function FlowStageText({ targetId, projectUrl, items }: Props) {
  const { locale } = useI18n(); const text = copy[locale === "tr" ? "tr" : "en"];
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FlowStageResult | null>(null); const [failed, setFailed] = useState(false);
  const [stageId, setStageId] = useState<string | null>(null);
  const pending = useRef(false); const attempted = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const eligible = items.length > 0 && items.length <= 2 && items.every((row) =>
    /^hmx_test_[A-Za-z0-9_-]{1,60}$/.test(row.name) && row.prompt.length <= 3000);
  async function stage() {
    if (!consent || !eligible || pending.current || attempted.current) return;
    attempted.current = true; pending.current = true; setBusy(true); setFailed(false);
    const id = crypto.randomUUID(); setStageId(id);
    try {
      const data = await api.stageFlowText(id, targetId, projectUrl, items);
      if (mounted.current) setResult(data);
    } catch {
      // Reading a durable status is safe; retrying the editor mutation is not.
      try { const data = await api.getFlowStageStatus(id); if (mounted.current) setResult(data); }
      catch { if (mounted.current) setFailed(true); }
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="space-y-3 rounded border border-border p-3" translate="no">
    <h4 className="font-semibold">{text.title}</h4><p className="text-sm text-muted-foreground">{text.scope}</p>
    <p className="text-sm text-muted-foreground">{text.record}</p>
    {!eligible && <p role="status">{text.limit}</p>}
    <label className="flex items-start gap-3"><input type="checkbox" name="flow-stage-consent" checked={consent}
      disabled={!eligible || busy || !!stageId} className="mt-1 shrink-0" onChange={(event) => setConsent(event.target.checked)} /><span>{text.consent}</span></label>
    <Button className="h-auto min-h-9 max-w-full whitespace-normal px-3 py-2 leading-relaxed" disabled={!consent || !eligible || busy || !!stageId}
      onClick={() => void stage()}>{text.button}</Button>
    <div aria-live="polite">{busy && <p role="status">{text.busy}</p>}{failed && <p role="alert">{text.failure}</p>}
      {result && <p role={result.state === "text_staged" ? "status" : "alert"}>{result.state === "text_staged" ? text.success : result.state === "attempt_exists" ? text.duplicate : text.failure}</p>}
    </div>
    {result?.send_enabled !== undefined && <p>{text.send}: {result.send_enabled ? text.yes : text.no}</p>}
    {stageId && <p className="break-all text-sm">{text.id}: {stageId}</p>}
  </section>;
}
