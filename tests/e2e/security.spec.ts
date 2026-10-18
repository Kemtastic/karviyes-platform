import { expect, test } from '@playwright/test';

test.describe('güvenlik', () => {
  test('oturumsuz kullanıcı korunan sayfadan girişe yönlendirilir', async ({ page }) => {
    await page.goto('/siparisler');
    await expect(page).toHaveURL(/\/giris$/);
  });

  test('oturumsuz API isteği 401', async ({ request }) => {
    const r = await request.get('/api/files/00000000-0000-0000-0000-000000000000', { maxRedirects: 0 });
    expect(r.status()).toBe(401);
  });

  test('herkese açık kayıt kapalı', async ({ request }) => {
    const r = await request.post('/api/auth/sign-up/email', { data: { email: 'saldirgan@example.com', password: 'GucluParola-2026!', name: 'X' }, headers: { origin: 'http://localhost:3100' } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('sayfalar çerçeve içine alınamaz ve CSP taşır', async ({ request }) => {
    const r = await request.get('/giris');
    const csp = r.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(r.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('başka sitenin formundan gönderim reddedilir', async ({ request }) => {
    const r = await request.post('/api/files', { headers: { origin: 'https://kotu-site.example', cookie: 'better-auth.session_token=sahte' }, multipart: { file: { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) } } });
    expect(r.status()).toBe(403);
  });
});
