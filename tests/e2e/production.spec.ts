import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { generateSync } from 'otplib';
import { E2E_ADMIN } from './env';

// Tek bir uzun akış: her adım bir öncekinin verisine dayanır.
test.describe.configure({ mode: 'serial' });

let secret = '';
// Giriş hız sınırına (dakikada 5) takılmamak için 2FA'lı ilk tam girişten sonra oturum çerezleri yeniden kullanılır.
let session: Awaited<ReturnType<BrowserContext['cookies']>> = [];

async function login(page: Page) {
  if (session.length) {
    await page.context().addCookies(session);
    return;
  }
  await page.goto('/giris');
  await page.getByLabel('E-posta').fill(E2E_ADMIN.email);
  await page.getByLabel('Parola').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  if (secret) {
    await page.waitForURL('**/iki-adim');
    await page.getByLabel('Doğrulama kodu').fill(generateSync({ secret }));
    await page.getByRole('button', { name: 'Doğrula' }).click();
    await page.waitForURL((u) => u.pathname === '/');
    session = await page.context().cookies();
  }
}

test('yönetici girişte 2FA kurmaya zorlanır ve kurar', async ({ page }) => {
  await login(page);
  await page.waitForURL('**/iki-adim-kurulum');
  await page.getByLabel('Parola').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Devam' }).click();
  secret = (await page.getByTestId('totp-secret').textContent())?.trim() ?? '';
  expect(secret).toMatch(/^[A-Z2-7]+$/);
  await page.getByLabel('Doğrulama kodu').fill(generateSync({ secret }));
  await page.getByRole('button', { name: 'Doğrula ve bitir' }).click();
  await expect(page.getByRole('heading', { name: /Hoş geldiniz/ })).toBeVisible();
});

