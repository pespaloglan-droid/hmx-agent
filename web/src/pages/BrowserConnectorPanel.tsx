import { useEffect, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import type { ReadonlyConnection, ReadonlyRead } from "@/lib/api-browser-connector";
import BrowserConnectorPair from "./BrowserConnectorPair";

function ReadResult({ result }: { result: ReadonlyRead | null }) {
  if (!result) return null;
  return <div className="space-y-2" aria-live="polite"><p role="status">{result.state}</p>
    {result.tabs && <ul className="list-inside list-disc">{result.tabs.map((tab, index) => <li className="break-words" key={index}>{tab.title} — {tab.origin}</li>)}</ul>}
    {result.image_data_url && <img src={result.image_data_url} alt="Readonly Chrome screen preview" className="max-w-full border border-border" />}
  </div>;
}

export default function BrowserConnectorPanel() {
  const { locale } = useI18n(); const tr = locale === "tr";
  const [rows, setRows] = useState<ReadonlyConnection[]>([]); const [selected, setSelected] = useState("");
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<ReadonlyRead | null>(null);
  const pending = useRef(false); const mounted = useRef(true); const revision = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(action: "list" | "browser_tabs" | "browser_screenshot" | "disconnect") {
    if (pending.current || (action !== "list" && (!selected || !consent))) return;
    const version = revision.current; pending.current = true; setBusy(true); setFailed(false); setResult(null);
    try {
      if (action === "list") {
        const data = await api.listReadonlyChrome();
        if (mounted.current) { setRows(data.connections); setSelected(""); setConsent(false); }
      } else {
        const data = action === "disconnect" ? await api.disconnectReadonlyChrome(selected) : await api.readReadonlyChrome(selected, action);
        if (mounted.current && version === revision.current) setResult(data);
      }
    } catch { if (mounted.current) setFailed(true); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  const buttonClass = "h-auto max-w-full whitespace-normal py-2 leading-relaxed";
  return <section className="space-y-4 border border-border p-5" translate="no">
    <h2 className="text-lg font-semibold">{tr ? "Chrome bağlantısı — yalnızca okuma" : "Chrome connection — read only"}</h2>
    <p>{tr ? "Bu bağlantı yalnızca Chrome sekmelerini ve uzantıda izin verdiğiniz sayfanın ekranını Hermes dashboard'ına getirir. Sohbet ajanına bağlanma, tıklama, yazma, indirme ve toplu üretim henüz yok. Genel API anahtarı uzantıya verilmez." : "Reads tabs and your extension-approved page screen into this dashboard only. No Chat agent binding, clicking, typing, downloads or batch production. The extension receives no general API key."}</p>
    <BrowserConnectorPair />
    <Button className={buttonClass} disabled={busy} onClick={() => void run("list")}>{tr ? "Bağlı Chrome profillerini yenile" : "Refresh connected Chrome profiles"}</Button>
    <fieldset disabled={busy} className="space-y-2">{rows.map(row => <label className="flex items-start gap-3 rounded border border-border p-3" key={row.browser_profile_id}>
      <input type="radio" name="readonly-chrome-profile" checked={selected === row.browser_profile_id} className="mt-1 shrink-0"
        onChange={() => { setSelected(row.browser_profile_id); setConsent(false); setResult(null); revision.current++; }} />
      <span className="min-w-0 break-all">{row.browser_profile_id} · {row.state}<br />{row.install_id}</span>
    </label>)}</fieldset>
    <label className="flex items-start gap-3"><input type="checkbox" name="connector-read-consent" checked={consent}
      disabled={!selected || busy} className="mt-1 shrink-0" onChange={event => { setConsent(event.target.checked); setResult(null); revision.current++; }} />
      <span>{tr ? "Seçili profilden sekme/ekran okumaya izin veriyorum; görüntü yerel dashboard'da gösterilecek, modele gönderilmeyecek." : "Allow reading the selected profile; preview stays in the local dashboard, not sent to a model."}</span></label>
    <div className="flex flex-wrap gap-2">
      <Button className={buttonClass} disabled={!selected || !consent || busy} onClick={() => void run("browser_tabs")}>{tr ? "Seçili profilin sekmelerini oku" : "Read selected profile tabs"}</Button>
      <Button className={buttonClass} disabled={!selected || !consent || busy} onClick={() => void run("browser_screenshot")}>{tr ? "İzin verilen ekranı oku" : "Read approved screen"}</Button>
      <Button className={buttonClass} disabled={!selected || !consent || busy} onClick={() => void run("disconnect")}>{tr ? "Seçili bağlantıyı kes" : "Disconnect selected profile"}</Button>
    </div>
    {busy && <p role="status">{tr ? "İşlem bekleniyor…" : "Waiting…"}</p>}{failed && <p role="alert">{tr ? "İşlem tamamlanamadı. Otomatik tekrar yok." : "Operation failed. No automatic retry."}</p>}
    <ReadResult result={result} />
  </section>;
}
