import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { createAuth, createUserWithPassword, type Auth } from '@/core/auth/auth';

let t: TestDb;
let auth: Auth;
const base = 'http://localhost:3000/api/auth';
const post = (path: string, body: unknown, ip = '10.0.0.1') =>
  auth.handler(new Request(base + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', 'x-forwarded-for': ip }, body: JSON.stringify(body) }));

beforeAll(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { secret: 's'.repeat(32), baseURL: 'http://localhost:3000', issuer: 'Test Firma' });
  await createUserWithPassword(auth, { email: 'yonetici@example.com', name: 'Yönetici', password: 'GucluParola-2026!' });
});
afterAll(async () => { await t.close(); });

describe('giriş', () => {
  it('herkese açık kayıt kapalıdır', async () => {
    const res = await post('/sign-up/email', { email: 'yeni@example.com', password: 'GucluParola-2026!', name: 'Yeni' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('doğru parolayla giriş oturum çerezi verir', async () => {
    const res = await post('/sign-in/email', { email: 'yonetici@example.com', password: 'GucluParola-2026!' }, '10.0.0.2');
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/session_token/);
  });

  it('aynı adresten 6. hatalı deneme hız sınırına takılır', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await post('/sign-in/email', { email: 'yonetici@example.com', password: 'yanlis-parola-xx' }, '10.0.0.3')).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it('12 karakterden kısa parolayla kullanıcı oluşturulamaz', async () => {
    await expect(createUserWithPassword(auth, { email: 'kisa@example.com', name: 'Kısa', password: 'kisa' })).rejects.toThrow(/12/);
  });
});
