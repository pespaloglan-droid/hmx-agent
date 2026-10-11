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