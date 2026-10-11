# Tarayıcı bağlantısı ve çoklu profil — test öncesi hazırlık

Bu belge uygulama değildir. Birinci adımın Windows kabul testi bitmeden gerçek
profil bağlantısı, Flow işlemleri veya paralel görevler etkinleştirilmez.
Mevcut panelin kapsamı: [birinci adım](browser-panel-phase-1.md).

## Kod incelemesi bulguları

- `hermes_cli/cli_commands_mixin.py::_browser_connect` mevcut bağlantıyı süreç
  ortamındaki tek `BROWSER_CDP_URL` üzerinden değiştirir. Bunu her profil için
  sırayla değiştirmek güvenli bir paralel profil yönlendiricisi değildir.
- `tools/browser_use_cli.py::_resolve_backend_cdp` açık CDP bağlantısını adlandırılmış
  oturumlara da uygular. `_OWN_TAB_PREAMBLE` ayrı sekme oluşturmayı amaçlar;
  sekme ayrımı hesap/çerez ayrımı değildir.
- `_backend_cache_key` görev, adlandırılmış oturum ve servis edilen **Hermes ajan
  profili** için ayrım sağlar. Chrome profil seçimini bu mekanizmayla karıştırmamak
  gerekir; envanterdeki seçim henüz bu yönlendirmeye bağlı değildir.
- Harness daemon'u CDP adresini başlangıçta tutar. Yalnızca adres değiştirmek eski
  oturumu yeni profile taşımaz. `stop_harness_daemons` genel temizleme yapar;
  profil bazında durdurma iş akışının yerine kullanılamaz.
- Mevcut gerçek-profil yolu (`tools/browser_tool_real_profile.py` ve
  `hermes_cli/browser_connect.py::snapshot_real_profile`) profil kopyalama içerir.
  Birinci adım bunu çağırmaz. Açıkça ayrı onay alınmadan bağlantı düğmesine
  bağlanmamalıdır; metadata keşif izni, kopyalama/kullanım izni değildir.

## Bağlantı yöntemi için karar kapısı

Chrome 144+ için ilk yerel ön kontrol, kullanıcı Chrome'un
`chrome://inspect/#remote-debugging` ekranındaki izni etkinleştirdikten sonra:

```powershell
node .\scripts\hmx\chrome-connection-probe.mjs
```

Bu Windows/Node.js 24 testi, sabit standart Chrome kökündeki
`DevToolsActivePort` dosyasından doğrudan loopback WebSocket adresi oluşturur.
Chrome'un bağlantı isteği kullanıcı tarafından onaylanmalıdır. Yalnızca
`Browser.getVersion` gönderilir; sekme listesi, sayfa içeriği, hesap bilgisi veya
çerez okunmaz. Sonuç yalnızca sürüm ve protokol bilgisidir; uç nokta yayımlanmaz.
Bağlantı en fazla 60 saniye bekler ve test bitince yalnız kendi WebSocket'i kapanır,
Chrome kapanmaz. Hermes ayarları değiştirilmez; panelde kalıcı bağlantı oluşturmaz.
Başarı doğru Chrome profilinin, Flow oturumunun veya çoklu profil ayrımının kanıtı
değildir. Üretim denemesi başlatılmaz. Test bittiğinde veya ertelendiğinde Chrome
hata ayıklama izni kapatılmalıdır.

### Aynı testin dashboard kartı

Tarayıcı sayfasındaki **Chrome bağlantı testi**, ayrı ve varsayılan olarak kapalı
bir kullanım izniyle başlatılır. Sayfa açılması, metadata keşfi, e-posta izni veya
profil seçimi test başlatmaz. Kart Windows/Chrome 144+ içindir.

- Korunan `POST /api/browser/probe` yalnızca gerçek JSON boolean
  `{"consent":true}` kabul eder. İstemci URL, dosya yolu veya profil kimliği
  gönderemez.
