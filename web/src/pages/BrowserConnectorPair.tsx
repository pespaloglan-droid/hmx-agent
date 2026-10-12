import { useEffect, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import BrowserConnectorTicket from "./BrowserConnectorTicket";
import type { ReadonlyPair } from "@/lib/api-browser-connector";

export default function BrowserConnectorPair() {
  const { locale } = useI18n(); const tr = locale === "tr";
  const [folder, setFolder] = useState(""); const [id, setId] = useState("");
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false);
  const [pair, setPair] = useState<ReadonlyPair | null>(null); const [failed, setFailed] = useState(false);
  const mounted = useRef(true); const pending = useRef(false); const revision = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!pair) return;
    const timer = setTimeout(() => setPair(null), pair.ttl_seconds * 1000);
    return () => clearTimeout(timer);
  }, [pair]);
  function clear() { revision.current++; setPair(null); setConsent(false); setFailed(false); }
  const valid = /^(Default|Profile [0-9]+)$/.test(folder)
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
  async function create() {
    if (!valid || !consent || pending.current) return;
    const version = revision.current; pending.current = true; setBusy(true); setPair(null); setFailed(false);
    try { const data = await api.pairReadonlyChrome(`chrome:${folder}`, id); if (mounted.current && version === revision.current) setPair(data); }
    catch { if (mounted.current && version === revision.current) setFailed(true); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  const inputClass = "w-full min-w-0 rounded border border-border bg-transparent p-2";
  return <div className="space-y-3">
    <label className="block space-y-1"><span>{tr ? "Chrome klasörü (Default veya Profile N)" : "Chrome directory (Default or Profile N)"}</span>
      <input aria-label="Chrome directory" value={folder} disabled={busy} className={inputClass}
        onChange={event => { setFolder(event.target.value.trim()); clear(); }} /></label>
    <label className="block space-y-1"><span>{tr ? "Uzantı kurulum kimliği" : "Extension installation ID"}</span>
      <input aria-label="Extension installation ID" value={id} disabled={busy} className={inputClass}
        onChange={event => { setId(event.target.value.trim()); clear(); }} /></label>
    <label className="flex items-start gap-3"><input type="checkbox" name="connector-pair-consent" className="mt-1 shrink-0"
      checked={consent} disabled={busy} onChange={event => { setConsent(event.target.checked); setPair(null); revision.current++; }} />
      <span>{tr ? "Bu Chrome profiline yalnızca sekme ve ekran okuma bağlantısı için izin veriyorum. Ajan işlemi veya üretim izni vermiyorum." : "Allow only tab/screen reading for this Chrome profile, not agent actions or production."}</span></label>
    <Button className="h-auto max-w-full whitespace-normal py-2 leading-relaxed" disabled={!valid || !consent || busy}
      onClick={() => void create()}>{tr ? "30 saniyelik eşleştirme kodu oluştur" : "Create 30-second pairing code"}</Button>
    {busy && <p role="status">{tr ? "Kod hazırlanıyor…" : "Preparing code…"}</p>}
    {failed && <p role="alert">{tr ? "Kod oluşturulamadı. Uzantı origin ayarını ve profil klasörünü kontrol edin. Otomatik tekrar yapılmadı." : "Could not create code. Check extension origin configuration and profile directory. No automatic retry."}</p>}
    {pair && <div className="space-y-2 border border-border p-3">
      <p>{tr ? "Gizli kodu kopyalayıp doğru Chrome profilindeki uzantıya yapıştır. Kodu sohbete veya ekran görüntüsüne ekleme. Tek kullanımlık; 30 saniyede silinir." : "Copy the secret code into the extension in the correct Chrome profile. Do not share it in chat or screenshots. Single-use; hidden after 30 seconds."}</p>
      <BrowserConnectorTicket key={pair.ticket} ticket={pair.ticket} tr={tr} />
      <p className="break-all text-sm">{pair.browser_profile_id} · {pair.install_id}</p>
    </div>}
  </div>;
}
