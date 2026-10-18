# Sektör paketi: plastik poşet — ön inceleme ve karar notu

Durum: **pilot öncesi paket yazıldı** (`src/sectors/plastic-bags`, 2026-10-18). Kurulum ayarında `"sector": "plastic-bags"` ile açılır. Pilot firmanın gerçek ürün tartımlarıyla kalibrasyon ve granül stoğu hâlâ yapılacak (aşağıda "Kalanlar"). Kaynak: plastik poşet üretiminde deneyimli üretim müdürü rolündeki ajan görüşü (2026-10-18). Sayısal değerler "tipik aralık, firmaya göre değişir"; pilot firmanın gerçek verisiyle (numune tartımı) kalibre edilmeli.

## Neden hemen yapılmadı

Bez çantada iş **adet** ve **kumaş bobini** ile izlenir. Plastik poşette iş **kg** ile planlanır, maliyetlenir ve ilk aşamalarda (ekstrüzyon, baskı) kg/metre ile izlenir; adet yalnızca kesim-kaynakta ortaya çıkar. Hammadde bobin değil **granül (kg)**, ara ürün ise firmanın kendi ürettiği yarı mamul bobindir. Mevcut sektör arayüzü (adet bazlı aşama sonu alanları, bobin bazlı malzeme) bu akışı taşımaz; bunu "ince ayar" ile geçmek poşetçinin ciddiye almayacağı bir ürün çıkarır.

## Arayüzde gereken genişlemeler (`src/sectors/types.ts`)

1. **Miktar birimi:** sipariş satırında birim (adet / kg) ve fiyat birimi (TL/adet, TL/kg); `targetQuantity` hangi birimde olduğunu söyler; `calculate` adet ↔ kg çevirisini verir.
2. **Aşama sonu alanları** kg, metre ve adeti birlikte tutabilir (bugün "sağlam adet" + "fire adet"); aşamalar arası akan miktar kg olabilir; fire kg toplanır.
3. **Malzeme türleri:** `bobin` yanında `granül (kg)`, `masterbatch (kg)`; stok kg bazlı (25 kg çuval). Yarı mamul bobin iç stok kalemi.
4. **Tip bazlı alanlar:** körük yalnızca körüklü tipte, kulp yalnızca atlet/takviyelide (validate ürün tipine göre).
5. **Tolerans** (± %) ve teslim ölçüsü (kg/adet) siparişte.
6. Analiz: verim = net kg / hammadde kg, aşama bazlı fire %.

## Ürün alanları (ilk sürüm)

Zorunlu: poşet tipi, en, boy, (körüklüde) körük, kalınlık (µ), ana hammadde (LDPE/HDPE/LLDPE), miktar ve birimi, baskı renk sayısı (0 = baskısız).
Seçmeli: geri dönüşüm %, katkı (yok/oxo/bio), masterbatch rengi ve oranı, baskı yüzü, kulp/delik tipi, koli içi adet/kg, film görünümü.
İlk sürüm tipleri: atlet (T-shirt), çöp torbası (rulo), düz/körüklü ambalaj poşeti. Sonraya: takviyeli (die-cut), co-ex film, biyobozunur, mürekkep reçetesi.

## Hesap (doğrulanmalı)

- Yoğunluk: LDPE ≈ 0,92 · HDPE ≈ 0,95 · LLDPE ≈ 0,92 g/cm³ (karışımda ağırlıklı ortalama).
- Düz tüp: gram = en × boy × 2 × (µ / 10000) × yoğunluk. Körüklü: (en + körük) × 2 × boy × (µ / 10000) × yoğunluk + kaynak payı.
- Örnek: atlet 30×50 cm, HDPE, 25 µ → 7,125 g/adet; 10.000 adet ≈ 71,25 kg net; ekstrüzyon %3, baskı %5, kesim %3 fireyle hammadde ≈ 79,7 kg (+ kulp kesim firesi %10–25).
- adet → kg = adet × gram / 1000; kg → adet = kg × 1000 / gram.

## Aşamalar

Ekstrüzyon (kg, metre, fire kg, makine, vardiya) → baskı (renk sayısı 0 ise atlanır; kg/metre, fire kg) → kesim-kaynak (kg + sağlam adet, fire kg) → paketleme (koli, koli içi adet, net kg; küçük firmada kesimle birleşebilir).

## Doğrulanması gerekenler

- Plastik poşet mevzuatı (kalınlık sınırları, geri dönüşüm payı, ücretlendirme, oxo/bio kısıtları) — Resmî Gazete / Çevre, Şehircilik ve İklim Değişikliği Bakanlığı.
- Gıda ile temas eden ürünlerde Türk Gıda Kodeksi uygunluğu.
- Yoğunluk, fire ve masterbatch oranları pilot firma verisiyle.

## Önerilen yol

Bir pilot poşet üreticisi bulunduğunda: (1) arayüzü kg/birim desteğiyle genişlet (bez çanta paketi değişmeden, testleri yeşil kalarak), (2) granül stoğunu malzeme modülüne ekle, (3) `src/sectors/plastic-bags` paketini pilotun 3 gerçek ürününün tartımıyla altın testlere bağla.

## Uygulanan (2026-10-18)

- Ürün alanları: tip (atlet, düz, körüklü, çöp torbası), en, boy, körük (yalnız körüklüde), kalınlık µ, hammadde (HDPE/LDPE/LLDPE), film rengi, baskı renk sayısı ve renkleri, miktar birimi (adet/kg), miktar, tolerans %, koli içi adet.
- Hesap: gram/adet, kg siparişte adet hedefi, net kg, fireli hammadde kg (ekstrüzyon %3, baskı %5, kesim %3), tolerans adedi. Belgedeki örnek (atlet 30×50, HDPE, 25 µ → 7,125 g; 10.000 adet → 71,25 kg net, ≈ 79,7 kg hammadde) altın testte.
- Akış: Ekstrüzyon → (baskı renk sayısı > 0 ise) Baskı → Kesim-Kaynak → Paketleme → kontrol → sevk; Ayıklama (tamir yuvası). Aşama sonunda kg, fire kg, metre ve sağlam adet; raporda fire kg sütunu.
- Rol adları sektöre göre (Dilimleme yuvası "Ekstrüzyon", Kesim "Kesim-Kaynak", Bitiş "Paketleme", Tamir "Ayıklama").
- Malzeme ayırması olmayan üründe iş doğrudan ilk aşamaya gönderilir.

## Kalanlar

- Granül/masterbatch stoğu (kg, 25 kg çuval) ve sipariş başına hammadde ihtiyacı.
- TL/kg fiyatlandırma (şu an sipariş satırı birim fiyatı adet başınadır; kg siparişte adede çevrilir).
- Atlet kulp kesim firesi, co-ex, biyobozunur; mevzuat ve gıda temas kontrolleri.
- Pilot firmanın 3 ürününün tartımıyla yoğunluk ve fire oranlarının kalibrasyonu.