- Chrome'un sabit standart kullanıcı veri kökündeki `DevToolsActivePort`
  dosyası 4096 baytla sınırlandırılır; symlink/junction ve bozuk içerik reddedilir.
  Başka tarayıcı, profil kopyası, HTTP port taraması veya otomatik başlatma yoktur.
- WebSocket sadece `127.0.0.1` adresine gider; proxy kullanılmaz.
  Tek CDP komutu `Browser.getVersion` olur. Test sonunda kendi bağlantısı kapanır.
  Chrome pencereleri kapanmaz ve Hermes tarayıcı ayarları değişmez.
- Dashboard işlemi aynı anda yalnız bir onay testi başlatır. İkinci istek `busy`
  sonucu alır. UI test sürerken yeniden başlatma ve izin değiştirmeyi engeller.
- Bağlantı/onay için 60, yanıt için 10 saniye sınırı vardır. Sonuçlar güvenli hata
  kodlarıdır; dosya yolları, WebSocket kimliği ve ham hata mesajı gösterilmez.
- Sonuç geçici ve kontrol zamanıyla etiketlidir. “Test bağlantısı kapatıldı”
  denir; kalıcı bağlı durumu veya doğrulanmış profil/Gmail/Flow rozeti oluşturmaz.
  Seçili profil kutuları bu browser-instance testinin hedefini belirlemez.
- Panelden çıkmak test sonucunu temizler fakat backend'de başlamış salt okunur
  test, zaman sınırları içinde tamamlanabilir. Profil bazlı görev iptali veya
  kalıcı bağlantı yönetimi değildir.

Windows kabulü: güncel dalı çekip dashboard'u yeniden başlatın, Ctrl+Shift+R ile
yenileyin. Karttaki ayrı izni işaretleyip testi başlatın. Sadece bu testin
oluşturduğu Chrome isteğini onaylayın. Bekleme → sürüm/protokol ve “test bağlantısı
kapatıldı” sonucu beklenir. Onay reddedildiğinde/zaman aşımında dürüst hata ve
yeniden deneme olmalı; Flow'da gezinme veya üretim başlamamalıdır.

### Flow sekmesi — salt okunur kontrol

Chrome sürüm testinin ardından ayrı, varsayılan olarak kapalı izinle iki adım:
**Açık Flow sekmelerini bul** → bir sekmeyi açıkça seç → **Seçili Flow sekmesini
kontrol et**. İlk sekme otomatik seçilmez. Profil/e-posta kutuları hedef belirlemez.

- Kimlik doğrulamalı `POST /api/browser/flow/tabs` yalnız JSON `consent:true`,
  `/api/browser/flow/check` ayrıca tek `target_id` kabul eder. Keyfi URL, dosya yolu,
  CDP komutu veya JavaScript gönderilemez.
- `Target.getTargets` yanıtı bellekte filtrelenir: yalnız tam HTTPS
  `flow.google.com` origin'inin normal sayfa sekmeleri listelenir. Başka sitelerin
  başlıkları, URL yolları ve sorguları istemciye veya ham debug loglarına verilmez.
- İkinci adım hedefi tekrar doğrular, yalnız o sekmeye geçici CDP session bağlar.
  Sabit DOM ifadesi origin'i yeniden kontrol ettikten sonra sayfanın hazır olması,
  görünen Yeni proje / giriş düğmesi işaretlerini boolean olarak döndürür.
  Türkçe, İngilizce ve Rusça düğme etiketleri desteklenir; farklı tasarım/dilde
  sonuç kesinleştirilemeyebilir. Bu işaretler Gmail veya profil kimliğini kanıtlamaz.
- `Runtime.evaluate` için `throwOnSideEffect:true` korunur. Engellenen okuma daha
  geniş yetkiyle tekrar denenmez. Tıklama, gezinme, proje/üretim, hesap değiştirme,
  form değeri, parola, çerez, depolama okuması veya profil kopyası yoktur.
