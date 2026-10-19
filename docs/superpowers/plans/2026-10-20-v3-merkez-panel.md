# v3 — merkez panel ve çok firmalı kurulum

> Yürütme: Claude, kullanıcı uyurken/işteyken onay beklemeden (2026-10-19 gecesi verilen yetki: "tüm haftalık kotanı doldurana kadar çalış, sürekli yeni planlar yapabilirsin"). Her aşama: TDD → typecheck/lint → birim + e2e → commit. Büyük değişiklikler `v3` dalında; `main`'e (canlı) yalnızca e2e yeşil ve geriye uyumlu aşama sonlarında.

## Amaç

Kurucunun (yalnız onun) firma kurduğu, sektör ve modülleri tek tıkla açıp kapattığı, kullanıcıları ve kayıtları izlediği merkez panel; firmaların verisi seçilebilir yerde: ortak bulut, firmaya ayrı veritabanı ya da müşterinin kendi sunucusu.

## Kararlar (kullanıcı adına verildi; gerekçe ve maliyet)

- Ruling: Varsayılan veri yeri **firmaya ayrı veritabanı**; ortak veritabanı küçük/deneme müşterileri için seçenek. — Kullanıcının içgüdüsü (veri ayrı dursun) ve firmaya özel yedek/teslim. — Maliyet: firma başına ek veritabanı ücreti ve göçlerin her veritabanına uygulanması (otomatik).
- Ruling: Merkez panel aynı kod tabanında `/platform` alanı; kendi bağlantısı `PLATFORM_DATABASE_URL` (yoksa ana veritabanı). İstenirse ayrı bir Vercel projesi olarak yayınlanır. — Tek kod, tek test takımı. — Maliyet: panelin kodu firma kurulumlarında da bulunur (yetki olmadan erişilemez).
- Ruling: Bugünkü tek-firma kurulumu (Karviyes, `INSTALL_CONFIG_JSON`) bozulmadan çalışmaya devam eder; ayar dosyası yalnız ilk değer olur. — Canlı demo kesintisiz kalsın. — Maliyet: bir süre iki yol birlikte desteklenir.
- Ruling: Firma adresi alt alan adı (`firma.kemalayan.com`); yerelde ve testte `?firma=` yerine ayar ile seçilir. — Maliyet: DNS'te joker kayıt (kullanıcı yapar).

## Aşamalar

### V3-1 Firma ayarları veritabanında
`company_settings` (firma başına: modüller, sektör, 2FA zorunlu roller, özellik anahtarları). `getCompanyConfig(companyId)` tüm eylem ve sayfalarda `getInstallConfig()` yerine; kayıt yoksa kurulum ayarı. Önbellek istek başına.

### V3-2 Platform yöneticisi
`platform_admins` (kullanıcıya bağlı), `platform_audit`; `/platform` düzeni yalnız platform yöneticisine, 2FA zorunlu; kurulum komutu `scripts/platform-yonetici.ts` ilk hesabı açar. Firmaların kullanıcıları panele giremez.

### V3-3 Firma yönetimi (panel)
Firma listesi; yeni firma (ad, kısa ad, sektör, modüller, veri yeri, ilk yönetici daveti); modül aç/kapa (bağımlılık kontrolü, veri silinmez); sektör değişikliği (veri varsa engel); askıya al / aç (girişler durur); her işlem platform kaydında ve firmanın denetim kaydında.

### V3-4 Adresle firma seçimi
İstek adresinden firma (`tenants.host`); giriş yapan kullanıcının o firmada üyeliği yoksa giriş reddedilir. Tek-firma kurulumunda değişiklik yok.

### V3-5 Firmaya ayrı veritabanı
Firma kaydında veri yeri ve şifreli bağlantı adresi; panelden "veritabanını hazırla" (göçler + firma kaydı); isteği doğru veritabanına yönlendiren bağlantı kaydı; ortak → ayrı veritabanına taşıma komutu.

### V3-6 Görünürlük ve izleme
Firma başına rol–ekran tablosu ve özellik anahtarları; firma kullanıcı listesi (son giriş, 2FA, kilitle); firma kullanım özeti; tüm firmaların denetim kaydı.

