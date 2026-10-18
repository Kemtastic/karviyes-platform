// Geliştirme yardımcısı: yerel sunucuda giriş yapıp sayfaların ekran görüntüsünü alır (tasarım incelemesi).
// Kullanım: node scripts/dev/ekran-goruntusu.mjs <çıktı-klasörü> <parola-dosyası> <yol1> [yol2 ...]   (yol önüne "m:" yazılırsa telefon boyutu)
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const [out, pwFile, ...paths] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const base = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
const page = await ctx.newPage();
await page.goto(base + '/giris');
if (paths.includes('/giris')) await page.screenshot({ path: `${out}/giris.png` });
await page.getByLabel('E-posta').fill(process.env.DEMO_EMAIL ?? 'demo@karviyes.local');
await page.getByLabel('Parola').fill(readFileSync(pwFile, 'utf8').trim());
await page.getByRole('button', { name: 'Giriş yap' }).click();
await page.waitForURL((u) => !u.pathname.startsWith('/giris'), { timeout: 60000 });
for (const raw of paths) {
  if (raw === '/giris') continue;
  const mobile = raw.startsWith('m:');
  const path = mobile ? raw.slice(2) : raw;
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.goto(base + path, { waitUntil: 'networkidle', timeout: 90000 });
  const name = (mobile ? 'm_' : '') + (path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'ana');
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log('ok', name);
}
await browser.close();