- Hedef kapanır/değişirse başka sekmeye geçilmez. Yalnız test session'ı ayrılır ve
  WebSocket kapanır; Chrome açık kalır. Ayarlar veya kalıcı bağlantı değiştirilmez.
  Tüm işlem yaklaşık 75 saniyeyle sınırlıdır; aynı süreçteki Chrome testleri ortak
  kilit kullanır. Chrome listeleme ve kontrol için ayrı onay isteyebilir.

Windows kabulü: açık Flow sekmesini aynı Chrome örneğinde bırakın. Yeni kartın
iznini verip listeyi alın; yalnız bu işlemden sonra gelen Chrome isteğini onaylayın.
İstediğiniz sekmeyi seçip kontrol edin. **Flow çalışma alanı işaretleri görüldü**,
giriş işareti veya dürüst belirsizlik/hata beklenir; üretim başlamamalıdır.
Sonucu kişisel sekme başlıklarını gizleyerek paylaşın. Test bitince Chrome hata
ayıklama iznini kapatın. Çoklu profil ve üretim kapıları hâlâ ayrı kabul gerektirir.

### Kimlik eşleştirme kapıları

1. Kullanıcının Windows/Chrome sürümü ve desteklenen bağlantı yolu doğrulanır.
   Normal Chrome'un mevcut profilinin yalnızca bulunmuş olması CDP erişimi
   veya Google oturumunun kullanılabilirliği anlamına gelmez.
2. Kullanıcı tarafından açılmış ve açıkça izin verilmiş bağlantı destekleniyorsa
   yalnızca seçilen oturuma bağlanılır. Uç noktanın erişilebilir olması doğru
   hesap/profilin kanıtı değildir; kullanıcıyla ayrıca eşleştirilir.
3. Mevcut kişisel profile güvenli bağlanılamıyorsa işlem durur. Ayrı otomasyon
   profili ve kullanıcının kendi girişini yapması alternatif olarak sunulur;
   bunun mevcut kişisel profil olmadığı açıkça belirtilir.
4. Varsayılan profile geri düşme, Chrome'u zorla kapatma, parola/çerez çıkarma,
   profil kopyalama veya Google güvenlik kontrollerini aşma yoktur.
   Bağlantı yöntemi doğrulanana kadar iki bağımsız profil desteği vaat edilmez.

## Sonraki uygulamanın sözleşmesi

- Backend, izinli Chrome profil kimliğini kendi doğruladığı bağlantı kaydıyla
  eşleştirir. İstemci dosya yolu veya keyfi CDP adresi görev hedefi olamaz.
- Her görevde hedef profil açıkça bellidir. Eksik hedefte ajan sorar; son kullanılan
  hesabı tahmin etmez. Hermes ajan profili kimliği ayrıca korunur.
- Profil başına ayrı bağlantı, görev kuyruğu ve çalışma kilidi gerekir.
  Aynı profilde çakışan işler sırayla; doğrulanmış farklı profillerdeki işler
  başlangıçta en fazla iki etkin görevle çalışır.
- Süreç geneli bağlantı ortamını görev sırasında değiştirmek yerine görev kapsamlı
  yönlendirme gerekir. Ayrı oturum adı veya ayrı sekme tek başına yeterli değildir.
- Bağlantı kaybında görev hata/bekleme durumuna geçer; başka hesaba yönlenmez.
  Yeniden bağlanma yeni bağlantı nesliyle doğrulanır; eski daemon veya eski
  önizleme yeni bağlantının kanıtı olarak kullanılamaz.
- Durumlar ayrı tutulur: keşfedildi, izin bekliyor, bağlanıyor, bağlantı doğrulandı,
  Flow oturumu doğrulandı, hata, bağlantı kesildi. Konfigürasyon tek başına
  “bağlı” veya “giriş yapıldı” rozeti üretmez.
- Profil bazında durdur: bekleyen işleri iptal eder, yeni işlemleri engeller ve
  yürüyen işin durma sonucunu bildirir. Diğer profilin işi devam eder.
  Tümünü durdur aynı kuralı tüm yetkili görevlere uygular.
