import { useEffect, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import type { FlowAgentResult } from "@/lib/api-browser";

const copy = {
  tr: {
    title: "Agent düğmesi tanısı — salt okunur",
    scope: "Yalnızca kayıtlı sekmedeki Agent düğmesinin durumu okunur. Prompt okunmaz/yazılmaz; gönderim, üretim ve indirme yapılmaz. Bu sonuç üretim izni değildir.",
    consent: "Kayıtlı sekmede salt okunur Agent tanısına izin veriyorum.",
    check: "Agent durumunu oku (gönderme yok)", busy: "Chrome onayı / tanı bekleniyor…",
    failed: "Tanı okunamadı. Otomatik tekrar ve gönderim yapılmadı.",
    total: "Bulunan düğme", visible: "Görünür düğme", selected: "Seçili görünür düğme", enabled: "Düğme etkin",
  },
  en: {
    title: "Agent button diagnostic — read only",
    scope: "Only Agent button state in the recorded tab is read. No prompt reads/writes, submission, production or download. This result does not authorize production.",
    consent: "Allow a read-only Agent diagnostic in the recorded tab.",
    check: "Read Agent state (no submission)", busy: "Waiting for Chrome approval / diagnostic…",
    failed: "Could not read diagnostic. No automatic retry or submission.",
    total: "Matched buttons", visible: "Visible buttons", selected: "Selected visible buttons", enabled: "Button enabled",
  },
};

export default function FlowAgentCheck({ stageId, currentTargetId }: { stageId: string; currentTargetId?: string }) {
  const { locale } = useI18n(); const text = copy[locale === "tr" ? "tr" : "en"];
  const currentCopy = locale === "tr" ? {
    title: "Seçili güncel sekmede Agent tanısı — salt okunur",
    scope: "Yukarıda seçtiğiniz güncel sekme, eski kayıttaki proje adresiyle karşılaştırılır. Eski kayıt ve gönderim kilitleri değiştirilmez. Prompt okunmaz/yazılmaz; gönderim, üretim ve indirme yoktur.",
    consent: "Seçtiğim güncel sekmede salt okunur Agent tanısına izin veriyorum.",
  } : {
    title: "Agent diagnostic in the selected current tab — read only",
    scope: "The current tab selected above is checked against the recorded project. The saved record and submission fences remain unchanged. No prompt reads/writes, submission, production or download.",
    consent: "Allow a read-only Agent diagnostic in my selected current tab.",
  };
  const scope = currentTargetId ? currentCopy : text;
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false); const [result, setResult] = useState<FlowAgentResult | null>(null);
  const pending = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function check() {
    if (!consent || pending.current) return;
    pending.current = true; setBusy(true); setFailed(false); setResult(null);
    try {
      const data = currentTargetId ? await api.checkFlowStageAgent(stageId, currentTargetId) : await api.checkFlowStageAgent(stageId);
      if (mounted.current) setResult(data);
    }
    catch { if (mounted.current) setFailed(true); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  const markers = result?.markers;
  return <section className="space-y-3 border border-border p-3" translate="no">
    <h4 className="font-semibold">{scope.title}</h4><p className="text-sm text-muted-foreground">{scope.scope}</p>
    <label className="flex items-start gap-3"><input type="checkbox" name="flow-agent-read-consent"
      className="mt-1 shrink-0" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />
      <span>{scope.consent}</span></label>
    <Button className="h-auto min-h-9 max-w-full whitespace-normal px-3 py-2 leading-relaxed" disabled={!consent || busy}
      onClick={() => void check()}>{text.check}</Button>
    <div aria-live="polite">
      {busy && <p role="status">{text.busy}</p>}{failed && <p role="alert">{text.failed}</p>}
      {result && <p role="status">{result.state}</p>}
      {markers && <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        <div><dt>{text.total}</dt><dd>{markers.agent_total_count}</dd></div>
        <div><dt>{text.visible}</dt><dd>{markers.agent_visible_count}</dd></div>
        <div><dt>{text.selected}</dt><dd>{markers.agent_selected_visible_count}</dd></div>
        <div><dt>aria-pressed</dt><dd>{markers.agent_pressed}</dd></div>
        <div><dt>{text.enabled}</dt><dd>{String(markers.agent_enabled)}</dd></div>
      </dl>}
    </div>
  </section>;
}
