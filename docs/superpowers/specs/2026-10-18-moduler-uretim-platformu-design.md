# Modüler üretim platformu — tasarım

**Tarih:** 18.10.2026 · **Çalışma adı:** karviyes-platform (ürün adı sonra verilecek) · **Durum:** onay bekliyor

## 1. Amaç ve neden

Karviyes v78 (ChatGPT Sites üzerinde çalışan, ambalaj/bez çanta üreticisi için üretim takip + ön muhasebe + CRM uygulaması) sektörü bilen biri tarafından kurulmuş değerli ekranlara ve iş bilgisine sahip. Ama denetim (`Karviyes-Tum-Proje-v78/kaynak-kod/.ai-reports/denetim-2026-10-18.md`) arka tarafın gerçek hayatta satılacak bir üründe kullanılamayacağını gösterdi: kimlik platform başlığına bağlı, firmalar arası sızıntı var, firma verisi tek JSON satırında, para float, yedek geri yüklenemez, testler çalışmıyor.

Bu projede **ekranları ve ekranlardaki iş bilgisini koruyarak arka tarafı sağlam biçimde yeniden kuruyoruz.** İlk müşteri Karviyes Ambalaj. Ürün sonra başka üreticilere (ilk hedef plastik poşet) satılacak; her müşteriye ihtiyacı olan modüller açılacak ve gerekirse müşteriye özel sunucu (VPS) kurulacak.

**Başarı:** Karviyes'in bugünkü üretim akışı (sipariş → kumaş ayırma → dilimleme → baskı → kesim → bitiş → sevk) yeni sistemde aynı ekran mantığıyla çalışıyor; 2FA'lı giriş, firma izolasyonu, kuruş doğruluğu, denetim izi ve geri yüklenebilir yedek baştan var; Vercel'de demo açık; aynı kod bir VPS'e tek komutla kurulabiliyor.

## 2. Hedefler, hedef olmayanlar, istenmeyenler

**Hedefler (v1)**
- Çekirdek: firma, kullanıcılar, roller/yetkiler, 2FA'lı giriş, cari (müşteri/tedarikçi) kartları, denetim kaydı, ayarlar.
- Üretim modülü + bez çanta sektör paketi: Karviyes'in üretim ekranları ve hesapları.
- Modül sistemi: modüller kurulumda bir ayar ile açılır/kapanır.
- Demo: Vercel + Supabase üzerinde, hayali örnek veriyle.
- VPS kurulumu: Docker ile tek komut, müşteri başına ayar dosyası.