- Durdurma veya bağlantıyı kesme kullanıcının Chrome pencerelerini kapatmaz.
  Gönderilmiş bir Flow üretimini geri almak/iadeyi garanti etmek değildir;
  uzaktaki işlem sürüyorsa panel bunu açıkça bildirir.
- Görünüm gerçek kaynaktan gelir; profil, görev ve yakalanma zamanı ile etiketlenir.
  Ekran görüntüsü akış değilse “Son ekran görüntüsü” denir. Akış/ekran erişimi
  ayrıca izin gerektirir; hassas sayfa içeriği gereksiz kaydedilmez.
- Flow'a erişim izni ile üretim, kredi harcama ve hesap değiştirme izinleri ayrıdır.

## Kabul testleri

| Kapı | Test | Başarı ölçütü |
| --- | --- | --- |
| 1 | Windows'ta ilk panel ve sohbet | Gerçek profil etiketleri keşfedilir; iki seçim sayacı doğru; Chrome açılmaz; sohbet çalışır. |
| 2 | Tek profil, yalnızca Flow oturumu kontrolü | Açık izinle doğru profil eşleşir; `https://flow.google.com/` erişimi ve oturum durumu doğrulanır; üretim başlamaz. |
| 3 | İki bağımsız profil | Kullanıcı doğrulaması ve bağlantı kayıtları iki bağımsız oturumu gösterir; A işlemi B'nin sekmesini/hesabını değiştirmez. |
| 4 | Aynı profil, iki görev | İkinci görev bekler; çakışan gezinme/tıklama olmaz. |
| 5 | Üç farklı profil, sınır iki | En fazla iki etkin görev; üçüncü kuyrukta; sıra/iptal davranışı tutarlı. |
| 6 | A'yı durdur | A'da yeni işlem olmaz ve kuyruk iptal edilir; B çalışır; kişisel pencereler açık kalır. |
| 7 | Tümünü durdur ve bağlantı kaybı | Yeni işlem engellenir; durum dürüstçe gösterilir; yanlış profile geri düşülmez. |
| 8 | Önizleme | Görev/profil ve zaman doğru; eski görüntü canlı diye gösterilmez; izin kaldırılınca erişim durur. |

Kapı 3–8 henüz uygulanmamıştır ve burada uçtan uca test edilmemiştir.
İlk gerçek test iki hesapta üretim değil, yalnızca zararsız oturum kontrolüdür.
Kabul kayıtlarında gerçek hesap adları, profil yolları, CDP tokenları ve çerezler
yayımlanmaz.

## Otomatik hazırlık kontrolleri

Linux, izole Python 3.13 ortamı; gerçek tarayıcı/Flow bağlantısı kullanılmaz.
Yönlendirme ve sekme testleri sahte CLI/CDP kullanır; zaman aşımı testi yalnızca
sentetik alt süreçler oluşturur.

- Salt okunur envanter ve kimlik doğrulamalı panel rotaları: 14 test.
- Mevcut backend yönlendirmesi, ayrı sekme preamble'ı, daemon yeniden yönlendirmesi
  ve zaman aşımı temizliği: 23 test.
- Toplam: 37 test geçti. Bu, çoklu Chrome profili, paralel görev sınırı veya panelde
  “durdur” özelliğinin çalıştığı anlamına gelmez.

Tekrarlamak için izole test yorumlayıcısı `HERMES_PYTHON` ile seçildikten sonra:

```bash
scripts/run_tests.sh tests/hermes_cli/test_browser_inventory.py tests/hermes_cli/test_browser_panel_routes.py -q
scripts/run_tests.sh tests/tools/test_browser_use_cli.py -k 'BackendCdpResolution or OwnTabPreamble or BackendSwapRetargetsDaemons or TimeoutProcessGroupKill' -q
```

Tam Hermes Python 3.14 çalışma zamanı ve gerçek Windows Chrome bağlantısı ayrıca
doğrulanmalıdır. Ana dal kabul testi bitmeden birleştirilmez.
## Exact-project and Agent composer preflight (no submission)

