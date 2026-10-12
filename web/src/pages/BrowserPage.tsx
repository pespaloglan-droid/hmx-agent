import { useEffect, useRef, useState } from "react";
import { Globe, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Card, CardContent } from "@nous-research/ui/ui/components/card";
import { api } from "@/lib/api";
import type { BrowserConfigurationStatus, BrowserInventory } from "@/lib/api-browser";
import { useProfileScope } from "@/contexts/useProfileScope";
import { useI18n } from "@/i18n";
import BrowserConnectionTest from "./BrowserConnectionTest";
import FlowTabCheck from "./FlowTabCheck";
import BrowserConnectorPanel from "./BrowserConnectorPanel";
import FlowSubmitTest from "./FlowSubmitTest";

const copy = {
  tr: {
    title: "Tarayıcı", subtitle: "Tarayıcı bağlantısı ve Chrome ailesi profilleri",
    connection: "Bağlantı durumu", unknown: "Henüz doğrulanmadı",
    backend: "Yapılandırılan araç", cdp: "CDP adresi yapılandırılmış",
    yes: "Evet", no: "Hayır", consentSetting: "Gerçek profil kullanım ayarı",
    statusNote: "Bir adresin veya profil kullanım ayarının bulunması, tarayıcıya bağlanıldığı ya da Flow oturumunun açık olduğu anlamına gelmez.",
    statusError: "Bağlantı ayarları okunamadı. Yeniden deneyin.",
    retry: "Yenile", loading: "Yükleniyor…",
    profiles: "Tarayıcı profilleri",
    privacy: "Yalnızca bu sunucuyu çalıştıran Windows/macOS/Linux kullanıcısının tarayıcı profil adları keşfedilir. Bunlar Hermes ajan profillerinden farklıdır. Parola veya çerez dosyaları okunmaz; profiller kopyalanmaz, tarayıcı açılmaz.",
    consent: "Bu bilgisayardaki tarayıcı profil adlarının okunmasına izin veriyorum.",
    emailConsent: "Yerel profil bilgisinde kayıtlı e-posta adreslerinin de okunmasına ve gösterilmesine izin veriyorum.",
    emailNote: "E-posta yalnızca tarayıcının yerel kaydından alınır; eski olabilir ve Flow oturumunu kanıtlamaz. Parola veya çerez okunmaz.",
    emailMissing: "Yerel kayıtta e-posta bulunamadı",
    defaultProfile: "Varsayılan profil", profileNumber: "Profil {number}",
    discover: "Profilleri keşfet", discovering: "Keşfediliyor…",
    discoveryError: "Profil keşfi tamamlanamadı. İzinleri kontrol edip yeniden deneyin.",
    initial: "Profil listesi henüz okunmadı. Keşif için yukarıdaki izni verin.",
    installed: "Tarayıcı bulundu", missing: "Tarayıcı uygulaması bulunamadı",
    empty: "Profil bulunamadı.", denied: "Profil klasörüne erişim reddedildi.",
    unavailable: "Profil adları kısmen okunabildi; klasör adları gösterilebilir.",
    unsupported: "Standart profil klasörü bulunamadı veya güvenli keşif için uygun değil.",
    failed: "Bu tarayıcı için keşif tamamlanamadı.", limit: "Profil sınırına ulaşıldı (256).",
    notConnected: "Bağlı değil", notChecked: "Site oturumu kontrol edilmedi",
    selected: "Seçilen profiller", selectionNote: "Seçim yalnızca bu ekranda tutulur; kullanım izni vermez, bağlantı veya görev başlatmaz.",
    next: "Sonraki adım: çoklu profil bağlantısı",
    nextNote: "Her profil için ayrı oturum, çakışan görevler için sıra ve profil bazında durdurma eklenecek. Önce iki profille oturum ayrımı doğrulanacak.",
    preview: "Canlı görünüm ve işlem geçmişi",
    previewNote: "Bu sürümde henüz uygulanmadı. Gerçek tarayıcı bağlantısı kurulduktan sonra eklenecek; şu anda canlı görüntü veya çalışan görev yok.",
  },
  en: {
    title: "Browser", subtitle: "Browser connection and Chromium-family profiles",
    connection: "Connection status", unknown: "Not verified",
    backend: "Configured tool", cdp: "CDP address configured",
    yes: "Yes", no: "No", consentSetting: "Real-profile usage setting",
    statusNote: "A configured address or real-profile setting does not prove a browser connection or a signed-in Flow session.",
    statusError: "Could not read browser configuration. Please retry.",
    retry: "Refresh", loading: "Loading…",
    profiles: "Browser profiles",
    privacy: "Discovery reads browser profile names for the OS user running this server, not Hermes agent profiles. Password and cookie files are not read; profiles are not copied and no browser is launched.",
    consent: "Allow reading browser profile names on this computer.",
    emailConsent: "Also allow reading and displaying email addresses recorded in local profile metadata.",
    emailNote: "Emails come only from the browser's local record, may be stale, and do not prove a Flow session. Passwords and cookies are not read.",
    emailMissing: "No email found in local metadata",
    defaultProfile: "Default profile", profileNumber: "Profile {number}",
    discover: "Discover profiles", discovering: "Discovering…",
    discoveryError: "Profile discovery failed. Check permissions and retry.",
    initial: "Profiles have not been read. Give consent above to discover them.",
    installed: "Browser found", missing: "Browser application not found",
    empty: "No profiles found.", denied: "Access to the profile directory was denied.",
    unavailable: "Some profile metadata could not be read; directory names may be shown.",
    unsupported: "Standard profile directory not found or unsuitable for safe discovery.",
    failed: "Discovery failed for this browser.", limit: "Profile limit reached (256).",
    notConnected: "Not connected", notChecked: "Site session not checked",
    selected: "Selected profiles", selectionNote: "Selection is local to this screen. It grants no usage permission and starts no connection or task.",
    next: "Next: multi-profile connection",
    nextNote: "Separate sessions per profile, queues for conflicting tasks, and per-profile stop controls will follow. Session isolation will first be verified with two profiles.",
    preview: "Live view and action history",
    previewNote: "Not implemented in this version. These will follow a real browser connection; there is currently no live preview or running task here.",
  },
};