**Sonraki sürümler (v1'de yok, tasarım bunlara yer bırakır)**
- Satış/CRM modülü, ön muhasebe modülü, cari mutabakat modülü, stok/klişe raporları.
- Plastik poşet sektör paketi.
- e-Fatura/e-Arşiv entegratörü.
- Karviyes'in canlı verisinin eski sistemden taşınması (ayrı bir göç işi).

**İstenmeyenler (teknik olarak çalışsa bile başarısızlık sayılır)**
- Denetimde bulunan açıklardan herhangi birinin yeni sistemde tekrar ortaya çıkması (bkz. §7).
- Para hesaplarında kayan noktalı sayı.
- Supabase'e kilitlenme: kodun düz Postgres ile çalışamaması.
- Ekranların "yeniden tasarlanıp" Karviyes kullanıcılarının alışık olduğu akıştan kopması. Görsel iyileştirme serbest, akış ve bilgi korunur.
- Bir modülün başka bir modülün tablolarına doğrudan yazması.

## 3. Kısıtlar

- Tek geliştirici + yapay zekâ ekibi; ilk demo kısa sürede çıkmalı.
- Kullanıcılar teknik değil; atölyede telefon/tablet kullanılıyor (eldivenli, aceleci kullanım).
- Arayüz Türkçe; tutar `1.234,56 ₺`, tarih `GG.AA.YYYY`, saat dilimi Europe/Istanbul.
- KVKK: kişisel veri envanteri tutulacak, veri yurt içinde tutulabilecek şekilde barındırma seçeneği açık kalacak.
- Demo herkese açık olmayacak; giriş zorunlu.

## 4. Kararlar (kullanıcının kararları)

- **Next.js** ile yapılacak.
- **Karviyes ilk firma**; ekranlar korunacak, arka taraf gerçek hayatta açık vermeyecek sağlamlıkta olacak.
- **2FA** zorunlu güvenlik özelliklerinden.
- Önce **Vercel gibi bir yerde demo**, sonra değerlendirme.
- Veritabanı **Supabase** (uygunsa).
- Modüller **panelden değil**, müşteriye özel kurulumda açılacak; müşteriye özel **VPS** mümkün olmalı.
- Sektörlere dallanılacak (bez çanta → plastik poşet …).
- Kullanıcı tasarım önerilerinin tamamını kabul etti ("senin önerini yap"); aşağıdaki "Claude'un kararı" işaretli maddeler bu kapsamdadır.

## 5. Mimari

### 5.1 Teknoloji (Claude'un kararı)
| Katman | Seçim | Neden |
|---|---|---|
| Uygulama | Next.js 16 (App Router), TypeScript `strict`, `any` yasak (lint) | Mevcut ekranlar React; Vercel'de ve Node'da (standalone) aynı kod çalışır |
| Veritabanı | PostgreSQL. Demo: Supabase (yönetilen). VPS: Supabase projesi **veya** Docker içinde Postgres 17 | Transaction, `numeric`/`bigint`, kısıtlar, RLS |
| ORM / göç | Drizzle ORM + drizzle-kit; tek göç zinciri, her göç geri alınabilir şekilde yazılır | Tipli sorgu, SQL'e yakın, Postgres'e taşınabilir |
| Kimlik | Better Auth (e-posta+parola, TOTP 2FA, yedek kodlar, oturum yönetimi, hız sınırı) — uygulamanın kendi Postgres tablolarında | Supabase Auth'a bağlı kalmamak; VPS'te düz Postgres'le çalışmak |
| Doğrulama | zod — her API girdisi ve her ortam değişkeni | |
| Arayüz | Tailwind 4 + shadcn/ui; ortak `Money`, `DateText`, `DataTable`, `ConfirmDialog`, `Modal` bileşenleri | Mevcut proje de bunları kullanıyor; denetimdeki biçim/onay bulgularını tek yerde çözer |
| Dosyalar | S3 uyumlu depolama arayüzü. Demo: Supabase Storage. VPS: MinIO veya dosya sistemi | Klişe/ürün görselleri |
| Test | Vitest (birim + Postgres'e karşı entegrasyon), Playwright (uçtan uca), CI'da tsc + lint + test | |
| Dağıtım | Demo: Vercel + Supabase. VPS: Docker image + docker compose (uygulama, Postgres, yedek, Caddy/TLS) | |

**Supabase'e bağlanmama kuralı:** Kod yalnızca standart Postgres bağlantısı (`DATABASE_URL`) ve S3 arayüzü kullanır. Supabase Auth, Supabase JS istemcisiyle veri okuma, Edge Functions kullanılmaz. Böylece aynı kod Supabase'te de VPS'teki düz Postgres'te de çalışır.

### 5.2 Kiracılık (Claude'un kararı)
- **Bir kurulum = bir firma** varsayılandır (müşteriye özel VPS modeliyle uyumlu). Demo da tek firma (Karviyes) çalıştırır.
- Yine de **her iş tablosunda `company_id`** bulunur ve **Postgres RLS** açıktır: her istek transaction başında `set_config('app.company_id', …)` ile kapsamlanır, RLS politikaları bu değeri kontrol eder. Bu, uygulama kodunda bir `WHERE` unutulsa bile sızıntıyı engeller (denetimdeki K1 sınıfı hata) ve ileride paylaşımlı barındırmaya geçişi mümkün kılar.
- Uygulamanın veritabanı kullanıcısı tablo sahibi değildir (RLS'yi aşamaz); göçler ayrı bir yetkili kullanıcıyla çalışır.

### 5.3 Modül sistemi (Claude'un kararı)
Modüller **derleme zamanında kodda bulunur, kurulumda açılır**. Panelden açma/kapama yok.

```
src/
  core/                 çekirdek: auth, firma, kullanıcı/rol, cari, audit, ayarlar, ortak UI
  modules/
    orders/             sipariş modülü (sipariş, fiyat, peşinat/tahsilat, fatura işareti) — §5.6
    production/         üretim modülü
      manifest.ts       { id, ad, bağımlılıklar:['core'], menü, izinler, rotalar }
      domain/           saf iş kuralları (hesaplar, durum makinesi) — testli
      db/schema.ts      bu modülün tabloları
      server/           servis fonksiyonları (her biri tek iş, transaction içinde)
      ui/               ekranlar
    sales/  accounting/  reconciliation/   (sonraki sürümler, aynı yapı)
  sectors/
    bags/               bez çanta sektör paketi
    plastic-bags/       (sonra)
  app/                  Next.js rotaları — yalnızca ince kabuk; modül ekranlarını çağırır
```

- **Kurulum ayarı** (`kurulum.config.ts` veya ortam değişkenleri, zod ile doğrulanır): `firma` (ad, logo, renk, alan adı), `moduller: ['orders','production']`, `sektor: 'bags'`, `guvenlik: { ikiAdimZorunluRoller: [...] }`.
- Kapalı bir modülün rotaları 404 döner, menüsü görünmez, API'si `ModuleDisabled` hatası verir. Tek bir `requireModule('production')` yardımcısı bunu sağlar.
- **Tüm modüllerin tabloları her kurulumda oluşturulur** (tek göç zinciri). Bir modülü sonradan açmak = ayarı değiştirip yeniden başlatmak; veri göçü gerekmez.
- **Modül sınırı kuralı:** Bir modül başka bir modülün tablolarına doğrudan yazmaz; o modülün `server/` altındaki dışa açık fonksiyonunu çağırır. Lint kuralıyla (import kısıtı) zorlanır. Örnek: ileride üretim "faturaya hazır" olduğunda ön muhasebe modülünün `createDraftInvoiceFromOrder()` fonksiyonu çağrılır.

### 5.4 Sektör paketi (Claude'un kararı)
Mevcut kodda `lib/sector-templates.ts` zaten bir başlangıç içeriyor (alanlar, aşamalar, reçete, sonuç alanları). Yeni sistemde sektör paketi bir TypeScript modülüdür:
- **Ürün alanları:** en, boy, körük, biye, gramaj, tutma yeri, model … (etiket, birim, doğrulama).
- **Aşama akışı:** bez çanta için kumaş ayırma → dilimleme → baskı → kesim → bitiş; aşama geçiş kuralları (ör. baskılı iş baskıdan geçmeden kesime gidemez; tamir/çevirme dönüşleri).
- **Hesaplar:** bobin başına adet, kumaş cm, hedef adet (`calculate()` mantığı), fire.
- **Bölüm formları:** her aşamanın başlat/bitir alanları (makine, usta, sağlam adet, fire, çuval/koli).

Plastik poşet paketi aynı arayüzü uygular. Üretim modülü sektörü bilmez; paketten okur.

### 5.5 Arka taraf kuralları (Claude'un kararı)
- Her yazma işlemi bir **servis fonksiyonu**: girdi zod ile doğrulanır → yetki kontrolü → tek transaction → audit kaydı. Route dosyaları yalnızca bu fonksiyonu çağırır.
- **Eşzamanlılık:** kayıt bazında `version` sütunu (iyimser kilit); global kilit yok.
- **Para:** kuruş cinsinden `bigint`; tek `money` modülü (yuvarlama kuralı tek yerde, yarım kuruş sıfırdan uzağa). Birim fiyat 4 ondalığa kadar `numeric(18,4)`.
- **Tarih:** `timestamptz`; gün hesapları Europe/Istanbul ile tek yardımcıdan.
- **Silme yok:** iş kayıtları arşivlenir/iptal edilir; audit tablosu yalnızca ekleme (uygulama kullanıcısının UPDATE/DELETE yetkisi yok).
- **Hatalar:** kullanıcıya yalnızca Türkçe, kontrollü mesaj + hata kodu; ayrıntı sunucu loguna.

### 5.6 Sipariş, iş ve para akışı (Claude'un kararı)
- **Sipariş ile iş ayrıdır.** Sipariş (müşteri, ürün özellikleri, fiyat, KDV, para birimi, peşinat, tahsilatlar) **sipariş modülünün** varlığıdır. Üretim modülü yalnızca **işi** (iş emri, aşamalar, sonuçlar, fire, sevk) tutar ve siparişe `order_id` ile bağlanır. Eski sistemdeki `crm_orders` ↔ iş ayrımıyla aynı mantık, ama tek yönlü: üretim siparişe doğrudan yazmaz, sipariş modülünün fonksiyonunu çağırır (ör. "üretilen/sevk edilen adet güncellendi").
- **v1'de iki iş modülü açılır:** `orders` (sipariş girişi + peşinat/tahsilat kaydı) ve `production`. İleride gelecek CRM özellikleri (arama, hatırlatma, satış raporları) `orders`'ın üstüne `sales` modülü olarak eklenir; sipariş tablosu taşınmaz.
- **"Faturaya Hazır"dan sonrası (v1):** Ön muhasebe olmadığı için sipariş üzerinde elle "fatura kesildi" işareti (tarih, belge no, kim işaretledi) tutulur. Sevk faturadan bağımsızdır (kısmi sevk dahil). Ön muhasebe modülü geldiğinde bu işaretin yerini `createDraftInvoiceFromOrder()` alır.
- **Para birimi:** Şema baştan çok para birimini destekler: her tutar `amount_minor bigint` + `currency char(3)`; dövizli siparişte kur, kur tarihi ve kaynağı siparişle birlikte saklanır. v1 arayüzü eski sistemdeki gibi TRY/USD/EUR seçtirir.

### 5.7 Roller ve atölye (Claude'un kararı)
Eski sistemdeki rol seti korunur: `admin`, `sales` (satış), `tracking` (eski adıyla "Muhasebe · Üretim Takip": kontrol, sevk, faturaya hazır akışını yürütür), bölüm rolleri `slitting`, `printing`, `cutting`, `finishing`, `repair` (tamir ayrı bölüm ekranı). Ön muhasebe modülü gelince ayrı `accounting` rolü eklenir. Toplayıcı, usta gibi giriş yapmayan **personel kartları** (eski `staff`) kullanıcı hesaplarından ayrı tutulur; formlarda "işi yapan" personel seçilir, denetim izine hem giriş yapan hesap hem seçilen personel yazılır. 2FA `admin` ve `tracking` için zorunludur.

**Atölye cihazları (Claude'un kararı, kullanıcı "onay almadan devam et" dedi):** Her bölümde ortak tablet varsayılır. Tablet, yalnızca o bölümün rolüne sahip bir **bölüm hesabıyla** giriş yapar (2FA zorunlu değil; yetkisi tek bölümün başlat/bitir işlemleriyle sınırlı; parola + cihazda uzun süreli oturum). İşi yapan kişi formda personel kartlarından seçilir. İsteyen çalışana kişisel hesap da açılabilir.

## 6. v1 kapsamı: ekranlar

Karviyes v78'deki karşılıkları referans alınır (ekran mantığı ve alanları korunur, kod kopyalanmaz — mevcut kod yoğun/okunamaz yazılmış).

**Çekirdek**
- Giriş, 2FA kurulumu (QR + yedek kodlar), 2FA doğrulama, parola sıfırlama, oturumlarım.
- Kullanıcılar ve roller (yönetici, satış, muhasebe, bölüm rolleri: dilimleme, baskı, kesim, bitiş), davet.
- Cari kartlar (müşteri/tedarikçi): unvan, VKN/TCKN (kontrol haneli doğrulama), vergi dairesi, il/ilçe (listeden), adres, yetkili, telefon.
- Firma ayarları: ad, logo, renk (beyaz etiket temeli).
- Denetim kaydı görüntüleme (yönetici).

**Üretim modülü + bez çanta paketi** (Karviyes `app/ui.tsx`, `app/bolum/[role]`, `app/crm-ui.tsx` sipariş kısmı, `app/plates-ui.tsx`, `app/reports-ui.tsx` karşılıkları)
- Sipariş girişi (müşteri, ölçüler, model, tutma yeri, renk, gramaj, baskı renkleri, klişe, adet/bobin, fiyat, KDV, peşinat, bölüm notları) ve hesaplanan alanlar.
- Ana üretim panosu: Siparişler / Kumaş Ayırma / Üretimde / Kontrol Bekleyen / Faturaya Hazır / Sevk Edilen / Tümü.
- Bölüm ekranları (telefon/tablet öncelikli): bekleyen işler, işlemdeki işler, başlat/bitir formları, tamir ve çevirme dönüşleri, kontrol (review) akışı.
- Kumaş/bobin stoğu ve kumaş ayırma.
- Klişe kaydı ve görselleri.
- Sevk (kısmi sevk dahil) ve iş geçmişi.
- Personel/makine raporu (fire bölüm bazında kaydedilir — denetimdeki B11 düzeltmesi).
- Paketleme planı (çuval/koli kapasitesi) sipariş girişinin parçası olarak.
- Sipariş ve iş emri PDF çıktısı (atölyede basılı iş emri için; Türkçe karakterli yazı tipiyle).

**Bilerek v1'e alınmayanlar (Claude'un kararı):** üretim içgörüleri (bobin/stok analizi), Excel içe/dışa aktarma, iş uyarıları. **Sektör şablonu düzenleme ekranı kaldırıldı:** sektör özelleştirmesi müşteriye özel kurulumda kodla yapılır (§5.4); panelden şablon kopyalama yok.

## 6.1 v1'in kullanım durumu
v1 **demo ve değerlendirme** sürümüdür: Vercel + Supabase üzerinde hayali örnek veriyle çalışır. Karviyes'in canlıya geçişi, eski verinin taşınması işinden sonra ayrı bir karar olarak ele alınır. Yine de güvenlik (2FA, RLS, hız sınırı, başlıklar) demodan önce tamamlanır; VPS paketi ve geri yükleme tatbikatı canlı geçişten önce zorunludur.

## 7. Güvenlik ve işletim (denetim bulgularından)

| Denetim bulgusu | Yeni sistemde |
|---|---|
| K2 Kimlik başlığa bağlı | Better Auth oturumu; HttpOnly + Secure + SameSite=Lax çerez; dışarıdan gelen kimlik başlıkları kullanılmaz |
| 2FA yok | TOTP + yedek kodlar; yönetici ve muhasebe rollerinde zorunlu, diğerlerinde ayarla zorunlu yapılabilir |
| K1 Firmalar arası sızıntı | `company_id` + RLS + izolasyon testleri (iki firmalı test veritabanı) |
| K3 Tek JSON satırı | Normalize tablolar; kayıt bazında sürüm |
| K4 Yedek yok | Supabase günlük yedek (+ ücretli planda PITR); VPS'te şifreli `pg_dump` ayrı konuma, saklama politikası, **geri yükleme betiği ve tatbikatı** |
| K5 Float para | Kuruş `bigint`, tek money modülü |
| admin/reset ucu, sabit sahip e-postası | Yok. İlk yönetici kurulum komutuyla oluşturulur |
| Güvenlik başlıkları yok | CSP, HSTS, frame-ancestors, Referrer-Policy, Permissions-Policy (Next middleware) |
| Hız sınırı yok | Giriş, 2FA, parola sıfırlama ve yazma uçlarında hız sınırı |
| Ham hata mesajı | Kontrollü mesaj + hata kodu |
| Testler çalışmıyor | Her servis fonksiyonu testli; CI zorunlu; kritik akışlar Playwright ile |
| KVKK | Kişisel veri envanteri dosyası; aydınlatma metni şablonu; kişisel veri alanlarının listesi |

Gizli bilgiler yalnızca ortam değişkenlerinde; `.env*` git'e girmez; başlangıçta zod ile doğrulanır, eksikse uygulama açılmaz.

## 8. Dağıtım

- **Demo:** Vercel (uygulama) + Supabase (Postgres + Storage). Örnek veri betiği (Karviyes v78 için hazırlanan hayali veri: `takip-paneli/ornek-veri/veri.json`). Giriş zorunlu; demo kullanıcıları 2FA ile.
- **VPS (müşteri başına):** tek Docker image; `docker compose` ile uygulama + Postgres + yedek görevi + Caddy (otomatik TLS). Müşteri ayar dosyası: firma bilgisi, açık modüller, sektör, alan adı. Kurulum betiği: göçleri çalıştırır, ilk yöneticiyi oluşturur.
- Bir müşteriye modül eklemek: ayar dosyasında modülü aç → yeni sürümü dağıt.

## 9. Eski sistemden ne alınır

- **Alınır:** ekran akışları, alan listeleri, Türkçe metinler, iş kuralları (`lib/production.ts`, `lib/crm.ts` hesapları, `lib/sector-templates.ts`, `lib/turkey-locations.ts`, `lib/tax-offices.ts`), mevcut testlerdeki senaryolar (karakterizasyon testi olarak yeniden yazılır).
- **Alınmaz:** veri katmanı, kimlik, route'lar, ChatGPT Sites/Cloudflare bağımlılıkları, yoğun yazılmış kod (okunabilir biçimde yeniden yazılır).
- Hesap fonksiyonları (ör. bobin başına adet) **aynı girdilerle aynı sonucu** verdiğini gösteren testlerle taşınır.

## 10. Builder'a bırakılanlar

Klasör içi dosya düzeni (§5.3 iskeleti dışında), bileşen ayrıntıları, Playwright senaryolarının seçimi, Docker image ayrıntıları, hız sınırı değerleri, CSP içeriği, logo/renk uygulama biçimi, örnek veri betiğinin yapısı.