After a valid local image draft, a separate unchecked consent and button initiate
`POST /api/browser/flow/project`. It accepts only `consent:true`, one `target_id`
and a bounded project URL. Session authentication remains mandatory.

Both frontend and backend now accept the observed
`/project/<UUID>/collection/<UUID>` form as a reference to its parent project;
unknown suffixes, queries, fragments and non-Flow origins are rejected. The
preflight never navigates to the entered address. Fresh target metadata must
match the requested project, and a second synchronous origin/project guard
executes before DOM inspection. A different target/project never becomes a
fallback. Only the selected target is attached and detached.

The fixed side-effect-guarded DOM expression returns page-ready, empty-editor,
Agent-label and stop/send-control markers plus bounded textarea/contenteditable
counts. It returns no editor values, project content, account data, cookies or
raw HTML. Existing editor text is preserved. The label/control vocabulary is
English/Turkish/Russian and may not match the live UI; unknown/ambiguous controls
produce an inconclusive result, not a broadened permission or a click retry.
A disabled send control is expected with an empty editor and is reported as such.

A `project_ready` result is an observation, **not production authorization**:
account/profile identity, active Agent-mode selection, model, credit budget and
result tracking still need implementation/validation before dispatch. No filling,
submit, generation, project creation, download or config mutation is performed.
The operation shares the one-shot Chrome lock, limits total work to 75 seconds,
uses no proxy, suppresses raw WebSocket debug logging and closes its test session.
Draft edits invalidate the displayed preflight by unmounting it; consent loss,
target changes and refresh clear draft state. An already-started read-only
request may complete within its timeout after leaving the panel.

Validation: 499 web tests, 89 targeted Python tests in the isolated Python 3.13
environment, TypeScript, changed-file lint and production build passed. A local
Chromium fixture exercised the actual guarded expression against a synthetic
project/collection page, a changed project and an existing private editor draft.
It verified no private values returned and no submission. Desktop/mobile fixtures
verified independent consent, explicit request, exact target/project payload,
marker display and no horizontal overflow. The real Windows composer shape is
not yet verified; the user's next preflight result supplies that evidence.

## Explicit composer staging test (writes text, never submits)

The user verified the real Windows project/composer preflight: one empty
contenteditable, zero textareas, one send control, Agent label visible, no stop
control. Send was disabled while empty. This does not prove account identity,
Agent selection, model/cost settings or production automation.

The next separate write-consent control accepts at most two named rows, each
prompt at most 3000 characters. Names must begin `hmx_test_` so the first test can
use new names such as `hmx_test_003_sahil` and `hmx_test_004_orman`. The backend
validates these constraints independently of the client. It constructs fixed
image-only instructions with the rows as escaped JSON data; the requested count
is **not a hard enforcement of how many outputs Flow Agent might generate if a
user later submits it**. This stage never submits those instructions.

- Authenticated `POST /api/browser/flow/stage` requires BOTH normal consent and
  explicit `fill_consent:true`. Unknown fields, malformed JSON and schema errors
  return safe fixed errors without echoing prompt contents. A bounded request
  names an idempotency UUID, selected target, exact project and one/two rows.
- The owning Hermes profile is explicit in the client request and resolved under
  the backend's profile/secret scope before an await. A profile-local SQLite
  attempt record is committed BEFORE opening Chrome. It records only target,
  project, SHA-256 message digest, count, status and timestamps — not prompt text.
  Both same-ID replay and the same project/text under a new ID are fenced.
- Fresh target metadata and side-effect-guarded preflight precede the write. A
  fixed synchronous expression checks the exact origin/project, one empty
  contenteditable, Agent label, idle controls and unique send control. It focuses
  that editor and rechecks target/emptiness before native `execCommand('insertText')`.
  This effectful call requires write consent; it is not a broader-permission
  retry of a failed read. Textareas, ambiguous controls and existing user text
  are refused. No click, Enter, keyboard shortcut, navigation, account change,
  production, download or profile copying occurs.
