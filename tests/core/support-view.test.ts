import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db';
import { createAuth, createUserWithPassword, type Auth } from '@/core/auth/auth';
import { auditLog, platformAdmins, platformAudit, platformViews, user } from '@/core/db/schema';
import { withCompany } from '@/core/db/scope';
import type { PlatformAdmin, PlatformRuntime } from '@/core/platform/action';
import { endSupportView, resolveSupportView, startSupportView, SUPPORT_COOKIE } from '@/core/platform/support';
import { createParty, searchParties } from '@/core/parties/service';
import { runtime } from '../helpers/runtime';

let t: TestDb;
let auth: Auth;
let admin: PlatformAdmin;
let cookie: string;
const rt = (a: PlatformAdmin | null = admin): PlatformRuntime => ({ admin: a, db: t.db, batch: true });

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

async function signIn(email: string): Promise<string> {
  const res = await auth.handler(new Request('http://localhost:3000/api/auth/sign-in/email', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', 'x-forwarded-for': '10.7.0.1' },
    body: JSON.stringify({ email, password: 'GucluParola-2026!' }),
  }));
  return (res.headers.get('set-cookie') ?? '').split(';')[0]!;
}
const withView = (id: string) => new Headers({ cookie: `${cookie}; ${SUPPORT_COOKIE}=${id}` });

beforeAll(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { secret: 's'.repeat(32), baseURL: 'http://localhost:3000', issuer: 'Test' });
  const u = await createUserWithPassword(auth, { email: 'kurucu@example.com', name: 'Kurucu', password: 'GucluParola-2026!' });
  await createUserWithPassword(auth, { email: 'baska@example.com', name: 'Başka', password: 'GucluParola-2026!' });
  cookie = await signIn('kurucu@example.com');
  // 2FA giriş akışı burada sınanmıyor; oturum açıldıktan sonra hesap 2FA'lı sayılır.
  await t.db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, u.id));
  await t.db.insert(platformAdmins).values({ userId: u.id, createdBy: 'kurulum' });
  admin = { userId: u.id, email: 'kurucu@example.com', name: 'Kurucu', twoFactorEnabled: true };
});
afterAll(async () => { await t.close(); });

describe('müşteri gözüyle bakış', () => {
  it('gerekçe ister; başlayınca firma denetim kaydına ve panel kaydına yazılır', async () => {
    expect(await startSupportView({ companyId: t.companyA, role: 'admin', minutes: 30, reason: 'kısa' }, rt())).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    const v = ok(await startSupportView({ companyId: t.companyA, role: 'sales', minutes: 30, reason: 'Satış ekranındaki hata bildirimi' }, rt()));
    const audit = await withCompany(t.companyA, (tx) => tx.select().from(auditLog), t.db);
    expect(audit.some((a) => a.action === 'platform.startSupportView' && (a.after as { reason?: string }).reason === 'Satış ekranındaki hata bildirimi')).toBe(true);
    expect((await t.db.select().from(platformAudit)).some((a) => a.action === 'platform.startSupportView')).toBe(true);

    const viewer = await resolveSupportView(auth, t.db, withView(v.id));
    expect(viewer).toMatchObject({ companyId: t.companyA, roles: ['sales'], readOnly: true, userId: admin.userId });
  });

  it('salt okunur kullanıcı hiçbir eylemi çalıştıramaz', async () => {
    const v = ok(await startSupportView({ companyId: t.companyA, role: 'admin', minutes: 15, reason: 'Cari kartı kontrolü için' }, rt()));
    const viewer = (await resolveSupportView(auth, t.db, withView(v.id)))!;
    const r = await createParty({ name: 'Destek Denemesi', kind: 'customer' }, { ...runtime(t, viewer) });
    expect(r).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    // Okuma ekranları açılır (bakışın amacı bu).
    expect(await searchParties({ q: '' }, { ...runtime(t, viewer) })).toMatchObject({ ok: true });
  });

  it('süresi geçen, bitirilen, başkasına ait ya da bozuk kimlikli bakış açılmaz', async () => {
    const v = ok(await startSupportView({ companyId: t.companyB, role: 'admin', minutes: 15, reason: 'Fatura ekranı inceleme' }, rt()));
    expect(await resolveSupportView(auth, t.db, withView(v.id), new Date(Date.now() + 16 * 60_000))).toBeNull();
    expect(await resolveSupportView(auth, t.db, withView('bozuk'))).toBeNull();
    expect(await resolveSupportView(auth, t.db, new Headers({ cookie: `${await signIn('baska@example.com')}; ${SUPPORT_COOKIE}=${v.id}` }))).toBeNull();
    ok(await endSupportView({ id: v.id }, rt()));
    expect(await resolveSupportView(auth, t.db, withView(v.id))).toBeNull();
    const [row] = await t.db.select().from(platformViews).where(eq(platformViews.id, v.id));
    expect(row?.endedAt).not.toBeNull();
  });

  it('panel yetkisi kaldırılan yöneticinin açık bakışı geçersiz olur', async () => {
    const v = ok(await startSupportView({ companyId: t.companyA, role: 'admin', minutes: 15, reason: 'Yetki kaldırma denemesi' }, rt()));
    await t.db.delete(platformAdmins).where(eq(platformAdmins.userId, admin.userId));
    expect(await resolveSupportView(auth, t.db, withView(v.id))).toBeNull();
    await t.db.insert(platformAdmins).values({ userId: admin.userId, createdBy: 'kurulum' });
  });
});
