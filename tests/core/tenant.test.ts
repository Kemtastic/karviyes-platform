import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db';
import { createAuth, type Auth } from '@/core/auth/auth';
import { resolveCurrentUser } from '@/core/auth/session';
import { loadCompanyConfig } from '@/core/company/config';
import { clearTenantCache, companyIdForHost, companyOrigins, normalizeHost } from '@/core/company/tenant';
import { companies, invites, platformAdmins, user } from '@/core/db/schema';
import { withCompany } from '@/core/db/scope';
import type { PlatformAdmin, PlatformRuntime } from '@/core/platform/action';
import { createCompany } from '@/core/platform/companies';
import { acceptInvite } from '@/core/users/service';

let t: TestDb;
let auth: Auth;
const admin: PlatformAdmin = { userId: 'kurucu', email: 'kurucu@example.com', name: 'Kurucu', twoFactorEnabled: true };
const rt = (): PlatformRuntime => ({ admin, db: t.db, batch: true });

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

beforeAll(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { secret: 's'.repeat(32), baseURL: 'http://localhost:3000', issuer: 'Test' });
  await t.db.insert(user).values({ id: 'kurucu', name: 'Kurucu', email: 'kurucu@example.com', emailVerified: true, twoFactorEnabled: true });
  await t.db.insert(platformAdmins).values({ userId: 'kurucu', createdBy: 'kurulum' });
});
beforeEach(() => clearTenantCache());
afterAll(async () => { await t.close(); });

describe('adresle firma seçimi', () => {
  it('adres normalleştirilir', () => {
    expect(normalizeHost('Plastik.Kemalayan.com:443')).toBe('plastik.kemalayan.com');
    expect(normalizeHost('a.example.com, proxy.local')).toBe('a.example.com');
  });

  it('kayıtlı adres o firmayı, bilinmeyen adres kurulumun firmasını verir', async () => {
    await t.db.update(companies).set({ host: 'b.example.com' }).where(eq(companies.id, t.companyB));
    expect(await companyIdForHost(t.db, 'B.example.com', 'firma-a')).toBe(t.companyB);
    expect(await companyIdForHost(t.db, 'localhost:3000', 'firma-a')).toBe(t.companyA);
    expect(await companyOrigins(t.db)).toContain('https://b.example.com');
  });
});