- The inserted text is compared locally with the approved message; a subsequent
  guarded read reports whether the send control became enabled. Raw editor text
  is not returned. Focus/navigation races, exceptions and unknown outcomes are
  blocked/uncertain, never automatically rewritten.
- Authenticated, profile-scoped `GET /api/browser/flow/stage/<UUID>` only reads
  the durable status. The UI may use this after a failed response; it never
  retries the mutation. An interrupted attempt survives restart as uncertain.
  Leaving/reloading the panel does not cancel an already-started write.

Windows acceptance: keep the test project open, Agent idle and composer empty.
Edit the local two-row draft to use NEW `hmx_test_…` names. Run draft/project
checks, grant separate write consent, press **Test metnini yerleştir (gönderme)**
once and approve only the corresponding Chrome request. Expected: staged text,
no production, and a reported send-control state. Show the Flow composer and
result, but **do not click send manually**. On error/uncertainty, inspect and share
instead of retrying. This staging step never submits. A separately authorized one-click test
submission is described below; asset reconciliation/download and Chat integration
are still not implemented.

Validation: 508 web tests, 110 targeted Python tests (isolated Python 3.13),
TypeScript, changed-file lint and build passed. Native local Chromium exercised
contenteditable insertion and the input event, send enabling, escaped special
text, preservation of existing text, wrong origin/project and focus navigation
refusal; submit click count remained zero. Synthetic CDP tests enforce read →
write → guarded read → detach and prohibit other commands. SQLite tests cover
concurrent claims, restart fencing, profile isolation and no prompt persistence.
Desktop/mobile mocked UI fixtures cover independent write consent, one request,
status-only recovery, disabled repeat action and no horizontal overflow. The user subsequently verified actual Windows contenteditable insertion and send
enabling. They also demonstrated that a visible Agent label does not mean it is
selected: the selected button has `aria-pressed="true"`.


## Separately approved single-click test submission

This is a test dispatch, not a batch executor or a production-success receipt.
`POST /api/browser/flow/stage/submit` requires session auth, an explicit owning
Hermes profile, `submit_consent:true`, and `settings_confirmed:true`. It accepts
only a stored stage UUID and the identical one/two named prompt rows; caller
URLs, target IDs and script expressions are refused. Schema failures are fixed
errors without prompt content. Account/model/aspect/x1 settings are confirmed
by the human, **not programmatically verified**. Cost is unknown; the instructed
image count is **not a hard output/credit cap**.

The backend rebuilds the original message and checks its SHA-256/count against
the profile-local record. An unstaged, interrupted, submitted, missing or changed
record cannot dispatch. Fresh target metadata must match the recorded target and
project; missing targets never fall back to another tab. A guarded read checks:
exact origin/project, no query/hash, loaded page, one visible contenteditable
holding the exact normalized approved message, idle controls, one enabled send
control and **one visible enabled `button.agent-mode-chip`
with `aria-pressed="true"`**. Labels, colors and hashed Angular classes cannot
prove selected Agent mode.

After the read, a SQLite compare-and-swap commits `submission_attempt_started`
before effectful evaluation. The fixed synchronous expression repeats every
guard and invokes the unique send control's `.click()` exactly once. There is no
Enter fallback, rewrite, automatic retry, navigation or account change. A guard
failure after claim also consumes the attempt. A lost connection/exception or
process interruption after claim is permanently fenced as uncertain. Concurrent
and restarted requests cannot claim again. No plaintext prompt is persisted.

`submit_clicked` means only that the synchronous click returned; Flow acceptance,
completed images, names and spending are not verified. `production_submitted`
is null for clicked/uncertain results, not a success assertion. The profile-scoped
read-only status route returns the saved project/target/count and receipt without
connecting to Chrome. The independent submission card resumes an existing staged
UUID after a dashboard restart without requiring an empty editor or restaging.
Two unchecked confirmations and an explicit button click are required. Response
loss triggers only a status read; the button stays disabled, never resubmitting.
Reloading the dashboard is not cancellation of an already-started operation.