### V3-7 Destek ve veri
Müşteri gözüyle bak (salt okunur, süreli, gerekçeli, kayıtlı, ekranda şerit); firma verisini dışa aktar (JSON); yedek durumu; sözleşme sonu silme/anonimleştirme.

### V3-8 Müşterinin kendi sunucusu (VPS)
Merkezden imzalı ayar paketi (Ed25519); VPS kurulumu ayarı çeker, ulaşamazsa son bilineni kullanır.

### Sonra: eski sistemden kalan eksikler (G-aşamaları)
G1 firma profili (MERSİS, IBAN, mali müşavir) + kayıtlara not/belge · G2 ürün/stok kartı + irsaliye + proforma · G3 tekrarlayan kayıt + personel carisi · G4 raporlar (gelir-gider, nakit akış tahmini, gider kırılımı) · G5 CRM (müşteri önceliği, toplu aktarma, gelişmiş filtre, xlsx) · G6 üretim (fatura öncesi parti uyarısı, iş geri çağırma, kontrol düzeltme, parti bölme).

## Kayıt

- 2026-10-19 gece: yedek alındı (`yedekler/2026-10-19`: depo paketi + `yedek-2026-10-19` etiketi, yerel veritabanı, eski proje ve takip paneli, canlı veritabanı JSON dökümü; döküm parola özetleri içerir, paylaşılmaz).
- V3-1 bitti: `company_settings` (göç 0033), istek başına firma ayarı (`getConfig`), tüm sayfa ve eylemler firma ayarıyla çalışır.
- V3-2 + V3-3 (ilk dilim) bitti: `platform_admins`, `platform_audit` (göç 0034; uygulama rolüne kapalı, satır güvenliği açık), `/platform` (yalnız panel yöneticisi, 2FA zorunlu), firma listesi, firma ayarları (modüller bağımlılıklarıyla, sektör — sipariş varken değiştirilemez —, 2FA rolleri, özellik anahtarları, askıya alma), panel kaydı; askıdaki firmanın kullanıcıları oturum açamaz. İlk iki gerçek özellik anahtarı: siparişte teslim tarihi zorunlu, mutabakat e-postası. Panel yöneticisi: `scripts/platform-yonetici.ts <e-posta>`.
  - Ruling: Panel, firma verisine yalnız firma kapsamındaki güvenli kapıdan (`withCompany`) dokunur; zorunlu satır güvenliği sahip bağlantısına da uygulandığı için başka yol yok. — Maliyet: çok firmada liste firma başına bir sorgu (yüzlerce firmaya kadar sorun değil).
- V3-3b + V3-4 bitti: panelden yeni firma (ad, kısa ad, adres, sektör, modüller, ilk yöneticiye 72 saatlik davet); `companies.host` (göç 0035); istek adresinden firma seçimi (bir dakikalık önbellek, bilinmeyen adreste kurulumun firması); firma adresleri giriş için güvenilir köken; davet bağlantısı firmanın adresiyle. Uçtan uca: davet kabul eden kullanıcı yalnız kendi firmasına girer.
  - Ruling: Firma başına alt alan adı için Vercel'de joker alan adı (`*.kemalayan.com`) ve DNS kaydı kullanıcıya kalır. — Maliyet: o yapılana kadar yeni firmalar yalnız kendi adresi tanımlanınca açılır.

