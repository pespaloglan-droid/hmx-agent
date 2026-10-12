import { useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
export default function BrowserConnectorTicket({ ticket, tr }: { ticket: string; tr: boolean }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(ticket); setCopied(true); setFailed(false); }
    catch { setFailed(true); }
  }
  return <><input aria-label="Secret pairing code" readOnly type="password" autoComplete="off" value={ticket} className="w-full min-w-0 rounded border border-border bg-transparent p-2" />
    <Button onClick={() => void copy()}>{tr ? "Gizli kodu kopyala" : "Copy secret code"}</Button>
    {copied && <p role="status">{tr ? "Kopyalandı. Doğru profilin uzantısına yapıştır." : "Copied. Paste in the correct profile's extension."}</p>}
    {failed && <p role="alert">{tr ? "Kopyalama engellendi. Tarayıcı pano iznini kontrol et." : "Copy blocked. Check clipboard permission."}</p>}
  </>;
}