Windows acceptance: preserve the staged Flow text and selected Agent mode. Update
and restart **only Hermes/dashboard**. Load the existing stage UUID and identical
rows in the separate card, read the record, inspect actual account/model/settings
in Flow, grant both confirmations, and press the Hermes test submission button
once. Approve only its corresponding Chrome request if asked. Do not click the
Flow arrow manually, reload Flow or retry on uncertainty. Share both the dashboard
receipt and Flow progress/results. Live Windows dispatch acceptance remains pending.

Local validation: 517 web tests and 123 targeted Python tests; typecheck,
changed-file ESLint and production build pass. Synthetic CDP verifies guarded
read → durable claim → one effect → detach; SQLite verifies atomic concurrency,
restart fencing, wrong digest/count and separate profile isolation. Native local
Chromium validates selected/inactive/unknown Agent states, exact text, disabled/
ambiguous/busy controls, origin/query guards, escaped data and a single click with
no rewrite. Mocked desktop/mobile UI validates existing-record resume, independent
permissions, no automatic submission/replay and no horizontal overflow. No real
Flow request was submitted by these tests. The changed-code health ratchet against the previous head passes using an
isolated pinned ruff 0.15.10 tool; no Hermes runtime environment was modified.

### Agent button selector correction

The live Windows inspection confirmed a selected `button.agent-mode-chip` with
`aria-pressed="true"`, while the test returned `agent_not_selected`. The former
selector additionally required an assumed custom parent tag. That unverified
parent dependency has been removed; the observed button class and explicit
pressed state remain mandatory. One visible enabled candidate is still required:
missing/ambiguous, disabled, absent pressed state and `aria-pressed="false"` all
block sending. This does not click or automatically enable Agent mode.

A native local fixture with the observed button under an ordinary wrapper failed
on the old expression (selected button incorrectly rejected, zero clicks) and
passes on the corrected expression. The fixture also checks inactive/unknown/
disabled/ambiguous/missing candidates, hidden duplicates, changed text, zero
clicks in blocked cases and exactly one approved click. The optional committed
DOM test needs Node Playwright and Chromium; dependency-unavailable environments
skip it explicitly. The same fixture was exercised separately with the existing
local Playwright installation. This proves the selector regression in a local
fixture, not yet live Windows dispatch acceptance.

No staged text or ledger entry is rewritten. Resume the existing stage UUID and
identical rows. If the durable state is not `text_staged`, do not create a new UUID
to bypass a fence. Only explicit renewed production consent can trigger another
submission request, and the durable compare-and-swap still permits at most one
effectful send-control evaluation for a stage.


### Read-only Agent predicate diagnostic

The real Windows submission remains blocked with `agent_not_selected` after a confirmed
backend restart at `3ff18ba8`, despite a screenshot of the selected chip. The parent-selector
regression test was not proof that this live issue was resolved. Do not repeat submissions,
clear the Flow composer, or replace the staged record to diagnose this.

For an existing stage ID, the submit card now offers **Agent düğmesi tanısı — salt okunur**.
A fresh diagnostic-only checkbox plus **Agent durumunu oku (gönderme yok)** sends the ID
and explicit consent, not prompt text, target, URL or JavaScript. The protected, profile-scoped
endpoint resolves the saved target/project. One fixed evaluation with `throwOnSideEffect:true`
reports matched/visible/selected-visible counts, the unique button's enabled state and a
closed `aria-pressed` enum. It reads no prompt, writes no composer text, clicks nothing,
and never changes the stage ledger or rearms submission fences. It does not verify account,
model, output count or production acceptance. If the Chrome read is blocked, it reports that
failure instead of falling back to an effect-enabled evaluation.

The existing one-button + enabled + `aria-pressed=true` submission guard remains unchanged;
its selector/visibility predicate is shared with diagnostics. Native local Chromium tests
exercise the read-only CDP evaluation and check that prompt text and click counts stay unchanged.
The user must share the diagnostic result to identify the live failing predicate. This is a
diagnostic addition, not a claimed fix for the remaining Windows submission issue.
