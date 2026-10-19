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
