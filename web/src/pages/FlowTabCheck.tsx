import { useEffect, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { api } from "@/lib/api";
import type { BrowserFlowResult } from "@/lib/api-browser";
import { useI18n } from "@/i18n";
import FlowImageDraft from "./FlowImageDraft";

const copy = {
  tr: {
    title: "Flow sekmesi — salt okunur kontrol",
    note: "Önce bu Chrome örneğindeki açık Flow sekmelerini bulun, sonra birini açıkça seçin. Tarayıcı profil kutuları bu seçimin yerine geçmez; sekme ile Gmail/profil eşleştirmesi henüz yapılmaz.",
    consent: "Flow sekme başlıklarının ve seçeceğim sekmedeki sayfa durumu işaretlerinin okunmasına izin veriyorum.",
    privacy: "Yalnızca https://flow.google.com sekmeleri kabul edilir. Başka sitelerin başlıkları gösterilmez. Tıklama, yeni proje, üretim, hesap değiştirme, parola veya çerez okuma yoktur. Chrome her bağlantıda onay isteyebilir.",
    discover: "Açık Flow sekmelerini bul", check: "Seçili Flow sekmesini kontrol et",
    waiting: "Chrome onayı / Flow kontrolü bekleniyor… Gerekirse Chrome penceresine geçin (en fazla yaklaşık 75 saniye).",
    working: "Kontrol sürüyor…", empty: "Açık Flow sekmesi bulunamadı. Aynı Chrome örneğinde Flow'u açıp yeniden deneyin.",
    choose: "Kontrol edilecek Flow sekmesini seçin", tab: "Flow sekmesi",
    workspace: "Flow çalışma alanı işaretleri görüldü.",
    login: "Flow sekmesinde giriş düğmesi görüldü; hesap doğrulanmadı.",
    inconclusive: "Flow sayfası bulundu; oturum durumu kesinleştirilemedi. Sayfanın yüklenmesini ve dilini kontrol edin.",
    scope: "Bu test Gmail adresini veya Chrome profil kimliğini doğrulamaz. Test bağlantısı kapanır; kalıcı bağlantı kurulmaz ve kredi harcanmaz.",
    failure: "Flow kontrolü tamamlanamadı. Chrome iznini kontrol edip yeniden deneyin.",
    stale: "Seçilen sekme kapandı veya Flow dışında bir adrese geçti. Listeyi yenileyin; başka sekmeye otomatik geçilmedi.",
    blocked: "Güvenli salt okunur kontrol tamamlanamadı. Daha geniş yetkiyle otomatik yeniden deneme yapılmadı.",
    busy: "Başka bir Chrome testi sürüyor. Tamamlanmasını bekleyin.",
    timeout: "Chrome onayı veya Flow yanıtı zaman aşımına uğradı. Yeniden deneyin.",
    checked: "Kontrol zamanı",
  },
  en: {
    title: "Flow tab — read-only check",
    note: "First find open Flow tabs in this Chrome instance, then explicitly choose one. Browser profile checkboxes do not replace tab selection; Gmail/profile identity mapping is not implemented.",
    consent: "Allow reading Flow tab titles and page-state markers in the tab I choose.",
    privacy: "Only https://flow.google.com tabs are accepted. Other sites' titles are not shown. No clicks, new projects, generation, account switching, password or cookie reads. Chrome may ask for approval on each connection.",
    discover: "Find open Flow tabs", check: "Check selected Flow tab",
    waiting: "Waiting for Chrome approval / Flow check… Switch to Chrome if needed (up to about 75 seconds).",
    working: "Checking…", empty: "No open Flow tab found. Open Flow in the same Chrome instance and retry.",
    choose: "Choose the Flow tab to check", tab: "Flow tab",
    workspace: "Flow workspace markers were observed.",
    login: "A sign-in button was observed in Flow; the account is not verified.",
    inconclusive: "Flow was found but session status is inconclusive. Check page loading and language.",
    scope: "This test verifies neither Gmail nor Chrome profile identity. It closes its test connection, creates no persistent connection and spends no credits.",
    failure: "Flow check could not complete. Check Chrome permission and retry.",
    stale: "The selected tab closed or moved away from Flow. Refresh the list; no other tab was used as a fallback.",
    blocked: "The guarded read-only check could not complete. No automatic retry with broader permissions was attempted.",
    busy: "Another Chrome test is running. Wait for it to finish.",
    timeout: "Chrome approval or Flow reply timed out. Retry.",
    checked: "Checked at",
  },
};

export default function FlowTabCheck() {
  const { locale } = useI18n();
  const text = copy[locale === "tr" ? "tr" : "en"];
  const [consent, setConsent] = useState(false);
  const [targets, setTargets] = useState<NonNullable<BrowserFlowResult["targets"]>>([]);
  const [listed, setListed] = useState(false);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<BrowserFlowResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function run(list: boolean) {
    if (!consent || pending.current || (!list && !selected)) return;
    pending.current = true; setBusy(true); setFailed(false); setResult(null);
    if (list) { setTargets([]); setListed(false); setSelected(""); }
    try {
      const data = list ? await api.listFlowTabs() : await api.checkFlowTab(selected);
      if (!mounted.current) return;
      if (data.state === "listed") {
        setTargets(data.targets || []); setListed(true);
      } else setResult(data);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function message(state: BrowserFlowResult["state"]) {
    switch (state) {
      case "workspace_visible": return text.workspace;
      case "login_prompt": return text.login;
      case "inconclusive": return text.inconclusive;
      case "target_changed":
      case "target_unavailable": return text.stale;
      case "read_blocked": return text.blocked;
      case "busy": return text.busy;
      case "timeout": return text.timeout;
      default: return text.failure;
    }
  }
  const observed = result && ["workspace_visible", "login_prompt", "inconclusive"].includes(result.state);
  return (
    <div className="space-y-4"><Card translate="no"><CardContent className="space-y-3 p-5">
      <h2 className="text-lg font-semibold">{text.title}</h2>
      <p className="text-sm text-muted-foreground">{text.note}</p>
      <p className="text-sm text-muted-foreground">{text.privacy}</p>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name="flow-consent" checked={consent} disabled={busy}
          className="mt-1 size-4 shrink-0" onChange={(event) => {
            setConsent(event.target.checked); setTargets([]); setSelected("");
            setListed(false); setResult(null); setFailed(false);
          }} />
        <span>{text.consent}</span>
      </label>
      <Button className="h-auto min-h-9 max-w-full whitespace-normal py-2 leading-relaxed" disabled={!consent || busy}
        onClick={() => void run(true)}>{busy ? text.working : text.discover}</Button>
      {listed && !targets.length && <p role="status">{text.empty}</p>}
      {!!targets.length && <fieldset disabled={busy} className="space-y-2">
        <legend className="mb-2 font-medium">{text.choose}</legend>
        {targets.map((tab, i) => <label key={tab.id}
          className="flex cursor-pointer items-start gap-3 rounded border border-border p-3">
          <input type="radio" name="flow-target" value={tab.id} checked={selected === tab.id}
            className="mt-1 shrink-0" onChange={() => { setSelected(tab.id); setResult(null); setFailed(false); }} />
          <span className="min-w-0 break-words">{text.tab} {i + 1}: {tab.label}
            <span className="block text-sm text-muted-foreground">{tab.origin}</span>
          </span>
        </label>)}
      </fieldset>}
      {!!targets.length && <Button className="h-auto min-h-9 max-w-full whitespace-normal py-2 leading-relaxed"
        disabled={!consent || !selected || busy} onClick={() => void run(false)}>{text.check}</Button>}
      <div aria-live="polite">
        {busy && <p role="status">{text.waiting}</p>}
        {failed && <p role="alert">{text.failure}</p>}
        {result && <p role={observed ? "status" : "alert"} className="font-medium">{message(result.state)}</p>}
        {result?.checked_at && <p className="text-sm">
          {text.checked}: {new Date(result.checked_at).toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}
        </p>}
      </div>
      <p className="text-sm text-muted-foreground">{text.scope}</p>
    </CardContent></Card>
      {observed && consent && selected && !busy && <FlowImageDraft key={selected}
        targetId={selected} targetLabel={targets.find((tab) => tab.id === selected)?.label || text.tab} />}
    </div>
  );
}