import { expect, test, type Page } from '@playwright/test';
import { generateSync } from 'otplib';
import { E2E_ADMIN } from './env';

// Tek bir uzun akış: her adım bir öncekinin verisine dayanır.
test.describe.configure({ mode: 'serial' });

let secret = '';

async function login(page: Page) {
  await page.goto('/giris');
  await page.getByLabel('E-posta').fill(E2E_ADMIN.email);
  await page.getByLabel('Parola').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  if (secret) {
    await page.waitForURL('**/iki-adim');
    await page.getByLabel('Doğrulama kodu').fill(generateSync({ secret }));
    await page.getByRole('button', { name: 'Doğrula' }).click();
    await page.waitForURL((u) => u.pathname === '/');
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

  // Alacaklar → cari hesap
  await page.goto('/siparisler/alacaklar');
  await page.getByRole('cell', { name: 'E2E Gıda Ltd. Şti.' }).click();
  await expect(page.getByRole('heading', { name: 'Cari hesap' })).toBeVisible();

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
