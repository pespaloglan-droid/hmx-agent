import { useEffect, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { api } from "@/lib/api";
import type { FlowProjectResult } from "@/lib/api-browser";
import { useI18n } from "@/i18n";
interface Props { targetId: string; projectUrl: string }
const copy = {
  tr: {
    title: "Proje ve Agent alanı kontrolü — salt okunur", consent: "Seçili sekmenin bu projede olduğunu ve Agent yazı alanının durumunu okumaya izin veriyorum.",
    note: "Yazı alanına hiçbir şey yazılmaz; gönderme, üretim veya indirme yapılmaz. Hesap ve model ayarları doğrulanmaz. Kontrol sonucu üretim izni değildir.",
    button: "Proje ve Agent alanını kontrol et", busy: "Chrome onayı / proje kontrolü bekleniyor…", ready: "Proje eşleşti; tek boş Agent yazı alanı ve gönderme kontrolü görüldü. Üretim başlamadı.",
    inconclusive: "Proje eşleşti; Agent alanı henüz güvenle belirlenemedi. Aşağıdaki kontrol sonucunu paylaşın.", mismatch: "Seçilen sekme başka projede veya beklenen adres dışında. Başka sekmeye geçilmedi.",
    error: "Proje kontrolü tamamlanamadı. Chrome iznini kontrol edin; başka sekmeye otomatik geçilmedi.",
    yes: "Evet", no: "Hayır", checked: "Kontrol zamanı", fields: { page_ready: "Sayfa hazır", composer_empty: "Tek yazı alanı boş", agent_mode_visible: "Agent etiketi görüldü", stop_button_visible: "Durdurma kontrolü görüldü", send_enabled: "Gönderme kontrolü etkin", textarea_count: "Textarea sayısı", contenteditable_count: "Düzenlenebilir alan sayısı", send_button_count: "Gönderme kontrolü sayısı" },
  },
  en: {
    title: "Project and Agent composer check — read-only", consent: "Allow checking the selected tab's project and Agent composer state.", note: "Nothing is typed, submitted, generated or downloaded. Account/model settings are not verified. This result is not production permission.",
    button: "Check project and Agent composer", busy: "Waiting for Chrome approval / project check…", ready: "Project matched; one empty Agent composer and a send control were observed. Production has not started.",
    inconclusive: "Project matched; the Agent composer could not be safely identified. Share the markers below.", mismatch: "Selected tab is in another project or outside the expected URL. No fallback tab was used.", error: "Project check could not complete. Check Chrome permission; no fallback tab was used.",
    yes: "Yes", no: "No", checked: "Checked at", fields: { page_ready: "Page ready", composer_empty: "Single composer empty", agent_mode_visible: "Agent label observed", stop_button_visible: "Stop control observed", send_enabled: "Send control enabled", textarea_count: "Textarea count", contenteditable_count: "Contenteditable count", send_button_count: "Send control count" },
  },
};
export default function FlowProjectPreflight({ targetId, projectUrl }: Props) {
  const { locale } = useI18n(); const text = copy[locale === "tr" ? "tr" : "en"];
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FlowProjectResult | null>(null); const [failed, setFailed] = useState(false);
  const mounted = useRef(true); const pending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function check() {
    if (!consent || pending.current) return;
    pending.current = true; setBusy(true); setResult(null); setFailed(false);
    try { const data = await api.checkFlowProject(targetId, projectUrl); if (mounted.current) setResult(data); }
    catch { if (mounted.current) setFailed(true); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  const message = !result ? null : result.state === "project_ready" ? text.ready : result.state === "project_inconclusive" ? text.inconclusive : result.state === "project_mismatch" || result.state === "target_unavailable" ? text.mismatch : text.error;
  return <section className="space-y-3 rounded border border-border p-3" translate="no">
    <h4 className="font-semibold">{text.title}</h4><p className="text-sm text-muted-foreground">{text.note}</p>
    <label className="flex items-start gap-3"><input type="checkbox" name="flow-project-consent" checked={consent} disabled={busy} className="mt-1 shrink-0"
      onChange={(event) => { setConsent(event.target.checked); setResult(null); setFailed(false); }} /><span>{text.consent}</span></label>
    <Button className="h-auto min-h-9 max-w-full whitespace-normal px-3 py-2 leading-relaxed" disabled={!consent || busy} onClick={() => void check()}>{text.button}</Button>
    <div aria-live="polite">{busy && <p role="status">{text.busy}</p>}{failed && <p role="alert">{text.error}</p>}{message && <p role={result?.state === "project_ready" ? "status" : "alert"}>{message}</p>}</div>
    {result?.markers && <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(result.markers).map(([key, value]) => <div key={key}>
      <dt className="text-sm text-muted-foreground">{text.fields[key as keyof typeof text.fields]}</dt><dd>{typeof value === "boolean" ? value ? text.yes : text.no : value}</dd>
    </div>)}</dl>}
    {result?.checked_at && <p className="text-sm">{text.checked}: {new Date(result.checked_at).toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}</p>}
  </section>;
}