- V3-5 bitti: firmaya ayrı veritabanı. Panelden firma açarken veritabanı adresi verilirse firma orada açılır (göçler uygulanır, firma satırı kopyalanır); adres ana veritabanında AES-256-GCM ile şifreli (`companies.data_url_enc`, göç 0036). Firma verisine giden her yol (`withCompany`, eylemler, oturum, firma ayarı, davet, panel) `dataDbFor` ile yönlenir. Canlı derleme ana veritabanından sonra her firma veritabanını da taşır. Panel listesinde "Veri: Ortak / Ayrı veritabanı".
  - Ruling: Kimlik (kullanıcı, oturum, parola) ana veritabanında kalır; üyelik firma veritabanında olduğu için kullanıcının parolasız bir kopyası oraya yazılır (`mirrorUser`). — Maliyet: kullanıcı adı/e-postası değişirse kopya eski kalır (yalnız görüntüde; giriş ana veritabanından).
  - Ruling: Bir firma veritabanının göçü başarısız olursa canlı derleme durur. — Maliyet: tek firmanın erişilemeyen veritabanı herkesin güncellemesini bekletir; tersi o firmayı yeni kodla eski şemada bırakırdı.
  - Ruling: Şifre anahtarı `PLATFORM_SECRET`, yoksa `BETTER_AUTH_SECRET`; açarken ikisi de denenir (sonradan `PLATFORM_SECRET` eklemek güvenli). — Maliyet: iki değerden kullanılanı değiştirilirse adresler açılmaz; belgede uyarı var.
- V3-6 bitti: firma sayfasında kullanıcılar (rol, hesap türü, 2FA, son oturum açma, durum; gerekçeyle kilitle/aç — iki kayda yazılır), son 30 günün kullanımı (alan bazında işlem sayısı, işlem yapan kişi), rol–ekran tablosu (açık modüllere göre), firma denetim kaydı; `/platform/denetim` bütün firmaların denetim kaydı.
  - Ruling: "Son giriş" oturum tablosundaki en yeni oturumun açılış zamanıdır. — Maliyet: çıkış yapıp oturumu silinen kullanıcıda daha eski görünebilir; ayrı giriş kaydı tablosu gerekirse eklenir.
  - Ruling: Kullanım ayrı sayaç tutmadan denetim kaydından sayılır (her yazma işlemi zaten kayda düşüyor). — Maliyet: salt okuma (sayfa görüntüleme) kullanımı görünmez.
- V3-7 (ilk dilim) bitti: müşteri gözüyle bak. Panel yöneticisi firma sayfasından rol, süre (15 dk–1 saat; veritabanı en çok 2 saate izin verir) ve en az 10 karakterlik gerekçeyle bakış başlatır; `platform_views` (göç 0037) kaydı + httpOnly/strict çerez. Bakış süresince kullanıcı salt okunurdur: `defineAction` her eylemi, dosya yükleme ucu yüklemeyi reddeder. Uygulamada sarı şerit ve "Bakışı bitir". Başlangıç ve bitiş firmanın denetim kaydına (gerekçeyle) ve panel kaydına yazılır. Panel yetkisi kaldırılan ya da 2FA'sı kapanan yöneticinin açık bakışı geçersizdir.
  - Ruling: Tablo `company_id` yerine `target_company_id` kullanır. — Neden: `app_secure_tables()` `company_id` sütunlu her tabloya firma politikası ve FORCE RLS uygular; panel tablosu sahip bağlantısına açık kalmalı. — Maliyet: yok.
  - Ruling: Bakışta sayfa görüntülemeleri tek tek kaydedilmez, yalnız başlangıç/bitiş. — Maliyet: hangi ekranlara bakıldığı kayıtta yok.
- V3-7 (ikinci dilim) bitti: firma sayfasında "Veriyi indir (JSON)" — firma kapsamındaki bütün tablolar satır güvenliği altında okunur (yeni modül tabloları kendiliğinden girer), kuruşlar metin, davet/mutabakat bağlantı özetleri ve ayrı veritabanı adresi dosyaya girmez; indirme firmanın denetim kaydına ve panel kaydına yazılır.
  - Ruling: Sözleşme sonu silme/anonimleştirme bu turda yapılmadı. — Neden: geri alınamaz; tablolar arası bileşik yabancı anahtarlar silme sırasını modül modül tasarlamayı gerektiriyor ve hangi kayıtların yasal saklama süresince (VUK 5 yıl) tutulacağı kullanıcının/mali müşavirin kararı. — Maliyet: şimdilik firma askıya alınır, veri indirilir; silme elle yapılır.
  - Ruling: Yüklenen dosyaların (logo, belge) içeriği JSON'a girmez, yalnız kayıtları girer. — Maliyet: dosyalar depolamadan ayrıca alınmalı.
