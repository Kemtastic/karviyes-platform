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

- (fazlar bittikçe buraya eklenir)
