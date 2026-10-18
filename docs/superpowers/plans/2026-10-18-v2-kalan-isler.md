# v2 — kalan işler planı

> Yürütme: Claude (yönetici + geliştirici + test). Kullanıcı 18.10.2026 akşamı onay beklemeden ilerleme ve GitHub'a (main + v1.1) push izni verdi. Her faz: TDD → typecheck/lint → birim + e2e → commit → push.

**Amaç:** Tasarım belgesinin (`docs/superpowers/specs/2026-10-18-moduler-uretim-platformu-design.md`) "sonraki sürümler" listesini ve eski Karviyes'te olup yeni platformda olmayan işleri kapatmak.

**Kaynak:** eski sistem `Karviyes-Tum-Proje-v78/kaynak-kod` (lib/finance*, lib/reconciliation*, lib/job-alerts, lib/production-insights, app/faturalama, app/mutabakat). Kod kopyalanmaz; iş kuralları alınır.

## Global kurallar

- Para kuruş `bigint`, tek money modülü; float yok. Kesinleşmiş kayıt silinmez, düzeltme kaydıyla değişir.
- Her tablo `company_id` + RLS (`SELECT app_secure_tables()` göçün sonunda), firmalar arası FK'ler `(company_id, id)`.
- Tüm yazmalar `defineAction` ile; her yazma audit'e düşer.
- Arayüz Türkçe, mevcut tasarım sistemi (`src/ui`): PageHeader, Card, Badge, DataTable (telefonda kart), FilterBar.
- Sipariş bakiyesi yasal cari değildir; fatura entegratör kararı (I17) gelene kadar sistem fatura **kesmez**.

## Fazlar

### F1 — Ön muhasebe modülü (`finance`)
Kasa/banka hesapları, tahsilat ve ödemeler (cari bazlı), masraflar, çek/senet portföyü, cari hareket ekstresi ve vade/yaşlandırma raporu. Sipariş tahsilatları cari ekstresinde görünür. Yeni rol: `accounting` (Muhasebe, 2FA zorunlu).

### F2 — Cari mutabakat modülü (`reconciliation`)
Belirli tarihteki cari bakiye için mutabakat talebi; karşı tarafa tek kullanımlık, süreli, tahmin edilemez bağlantı; karşı taraf giriş yapmadan onaylar ya da itiraz eder (not + farklı bakiye); PDF mutabakat mektubu; durum takibi.

### F3 — Üretim uyarıları ve içgörüler
Ana sayfada uyarılar (uzun süre aynı aşamada bekleyen iş, kumaş bekleyen iş, teslim tarihi yaklaşan/geçen sipariş, kontrol bekleyen); siparişe teslim tarihi; bobin/stok özeti.

### F4 — Plastik poşet sektör paketi (pilot öncesi)
`docs/sektor-plastik-poset.md`'deki hesaplar; kg birimi, ekstrüzyon aşaması, granül malzemesi. Bez çanta paketi ve testleri değişmeden kalır. Pilot firma verisiyle kalibrasyon ayrı iş (I18).

### F5 — e-Fatura hazırlığı
Entegratör adaptör arayüzü ve fatura taslağı (yalnız taslak; resmî belge entegratörle). Entegratör seçimi kullanıcı kararı (I17).

### F6 — Kapanış
Bağımsız kod incelemesi (alt ajan), güvenlik kontrolü, örnek veriye yeni modüller, belgeler, takip paneli, push.

## Kayıt (ilerleme ve kararlar)

- **F1 bitti** (566614a): `finance` modülü, göç 0025, Muhasebe rolü (2FA varsayılan listesinde). 26 servis + 8 hesap testi, e2e.
  - Ruling: Fatura **kesilmez**, kaydedilir (mali müşavir görüşü, I17) — maliyet: entegratör gelince taslak→resmî akış eklenecek.
  - Ruling: Sipariş tahsilatları (orders modülü) ile ön muhasebe tahsilatları ayrı kayıt; cari bakiye yalnız ön muhasebeden — maliyet: aynı tahsilat iki ekrana girilebilir; sonraki adımda "siparişe de işle" bağlantısı.
  - Ruling: Stok/ürün kartı, irsaliye, personel cari, tekrarlayan fatura, UBL içe aktarma eski sistemde vardı; ilk sürüme alınmadı (üretim stoğu zaten ayrı) — maliyet: muhasebeci isterse ek faz.
- **F2 bitti**: mutabakat ön muhasebe modülünün parçası (ayrı modül değil), göç 0026; bağlantı firma~kayıt~256 bit anahtar, yalnız SHA-256 özeti saklanır, 30 gün; karşı taraf oturumsuz cevaplar (bir kez), PDF mektup + ekstre. 5 servis testi + e2e.
  - Ruling: E-posta gönderilemezse bağlantı yine verilir (kopyala-ilet) — maliyet: yok.
- **F1b bitti** (08c367a): ön muhasebe tahsilatı isteğe bağlı olarak siparişe de işlenir (sipariş modülünün `server/api.ts` açık arayüzüyle, aynı işlemde); hareket iptalinde sipariş tarafına düzeltme. Göç 0027.
- **F3 bitti**: siparişe teslim tarihi (göç 0028, üretim sürerken değiştirilebilir), ana sayfada uyarılar (geciken/yaklaşan teslim, 3+ gün hareketsiz iş, 2+ gün kumaş bekleyen iş), bölüm ekranında yeni iş şeridi ve isteğe bağlı sesli uyarı (cihazda saklanır), Üretim İçgörüleri sayfası (bobin durumu, ölçü başına satış ve bobin başı satış, sevk bekleyen mamul ve değeri).
  - Ruling: Uyarı eşikleri (3 gün hareketsiz, 2 gün kumaş, 3 gün teslim) sabit; firmaya göre ayar sonra — maliyet: firma farklı eşik isterse kurulum ayarına taşınır.
- **Canlı göç düzeltmesi** (cc78362): Vercel derlemesi önce göçleri uygular (`vercel-build`); başarısızsa eski sürüm yayında kalır. Derleme başarılı, sağlık kontrolü `{ok,db,config}` true.
- **F4 bitti**: `plastic-bags` sektör paketi (pilot öncesi), üretimde kg/fire kg alanları, malzemesiz üründe ayırma adımı yok, sektöre göre rol adları (kabuk bağlamı), sipariş formunda sektörün varsayılanları ve hesap özeti. Altın test + uçtan uca servis testi.
  - Ruling: Plastikte fiyat adet başına (TL/kg yok) — maliyet: poşetçi kg fiyatı ister; sipariş modülünde fiyat birimi eklenmeli.
  - Ruling: Granül stoğu yok; `materials()` boş — maliyet: hammadde açığı uyarısı yok, pilotla eklenecek.
- **F5 bitti (karar beklemeyen kısmı)**: siparişte "Fatura kesildi" ön muhasebe açıksa aynı işlemde cariye satış faturası işler (`recordOrderInvoice`, matrah/KDV sipariş satırlarından). Entegratör tasarım notu: `docs/e-fatura-entegrasyonu.md`.
  - Ruling: Entegratör seçilmeden sağlayıcı arayüzü kodu yazılmadı (kullanılmayan kod olurdu) — maliyet: yok; seçim gelince eklenir.

