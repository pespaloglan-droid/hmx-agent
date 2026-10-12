import { useEffect, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { api } from "@/lib/api";
import type { BrowserConnectionProbe } from "@/lib/api-browser";
import { useI18n } from "@/i18n";

const copy = {
  tr: {
    title: "Chrome bağlantı testi",
    note: "Windows ve Chrome 144+ için tek seferlik test. Dashboard'un çalıştığı bilgisayardaki Chrome örneğine bağlanır ve yalnızca sürüm bilgisini okur. Seçili profil kutuları testin hedefini belirlemez.",
    permission: "Chrome bağlantı isteğinin başlatılmasına ve sürüm bilgisinin okunmasına izin veriyorum.",
    risk: "Chrome onayı bu tarayıcı örneğine geniş erişim verebilir. Bu test sekme, hesap veya çerez okumaz; profil kopyalamaz ve Flow'da işlem yapmaz. Yalnızca bu testi başlattıktan sonra gelen Chrome isteğini onaylayın.",
    button: "Chrome bağlantısını test et",
    testingLabel: "Test sürüyor…",
    waiting: "Chrome onayı / bağlantı bekleniyor… Chrome penceresine geçin. Test en fazla yaklaşık 70 saniye sürer.",
    success: "Bağlantı testi başarılı — test bağlantısı kapatıldı.",
    unverified: "Bu sonuç profil hesabını veya Flow oturumunu doğrulamaz. Kalıcı bağlantı kurulmadı.",
    checked: "Kontrol zamanı",
    failure: "Bağlantı testi tamamlanamadı. Dashboard bağlantısını kontrol edip yeniden deneyin.",
    errors: {
      busy: "Bu dashboard'da başka bir Chrome testi sürüyor. Tamamlanınca yeniden deneyin.",
      unsupported_platform: "Bu bağlantı testi şu anda yalnızca dashboard'un Windows'ta çalışmasıyla destekleniyor.",
      not_found: "Chrome bağlantı dosyası bulunamadı. Chrome'u açın ve chrome://inspect/#remote-debugging ayarını kontrol edin.",
      invalid_discovery: "Chrome bağlantı dosyası güvenli veya geçerli değil. Otomatik olarak başka tarayıcıya geçilmedi.",
      discovery_unavailable: "Chrome bağlantı dosyası okunamadı. Windows kullanıcısını ve erişim izinlerini kontrol edin.",
      dependency_missing: "Hermes ortamında WebSocket bileşeni eksik. Kurulumu kontrol etmek gerekiyor; profil ayarını değiştirmeyin.",
      timeout: "Chrome onayı veya bağlantı zaman aşımına uğradı. Chrome penceresini kontrol edip yeniden deneyin.",
      invalid_reply: "Geçerli Chrome sürüm yanıtı alınamadı. Profil veya hesap doğrulanmadı.",
      connection_failed: "Chrome bağlantısı kurulamadı veya reddedildi. Chrome'u ve hata ayıklama iznini kontrol edin.",
    },
  },
  en: {
    title: "Chrome connection test",
    note: "One-shot test for Windows and Chrome 144+. Connects to Chrome on the dashboard host and reads only its version. Selected profile checkboxes do not determine this test's target.",
    permission: "Allow initiating a Chrome connection request and reading its version.",
    risk: "Chrome approval can grant broad access to this browser instance. This test reads no tabs, accounts or cookies, copies no profile and performs no Flow actions. Approve only the Chrome request initiated by this test.",
    button: "Test Chrome connection",
    testingLabel: "Testing…",
    waiting: "Waiting for Chrome approval / connection… Switch to Chrome. The test takes up to about 70 seconds.",
    success: "Connection test succeeded — test connection closed.",
    unverified: "This does not verify a profile account or Flow session. No persistent connection was established.",
    checked: "Checked at",
    failure: "Connection test could not complete. Check the dashboard connection and retry.",
    errors: {
      busy: "Another Chrome test is running in this dashboard. Retry after it finishes.",
      unsupported_platform: "This connection test currently requires the dashboard to run on Windows.",
      not_found: "Chrome discovery file not found. Open Chrome and check chrome://inspect/#remote-debugging.",
      invalid_discovery: "Chrome discovery file is invalid or unsafe. No fallback browser was used.",
      discovery_unavailable: "Chrome discovery file could not be read. Check the OS user and access permissions.",
      dependency_missing: "The Hermes environment is missing its WebSocket component. Installation needs checking; do not change profile settings.",
      timeout: "Chrome approval or connection timed out. Check the Chrome window and retry.",
      invalid_reply: "No valid Chrome version reply was received. Profile/account identity was not verified.",
      connection_failed: "Chrome connection failed or was denied. Check Chrome and its remote debugging permission.",
    },
  },
};

export default function BrowserConnectionTest() {
  const { locale } = useI18n();
  const text = copy[locale === "tr" ? "tr" : "en"];
  const [consent, setConsent] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<BrowserConnectionProbe | null>(null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function test() {
    if (!consent || pending.current) return;
    pending.current = true;
    setTesting(true); setResult(null); setFailed(false);
    try {
      const data = await api.probeBrowserConnection();
      if (mounted.current) setResult(data);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      pending.current = false;
      if (mounted.current) setTesting(false);
    }
  }

  const error = result && result.state !== "reachable"
    ? text.errors[result.state] ?? text.failure : null;
  return (
    <Card translate="no">
      <CardContent className="space-y-3 p-5">
        <h2 className="text-lg font-semibold">{text.title}</h2>
        <p className="text-sm text-muted-foreground">{text.note}</p>
        <p className="text-sm text-muted-foreground">{text.risk}</p>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="connection-consent" checked={consent}
            disabled={testing} className="mt-1 size-4 shrink-0"
            onChange={(event) => {
              setConsent(event.target.checked); setResult(null); setFailed(false);
            }} />
          <span>{text.permission}</span>
        </label>
        <Button className="h-auto min-h-9 max-w-full whitespace-normal py-2 leading-relaxed" disabled={!consent || testing}
          onClick={() => void test()}>
          {testing ? text.testingLabel : text.button}
        </Button>
        <div aria-live="polite">
          {testing && <p role="status">{text.waiting}</p>}
          {(failed || error) && <p role="alert">{error || text.failure}</p>}
          {result?.state === "reachable" && (
            <>
              <p role="status" className="font-semibold">{text.success}</p>
              <p translate="no">{result.product} · CDP {result.protocol_version}</p>
              {result.checked_at && <p className="text-sm">
                {text.checked}: {new Date(result.checked_at).toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}
              </p>}
            </>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{text.unverified}</p>
      </CardContent>
    </Card>
  );
}