test('sipariş → üretim → kesim (telefon) → kesim bitiş → kontrol → sevk', async ({ page }) => {
  await login(page);

  // Personel
  for (const [name, kind, deps] of [['Ayşe Satış', 'Satışçı', ['Satış']], ['Emre Usta', 'Usta', ['Kesim', 'Bitiş']]] as const) {
    await page.goto('/ayarlar/personel');
    await page.getByRole('button', { name: 'Personel ekle' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Ad soyad').fill(name);
    await dialog.getByLabel('Görev').selectOption({ label: kind });
    for (const d of deps) await dialog.getByLabel(d, { exact: true }).check();
    await dialog.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByRole('cell', { name })).toBeVisible();
  }

  // Cari
  await page.goto('/cariler');
  await page.getByRole('button', { name: 'Yeni cari' }).click();
  await page.getByRole('dialog').getByLabel('Ünvan / ad soyad').fill('E2E Gıda Ltd. Şti.');
  await page.getByRole('dialog').getByRole('button', { name: 'Cariyi oluştur' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Gıda Ltd. Şti.' })).toBeVisible();

  // Sipariş (baskısız, 1 bobin, 45×45)
  await page.goto('/siparisler/yeni');
  await page.getByRole('combobox', { name: 'Müşteri' }).fill('E2E');
  await page.getByRole('option').getByText('E2E Gıda Ltd. Şti.').click();
  await page.getByLabel('Satış yapan').selectOption({ label: 'Ayşe Satış' });
  await page.getByLabel('En (cm)').fill('45');
  await page.getByLabel('Boy (cm)').fill('45');
  await page.getByLabel('Gramaj (gr/m²)').fill('70');
  await page.getByLabel('Bobin sayısı').fill('1');
  await page.getByLabel('Baskısız').check();
  await page.getByLabel('Birim fiyat').fill('4');
  await expect(page.getByText('Hedef: 2.222 adet')).toBeVisible();
  await page.getByRole('button', { name: 'Siparişi kaydet' }).click();
  await page.waitForURL(/\/siparisler\/[0-9a-f-]{36}$/);
  await expect(page.getByText('9.776,80 ₺').first()).toBeVisible();

  // Taslak sipariş düzenlenir: fiyat 4 → 5
  const orderUrl = page.url();
  await page.getByRole('link', { name: 'Düzenle' }).click();
  await expect(page.getByLabel('Birim fiyat')).toHaveValue('4');
  await expect(page.getByLabel('En (cm)')).toHaveValue('45');
  await page.getByLabel('Birim fiyat').fill('5');
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await page.waitForURL(orderUrl);
  await expect(page.getByText('12.221,00 ₺').first()).toBeVisible(); // toplam ve kalan (peşinat yok)

  // Sipariş bakiyeleri → cari kartı
  await page.goto('/siparisler/alacaklar');
  await page.getByRole('cell', { name: 'E2E Gıda Ltd. Şti.' }).click();
  await expect(page.getByRole('heading', { name: 'Sipariş bakiyesi' })).toBeVisible();

  // Excel'e aktar (CSV, BOM'lu)
  const csv = await page.request.get('/api/disa-aktar/siparisler');
  expect(csv.headers()['content-type']).toContain('text/csv');
  expect((await csv.text()).split(String.fromCharCode(13, 10))[1]).toContain('E2E Gıda Ltd. Şti.');
  await expect(page.getByText('12.221,00 ₺').first()).toBeVisible();

  // Kumaş stoğu
  await page.goto('/uretim/kumas');
  await page.getByRole('button', { name: 'Bobin ekle' }).click();
  await page.getByRole('dialog').getByLabel('En (cm)').fill('100');
  await page.getByRole('dialog').getByRole('button', { name: 'Ekle' }).click();
  await expect(page.getByText('Stokta 1 bobin')).toBeVisible();

  // Üretime al → kumaş ayır → kesime gönder
  await page.goto('/uretim?sekme=orders');
  await page.getByRole('button', { name: 'Üretime al' }).click();
  await page.waitForURL(/\/uretim\/is\/[0-9a-f-]{36}$/);
  const jobUrl = page.url();
  await page.getByRole('checkbox', { name: /Beyaz · 100 cm/ }).check();
  await page.getByRole('button', { name: 'Seçilen bobinleri ayır' }).click();
  await page.getByRole('button', { name: 'Kesim bölümüne gönder' }).click();
  await expect(page.getByRole('button', { name: 'Kesim: İşe başla' })).toBeVisible();

  // Kesim bölüm ekranı telefonda
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/uretim/bolum/cutting');
  await page.getByRole('button', { name: /E2E Gıda/ }).click();
  const start = page.getByRole('button', { name: 'Kesim: İşe başla' });
  await expect(start).toBeInViewport();
  await page.getByLabel('Makine').fill('Kesim 1');
  await page.getByRole('checkbox', { name: 'Emre Usta' }).check();
  await start.click();
  await page.getByRole('tab', { name: /İşlemdeki İşler/ }).click();
  await page.getByRole('button', { name: /E2E Gıda/ }).click();
  await page.getByLabel('Sağlam adet').fill('2200');
  await page.getByRole('button', { name: 'Kesim: Bitir' }).click();
  await expect(page.getByText('İş yok.')).toBeVisible();

  // Kesim bitiş (masaüstü, iş kartından)
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(jobUrl);
  await page.getByRole('button', { name: 'Kesim Bitiş: İşe başla' }).click();
  await page.getByLabel('Sağlam adet').fill('2180');
  await page.getByRole('button', { name: 'Kesim Bitiş: Bitir' }).click();

  // Kontrol ve sevk
  await page.getByRole('button', { name: 'Onayla — faturaya hazır' }).click();
  await page.getByLabel('Adet').fill('1000');
  await page.getByRole('button', { name: 'Sevk et' }).click();
  await expect(page.getByText('Sevk edilebilir: 1.180 adet')).toBeVisible();

  // İş emri PDF (fiyatsız) ve rapor
  const jobId = jobUrl.split('/').pop();
  const pdf = await page.request.get(`/api/pdf/is-emri/${jobId}`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await page.goto('/uretim/raporlar');
  await expect(page.getByRole('cell', { name: 'Emre Usta' }).first()).toBeVisible();

  // Sipariş durumu
  await page.goto('/siparisler?durum=ready_to_invoice');
  await expect(page.getByRole('cell', { name: 'E2E Gıda Ltd. Şti.' })).toBeVisible();
  await page.getByRole('cell', { name: 'E2E Gıda Ltd. Şti.' }).click();
  const orderPdf = await page.request.get(page.url().replace('/siparisler/', '/api/pdf/siparis/'));
  expect(orderPdf.status()).toBe(200);
});

test('iki ürünlü sipariş: satır başına tutar, toplam ve ürün tablosu', async ({ page }) => {
  await login(page);
  await page.goto('/siparisler/yeni');
  await page.getByRole('combobox', { name: 'Müşteri' }).fill('E2E');
  await page.getByRole('option').getByText('E2E Gıda Ltd. Şti.').click();
  await page.getByLabel('Satış yapan').selectOption({ label: 'Ayşe Satış' });
  const fillLine = async (region: string, w: string, h: string, price: string, qty?: string) => {
    const r = page.getByRole('region', { name: region });
    await r.getByLabel('En (cm)').fill(w);
    await r.getByLabel('Boy (cm)').fill(h);
    await r.getByLabel('Gramaj (gr/m²)').fill('70');
    await r.getByLabel('Bobin sayısı').fill('1');
    await r.getByLabel('Baskısız').check();
    if (qty) await r.getByLabel('Adet', { exact: true }).fill(qty);
    await r.getByLabel('Birim fiyat').fill(price);
  };
  await fillLine('Ürün', '45', '45', '5');
  await page.getByRole('button', { name: 'Ürün ekle' }).click();
  await fillLine('Ürün 2', '30', '40', '3', '500');
  // 2222 × 5 + %10 = 12.221,00 · 500 × 3 + %10 = 1.650,00
  await expect(page.getByText('13.871,00 ₺')).toBeVisible();
  await page.getByRole('button', { name: 'Siparişi kaydet' }).click();
  await page.waitForURL(/\/siparisler\/[0-9a-f-]{36}$/);
  const rows = page.getByRole('region', { name: 'Ürünler' }).getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(page.getByText('13.871,00 ₺').first()).toBeVisible();
});

test('satış takibi: görüşme kaydı, planlanan listesi ve cari kartında geçmiş', async ({ page }) => {
  await login(page);
  await page.goto('/satis?gorunum=all');
  await page.getByRole('row', { name: /E2E Gıda Ltd\. Şti\./ }).getByRole('button', { name: 'Görüşme ekle' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Görüşme notu').fill('Yeni sezon fiyatı istedi');
  await dialog.getByRole('button', { name: 'Yarın' }).click();
  await dialog.getByRole('button', { name: 'Görüşmeyi kaydet' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('link', { name: 'Planlanan' }).click();
  await expect(page.getByRole('row', { name: /E2E Gıda Ltd\. Şti\./ })).toBeVisible();
  await page.getByRole('link', { name: 'E2E Gıda Ltd. Şti.' }).click();
  await expect(page.getByRole('region', { name: 'Satış takibi' }).getByText('Yeni sezon fiyatı istedi')).toBeVisible();
});

test('sipariş arama ve son siparişten ürünleri getirme', async ({ page }) => {
  await login(page);
  await page.goto('/siparisler');
  await page.getByLabel('Ara').fill('e2e gida');
  await page.getByRole('button', { name: 'Süz' }).click();
  await expect(page.getByRole('cell', { name: 'E2E Gıda Ltd. Şti.' }).first()).toBeVisible();
  await page.getByLabel('Ara').fill('yok-boyle-musteri');
  await page.getByRole('button', { name: 'Süz' }).click();
  await expect(page.getByText('Bu durumda sipariş yok.')).toBeVisible();

  await page.goto('/siparisler/yeni');
  await page.getByRole('combobox', { name: 'Müşteri' }).fill('E2E');
  await page.getByRole('option').getByText('E2E Gıda Ltd. Şti.').click();
  await page.getByRole('button', { name: 'Son siparişten ürünleri getir' }).click();
  await expect(page.getByRole('status')).toContainText('ürünleri getirildi');
  // Son sipariş iki ürünlüydü (45 ve 30 cm).
  await expect(page.getByRole('region', { name: 'Ürün 2' }).getByLabel('En (cm)')).toHaveValue('30');
});

test('satış raporu: satışçı ve ürün kırılımı', async ({ page }) => {
  await login(page);
  await page.goto('/siparisler/raporlar');
  await expect(page.getByRole('cell', { name: 'Ayşe Satış' })).toBeVisible();
  await page.getByRole('link', { name: 'Ürün', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Ort. birim fiyat' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /^45×45 cm/ }).first()).toBeVisible();
});

test('ana sayfa özet kartları', async ({ page }) => {
  await login(page);
  await page.goto('/');
  const summary = page.getByRole('region', { name: 'Özet' });
  await expect(summary.getByText('Faturaya hazır')).toBeVisible();
  await expect(summary.getByText('Bugün aranacak')).toBeVisible();
  await expect(summary.getByText('Açık sipariş bakiyesi')).toBeVisible();
});