export default function BrowserPage() {
  const { profile } = useProfileScope();
  return <BrowserPanel key={profile} profile={profile} />;
}

function BrowserPanel({ profile }: { profile: string }) {
  const { locale } = useI18n();
  const text = copy[locale === "tr" ? "tr" : "en"];
  const [status, setStatus] = useState<BrowserConfigurationStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [consent, setConsent] = useState(false);
  const [emailConsent, setEmailConsent] = useState(false);
  const [inventory, setInventory] = useState<BrowserInventory | null>(null);
  const [discoveryError, setDiscoveryError] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const discoveryGeneration = useRef(0);

  useEffect(() => {
    let current = true;
    api.getBrowserStatus(profile).then(
      (data) => { if (current) setStatus(data); },
      () => { if (current) setStatusError(true); },
    ).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [profile, refresh]);

  useEffect(() => {
    // The keyed panel remounts on profile switches. Ignore outstanding discovery.
    return () => { discoveryGeneration.current += 1; };
  }, []);

  async function discover() {
    if (!consent || discovering) return;
    const generation = ++discoveryGeneration.current;
    setDiscovering(true);
    setDiscoveryError(false);
    setInventory(null);
    setSelected([]);
    try {
      const data = await api.discoverBrowserProfiles(emailConsent);
      if (generation === discoveryGeneration.current) setInventory(data);
    } catch {
      if (generation === discoveryGeneration.current) setDiscoveryError(true);
    } finally {
      if (generation === discoveryGeneration.current) setDiscovering(false);
    }
  }

  function warningMessage(code: string) {
    switch (code) {
      case "access_denied": return text.denied;
      case "metadata_unavailable": return text.unavailable;
      case "not_found_or_unsupported_path":
      case "unsupported_platform": return text.unsupported;
      case "profile_limit": return text.limit;
      default: return text.failed;
    }
  }

  function directoryLabel(directory: string) {
    if (directory === "Default") return text.defaultProfile;
    const match = /^Profile ([0-9]+)$/.exec(directory);
    return match ? text.profileNumber.replace("{number}", match[1]) : directory;
  }

  return (
    // Browser auto-translation can replace React-owned text nodes, leaving a
    // detached selection count. Use the dashboard's own Turkish/English copy.
    <div translate="no" className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Globe aria-hidden />{text.title}</h1>
        <p className="mt-2 text-muted-foreground">{text.subtitle}</p>
      </header>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{text.connection}</h2>
            <Button onClick={() => {
              setLoading(true); setStatus(null); setStatusError(false);
              setRefresh((n) => n + 1);
            }} disabled={loading}>
              <RefreshCw aria-hidden />{text.retry}
            </Button>
          </div>
          {loading && <p role="status">{text.loading}</p>}
          {statusError && <p role="alert">{text.statusError}</p>}
          {status && (
            <>
              <p className="font-semibold">{text.unknown}</p>
              <dl className="grid gap-3 sm:grid-cols-3">
                <div><dt className="text-sm text-muted-foreground">{text.backend}</dt><dd>{status.backend}</dd></div>
                <div><dt className="text-sm text-muted-foreground">{text.cdp}</dt><dd>{status.cdp_configured ? text.yes : text.no}</dd></div>
                <div><dt className="text-sm text-muted-foreground">{text.consentSetting}</dt><dd>{status.real_profile_consent ? text.yes : text.no}</dd></div>
              </dl>
            </>
          )}
          <p className="text-sm text-muted-foreground">{text.statusNote}</p>
        </CardContent>
      </Card>

      <BrowserConnectionTest />
      <BrowserConnectorPanel />
      <FlowTabCheck />
      <FlowSubmitTest />

      <section aria-labelledby="browser-profiles-heading" className="space-y-4">
        <h2 id="browser-profiles-heading" className="text-lg font-semibold">{text.profiles}</h2>
        <p className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck className="shrink-0" aria-hidden />{text.privacy}</p>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="metadata-consent" checked={consent} disabled={discovering}
            onChange={(event) => {
              setConsent(event.target.checked);
              if (!event.target.checked) {
                setEmailConsent(false); setInventory(null); setSelected([]);
              }
            }} className="mt-1 size-4 shrink-0" />
          <span>{text.consent}</span>
        </label>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="email-consent" checked={emailConsent}
            disabled={!consent || discovering}
            onChange={(event) => {
              setEmailConsent(event.target.checked);
              // Re-discover with the new scope; revocation removes email data
              // from state immediately, not just from its visual presentation.
              setInventory(null); setSelected([]); setDiscoveryError(false);
            }} className="mt-1 size-4 shrink-0" />
          <span>{text.emailConsent}</span>
        </label>
        <p className="text-sm text-muted-foreground">{text.emailNote}</p>
        <Button disabled={!consent || discovering} onClick={() => void discover()}>
          {discovering ? text.discovering : text.discover}
        </Button>
        <div aria-live="polite">
          {discovering && <p role="status">{text.discovering}</p>}
          {discoveryError && <p role="alert">{text.discoveryError}</p>}
          {!inventory && !discovering && !discoveryError && <p className="text-muted-foreground">{text.initial}</p>}
        </div>
        <div className="sticky top-0 z-10 space-y-1 rounded border border-border bg-background p-3">
          <p aria-live="polite" className="font-medium">
            <span>{text.selected}: </span>
            <output translate="no" aria-label={text.selected}>{selected.length}</output>
          </p>
          <p className="text-sm text-muted-foreground">{text.selectionNote}</p>
        </div>
        {inventory && (
          <div className="grid items-start gap-4 md:grid-cols-2">
            {inventory.browsers.map((browser) => (
              <Card key={browser.id}>
                <CardContent className="space-y-3 p-5">
                  <h3 className="font-semibold">{browser.label}</h3>
                  <p className="text-sm text-muted-foreground">{browser.installed ? text.installed : text.missing}</p>
                  {browser.warning && <p className="text-sm">{warningMessage(browser.warning)}</p>}
                  {!browser.profiles.length && <p>{text.empty}</p>}
                  {browser.profiles.map((row) => (
                    <label key={row.id} className="flex cursor-pointer items-start gap-3 rounded border border-border p-3">
                      <input type="checkbox" name="browser-profile" className="mt-1 size-4 shrink-0"
                        aria-label={`${row.label} (${row.directory})`}
                        checked={selected.includes(row.id)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelected((ids) => checked ? [...ids, row.id] : ids.filter((id) => id !== row.id));
                        }} />
                      <span className="min-w-0 space-y-1">
                        <span className="block break-words font-medium">{row.label}</span>
                        <span title={row.directory} className="block text-sm text-muted-foreground">{directoryLabel(row.directory)}</span>
                        {emailConsent && inventory.emails_included && (
                          <span translate="no" className="block break-all text-sm">
                            {row.email || text.emailMissing}
                          </span>
                        )}
                        <span className="block text-sm">{text.notConnected} · {text.notChecked}</span>
                      </span>
                    </label>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="space-y-2 p-5">
          <h2 className="font-semibold">{text.next}</h2>
          <p className="text-sm text-muted-foreground">{text.nextNote}</p>
        </CardContent></Card>
        <Card><CardContent className="space-y-2 p-5">
          <h2 className="font-semibold">{text.preview}</h2>
          <p className="text-sm text-muted-foreground">{text.previewNote}</p>
        </CardContent></Card>
      </div>
    </div>
  );
}