describe('panelden firma açma', () => {
  it('firma, ayarları ve ilk yönetici daveti oluşur; davet kabul edilince kullanıcı yalnız o firmaya girer', async () => {
    const r = ok(await createCompany({ name: 'Plastik Ambalaj A.Ş.', slug: 'plastik', host: 'plastik.example.com', sector: 'plastic-bags', modules: ['orders', 'production'], adminName: 'Poşet Yönetici', adminEmail: 'yonetici@plastik.example.com' }, rt()));
    expect(r.inviteLink).toMatch(/^https:\/\/plastik\.example\.com\/davet\//);
    expect(await loadCompanyConfig(t.db, r.companyId)).toMatchObject({ sector: 'plastic-bags', modules: ['orders', 'production'] });
    expect(await companyIdForHost(t.db, 'plastik.example.com', 'firma-a')).toBe(r.companyId);

    const token = r.inviteLink.split('/davet/')[1]!;
    ok(await acceptInvite({ token, password: 'GucluParola-2026!' }, { auth, db: t.db, companyId: r.companyId }));
    const res = await auth.handler(new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', 'x-forwarded-for': '10.9.0.1' },
      body: JSON.stringify({ email: 'yonetici@plastik.example.com', password: 'GucluParola-2026!' }),
    }));
    const headers = new Headers({ cookie: (res.headers.get('set-cookie') ?? '').split(';')[0]! });
    expect(await resolveCurrentUser(auth, t.db, r.companyId, headers)).toMatchObject({ roles: ['admin'], companyId: r.companyId });
    expect(await resolveCurrentUser(auth, t.db, t.companyA, headers)).toBeNull();
    const [inv] = await withCompany(r.companyId, (tx) => tx.select().from(invites), t.db);
    expect(inv?.usedAt).not.toBeNull();
  });

  it('aynı kısa ad ya da adres ikinci kez kullanılamaz; bağımlılık ve biçim denetlenir', async () => {
    const base = { name: 'Başka Firma', slug: 'baska', host: '', sector: 'bags', modules: ['orders'] as string[], adminName: 'Yönetici', adminEmail: 'y@example.com' };
    expect(await createCompany({ ...base, slug: 'plastik' }, rt())).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await createCompany({ ...base, host: 'plastik.example.com' }, rt())).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(await createCompany({ ...base, modules: ['production'] }, rt())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await createCompany({ ...base, slug: 'Büyük Harf' }, rt())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await createCompany(base, { ...rt(), admin: null })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('firmaya ayrı veritabanı', () => {
  it('bağlantı adresi şifreli saklanır; bozulmuş şifre açılmaz', async () => {
    process.env.PLATFORM_SECRET = 'p'.repeat(40);
    const { encryptUrl, decryptUrl } = await import('@/core/db/router');
    const enc = encryptUrl('postgres://kullanici:gizli@host/db');
    expect(enc).not.toContain('gizli');
    expect(decryptUrl(enc)).toBe('postgres://kullanici:gizli@host/db');
    expect(() => decryptUrl(enc.slice(0, -2) + 'AA')).toThrow();
    // PLATFORM_SECRET sonradan eklense de oturum anahtarıyla şifrelenmiş adres açılır.
    const saved = process.env.PLATFORM_SECRET;
    delete process.env.PLATFORM_SECRET;
    process.env.BETTER_AUTH_SECRET ??= 'b'.repeat(40);
    const old = encryptUrl('postgres://eski@host/db');
    process.env.PLATFORM_SECRET = saved;
    expect(decryptUrl(old)).toBe('postgres://eski@host/db');
  });

  it('firma ayrı veritabanında açılır: ayarlar, davet ve üyelik orada; ana veritabanında iş verisi yok', async () => {
    process.env.PLATFORM_SECRET = 'p'.repeat(40);
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { connectDb } = await import('@/core/db/client');
    const { dataDbFor } = await import('@/core/db/router');
    const url = `pglite://${join(mkdtempSync(join(tmpdir(), 'firma-db-')), 'veri')}`;
    const r = ok(await createCompany({ name: 'Ayrı Veri A.Ş.', slug: 'ayri', host: 'ayri.example.com', sector: 'bags', modules: ['orders'], adminName: 'Ayrı Yönetici', adminEmail: 'yonetici@ayri.example.com', databaseUrl: url }, rt()));
    const own = await connectDb(url);
    expect(await withCompany(r.companyId, (tx) => tx.select().from(invites), own)).toHaveLength(1);
    expect(await withCompany(r.companyId, (tx) => tx.select().from(invites), t.db)).toHaveLength(0);
    const routed = await dataDbFor(r.companyId, t.db);
    expect(routed).toBe(own);
    expect(await loadCompanyConfig(routed, r.companyId)).toMatchObject({ modules: ['orders'] });

    const token = r.inviteLink.split('/davet/')[1]!;
    ok(await acceptInvite({ token, password: 'GucluParola-2026!' }, { auth, db: routed, companyId: r.companyId }));
    const res = await auth.handler(new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', 'x-forwarded-for': '10.9.0.2' },
      body: JSON.stringify({ email: 'yonetici@ayri.example.com', password: 'GucluParola-2026!' }),
    }));
    const headers = new Headers({ cookie: (res.headers.get('set-cookie') ?? '').split(';')[0]! });
    expect(await resolveCurrentUser(auth, routed, r.companyId, headers)).toMatchObject({ roles: ['admin'] });
    // Ana veritabanında bu firmanın üyeliği yok: yanlış veritabanına bakan kod kullanıcıyı göremez.
    expect(await resolveCurrentUser(auth, t.db, r.companyId, headers)).toBeNull();
  });

  it('erişilemeyen ayrı veritabanında firma açılmaz ve kayıt geri alınır', async () => {
    process.env.PLATFORM_SECRET = 'p'.repeat(40);
    const res = await createCompany({ name: 'Bozuk', slug: 'bozuk', host: '', sector: 'bags', modules: ['orders'], adminName: 'Yönetici', adminEmail: 'b@example.com', databaseUrl: 'ftp://yanlis' }, rt());
    expect(res).toMatchObject({ ok: false, fieldErrors: { databaseUrl: expect.any(String) } });
    expect((await t.db.select().from(companies).where(eq(companies.slug, 'bozuk'))).length).toBe(0);
  });
});
