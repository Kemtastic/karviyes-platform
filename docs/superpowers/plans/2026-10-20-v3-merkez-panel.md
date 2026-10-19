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
- G1 (ilk dilim) bitti: firma profili (`companies.profile`, göç 0038) — ticari unvan, vergi dairesi, vergi no (10 hane) / T.C. kimlik no (11 hane, kontrol haneleriyle), MERSİS (16 hane), ticaret sicil, adres, telefon, e-posta, web, banka ve ana IBAN (mod-97 doğrulamalı), mali müşavir. Firma Ayarları ekranında form; mutabakat anında antet kayda geçer ve PDF'de görünür.
  - Ruling: VKN için yalnız biçim (10 hane) denetlenir, kontrol hanesi algoritması uygulanmadı. — Neden: algoritmayı doğrulayacak resmî örnek elimde yok; yanlış algoritma geçerli numarayı reddeder. — Maliyet: hatalı VKN yazım yanlışı yakalanmaz.
  - Ruling: Antet mutabakat kaydına o anki hâliyle yazılır (sonradan profil değişse de eski mektup değişmez). — Maliyet: yok; belge değişmezliği için doğru olan bu.
- G2 (ilk iki dilim) bitti: sevk fişi PDF (sevk geçmişinden ve iş kartından; alıcı, vergi bilgisi, teslim adresi, ürün, ambalaj, bu sevkteki ve o ana kadarki toplam miktar, kalan, iki imza alanı) ve proforma fatura PDF (sipariş ekranında "Proforma"; satırlar KDV hariç, oran bazında KDV, genel toplam, firma anteti ve IBAN, geçerlilik `?gun=` ile 1–90 gün, varsayılan 15). Uçtan uca testteki sipariş PDF denetimi sayfa adresi değişmeden istek attığı için boşa geçiyordu; düzeltildi.
  - Ruling: Sevk fişi "sevk irsaliyesi" adıyla basılmaz; altında "irsaliye yerine geçmez" yazar. — Neden: kâğıt irsaliye matbu (onaylı) belgeyle, değilse e-İrsaliye ile düzenlenir; kendi bastığımız belge irsaliye sayılmaz. — Maliyet: resmî irsaliye için ayrıca e-İrsaliye entegrasyonu gerekir (e-fatura köprüsüyle aynı yol, docs/e-fatura-entegrasyonu.md).
  - Ruling: Proforma kayıt oluşturmaz, numarası siparişin numarasıdır. — Maliyet: aynı siparişe farklı tarihlerde verilen proformalar ayırt edilmez (tarih ve geçerlilik yazılı).
  - Ruling: Ürün/stok kartı (G2c) ayrı dilime kaldı. — Neden: poşet siparişleri ölçüye göre tanımlanıyor; kart yapısı pilot firmanın ürün listesiyle netleşmeli.
- G3 (ilk dilim) bitti: tekrarlayan kayıtlar (`fin_recurring`, göç 0039; menüde "Tekrarlayan Kayıtlar"). Kira/aidat/abonelik gibi aylık masraf ya da gelir şablonu: hesap, KDV dahil tutar ve oran, kategori, ayın günü (1–28), ilk/son ay. Vadesi gelen ay Muhasebe Özeti'nde uyarı olarak çıkar; "İşle" o ayın gününe masraf hareketi yazar (elle masrafla aynı denetimler: dönem kilidi, kasa yeterliliği, KDV ayrımı — ortak `writeExpense`). Aylar sırayla ve bir kez işlenir; durdurulabilir.
  - Ruling: Kendiliğinden (zamanlanmış) işleme yok, kullanıcı onaylar. — Neden: muhasebe kaydı kimin onayıyla girdiği belli olmalı; tutar değişen ay (zamlı kira) için düzeltme şansı kalır. — Maliyet: kullanıcı ayda bir tıklar.
  - Ruling: Cariye bağlı tekrarlayan kayıt (ör. ev sahibi cari hesabına kira faturası) bu dilimde yok; yalnız kasa/banka masraf ve geliri. — Maliyet: cari takibi gereken kira faturası elle girilir.
- G3 (ikinci dilim) bitti: personel carisi (`fin_staff_entries`, göç 0040; menüde "Personel Carisi"). Tahakkuk (maaş/prim, dönemli) borcu artırır; avans ve maaş ödemesi kasa/bankadan "Personel" masrafı olarak çıkar ve borcu azaltır; kesinti borcu azaltır. Kişi bazında bakiye ve ekstre, fazla avans uyarısı. İptal personel carisinden yapılır ve kasa hareketini de geri alır; personel ödemesinin kasa hareketi Hareketler ekranından iptal edilemez (çeklerdeki kural gibi). Veritabanında: ödeme/avans ⇔ kasa hareketi zorunlu (CHECK).
  - Ruling: Bordro hesabı (SGK, gelir vergisi, damga) yapılmaz; tahakkuk net tutarla elle girilir. — Neden: bordro mali müşavirin işi ve mevzuatı sık değişir. — Maliyet: brüt/net ayrımı yok.
  - Ruling: Personel carisi yalnız yönetici ve muhasebe rolüne açık. — Neden: maaş kişisel veridir (KVKK).
- G4 bitti: "Gelir-Gider ve Nakit" ekranı (`/muhasebe/raporlar`). Gelir-gider: seçilen aralıkta ay ay satış, alış (iadeler düşülür), masraf ve diğer gelir KDV hariç, sonuç; masraf kategori kırılımı. Nakit akış tahmini: bugünkü kasa+banka ile başlar, 13 hafta; vadeli açık alacak/borç (eşleştirmeler dahil FIFO), portföy ve verilen çekler, işlenmemiş tekrarlayan kayıtlar haftasına; vadesi geçenler ilk haftada; nakdin eksiye düştüğü hafta uyarılır.
  - Ruling: Yalnız TL kayıtlar; döviz fatura ve hesaplar raporlara girmez (ekranda yazılı). — Maliyet: dövizli çalışan firmada tahmin eksik; kur çevrimi sonraki dilimde.
  - Ruling: Gelir-gider tahakkuk esaslı ve "yönetim raporu"dur; stok değişimi ve amortisman yok, resmî kâr/zarar değildir (ekranda yazılı).
  - Proforma'da KDV oranları artık sıralı (satır sırasına bağlı kalıyordu; testte ara sıra kırmızı çıkardı).
- G5 bitti: satış takibinde müşteri önceliği (A/B/C, `sales_contacts.priority`, göç 0041; satırda seçilir, listede A önce), süzgeçler (ad araması, öncelik, sorumlusu olmayanlar, 30/60/90/180 günden uzun süredir aranmayanlar), yöneticiye "Müşterileri aktar" (bir satışçının bütün müşterileri başkasına; denetim kaydında müşteri listesiyle).
  - Ruling: xlsx dışa aktarma eklenmedi; mevcut CSV dışa aktarımları (UTF-8 BOM, `;` ayraç) Excel'de doğrudan açılıyor. — Neden: xlsx için yeni bağımlılık gerekir. — Maliyet: biçimli (renkli, formüllü) Excel yok.
  - Not: Vercel derlemeleri tek tek kuyrukta; her commit'i hem v3'e hem main'e itmek kuyruğu ikiye katlıyordu. Bundan sonra yalnız main itilir, v3 ara sıra eşitlenir.
- G6 bitti: iş ekranında "Düzeltme" — kontroldeki ya da onaylanmış işte sağlam adet gerekçeyle düzeltilir (sevk edilenin altına inemez; sipariş adetleri de güncellenir; iş geçmişine "Adet düzeltildi, önceki adet → adet" yazılır) ve hiç sevk edilmemiş onaylı iş "Onayı geri al" ile kontrole döner (sipariş satırı yeniden üretimde, sipariş "faturaya hazır"dan çıkar). Faturası kesilmiş siparişin işinde ikisi de engellenir.
  - Ruling: Parti bölme (bir işi iki işe ayırma) yapılmadı. — Neden: iş ↔ sipariş satırı bire bir (benzersiz indeks); bölmek satır bölmeyi, fiyat ve ödeme dağıtımını gerektirir — sipariş tarafında ayrı tasarım. Kısmi sevk zaten var. — Maliyet: aynı satırın farklı partileri ayrı izlenemez.
  - Fatura öncesi uyarı: faturaya hazır siparişte üretilen ya da sevk edilen adedi sipariş adedinden farklı satırlar sipariş ekranında sarı kutuda listelenir (tutar sipariş adedine göre hesaplı olduğu için).
