import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db';
import { loadCompanyConfig } from '@/core/company/config';
import { companies, companySettings, platformAdmins, user } from '@/core/db/schema';
import { withCompany } from '@/core/db/scope';
import type { PlatformAdmin, PlatformRuntime } from '@/core/platform/action';
import { updateCompanySettings } from '@/core/platform/companies';
import {
  applyCentralBundle, centralBundleFor, issueInstallToken, signBundle, syncFromCentral, verifyBundle, type CentralBundle,
} from '@/core/platform/signed-config';

let t: TestDb;
const admin: PlatformAdmin = { userId: 'kurucu', email: 'kurucu@example.com', name: 'Kurucu', twoFactorEnabled: true };
const rt = (): PlatformRuntime => ({ admin, db: t.db, batch: true });
const keys = generateKeyPairSync('ed25519');
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

const payload = (over: Partial<CentralBundle['payload']> = {}): CentralBundle['payload'] => ({
  slug: 'firma-a', modules: ['orders'], sector: 'bags', twoFactorRoles: ['admin'], features: {}, status: 'active',
  issuedAt: '2026-10-20T00:00:00.000Z', expiresAt: '2026-10-27T00:00:00.000Z', ...over,
});

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(user).values({ id: 'kurucu', name: 'Kurucu', email: 'kurucu@example.com', emailVerified: true, twoFactorEnabled: true });
  await t.db.insert(platformAdmins).values({ userId: 'kurucu', createdBy: 'kurulum' });
});
afterAll(async () => { await t.close(); });

describe('imzalı ayar paketi', () => {
  const now = new Date('2026-10-21T00:00:00Z');
  it('doğru anahtarla imzalanan paket doğrulanır; değiştirilmiş, başka anahtarlı, süresi geçmiş ya da başka firmanın paketi reddedilir', () => {
    const b = signBundle(payload(), privateKey);
    expect(verifyBundle(b, publicKey, 'firma-a', now)).toMatchObject({ slug: 'firma-a', modules: ['orders'] });
    expect(() => verifyBundle({ ...b, payload: { ...b.payload, modules: ['orders', 'finance'] } }, publicKey, 'firma-a', now)).toThrow(/imza/i);
    expect(() => verifyBundle(b, other, 'firma-a', now)).toThrow(/imza/i);
    expect(() => verifyBundle(b, publicKey, 'firma-a', new Date('2026-10-28T00:00:00Z'))).toThrow(/süresi/i);
    expect(() => verifyBundle(b, publicKey, 'firma-b', now)).toThrow(/firma/i);
  });
});

describe('merkez → kurulum', () => {
  it('merkez, geçerli kurulum anahtarına firmanın güncel ayarını imzalı verir; yanlış anahtara vermez', async () => {
    const [a] = await t.db.select().from(companies).where(eq(companies.id, t.companyA));
    ok(await updateCompanySettings({ companyId: t.companyA, modules: ['orders', 'production'], sector: 'bags', twoFactorRoles: ['admin'], features: { 'orders.requireDeliveryDate': true }, status: 'active' }, rt()));
    const { token } = ok(await issueInstallToken({ companyId: t.companyA }, rt()));
    expect(await centralBundleFor(t.db, a!.slug, 'yanlis-anahtar', privateKey)).toBeNull();
    const b = (await centralBundleFor(t.db, a!.slug, token, privateKey, new Date('2026-10-21T00:00:00Z')))!;
    expect(verifyBundle(b, publicKey, 'firma-a', new Date('2026-10-22T00:00:00Z'))).toMatchObject({ modules: ['orders', 'production'], features: { 'orders.requireDeliveryDate': true } });
    // Anahtar yenilenince eskisi geçersiz olur.
    ok(await issueInstallToken({ companyId: t.companyA }, rt()));
    expect(await centralBundleFor(t.db, a!.slug, token, privateKey)).toBeNull();
  });

  it('kurulum paketi uygular; merkeze ulaşılamazsa son bilinen ayarla devam eder; sahte paket uygulanmaz', async () => {
    const good = signBundle(payload({ slug: 'firma-b', modules: ['orders', 'sales'], sector: 'bags' }), privateKey);
    const fetchOk = async () => new Response(JSON.stringify(good), { status: 200 });
    const env = { url: 'https://merkez.example.com/api/merkez/ayar/firma-b', token: 'x', publicKey, slug: 'firma-b' };
    expect(await syncFromCentral(t.db, t.companyB, env, fetchOk, new Date('2026-10-21T00:00:00Z'))).toMatchObject({ applied: true });
    expect(await loadCompanyConfig(t.db, t.companyB)).toMatchObject({ modules: ['orders', 'sales'] });

    const down = async () => { throw new Error('ECONNREFUSED'); };
    expect(await syncFromCentral(t.db, t.companyB, env, down)).toMatchObject({ applied: false, reason: expect.stringMatching(/ulaşılamadı/) });
    expect(await loadCompanyConfig(t.db, t.companyB)).toMatchObject({ modules: ['orders', 'sales'] });

    const forged = { ...good, payload: { ...good.payload, modules: ['orders', 'sales', 'finance'] } };
    const fetchForged = async () => new Response(JSON.stringify(forged), { status: 200 });
    expect(await syncFromCentral(t.db, t.companyB, env, fetchForged, new Date('2026-10-21T00:00:00Z'))).toMatchObject({ applied: false });
    expect(await loadCompanyConfig(t.db, t.companyB)).toMatchObject({ modules: ['orders', 'sales'] });
  });

  it('paket uygulanırken askıya alma da geçer', async () => {
    await applyCentralBundle(t.db, t.companyB, payload({ slug: 'firma-b', status: 'suspended', issuedAt: '2026-10-20T06:00:00.000Z' }));
    const [row] = await withCompany(t.companyB, (tx) => tx.select().from(companySettings).where(eq(companySettings.companyId, t.companyB)), t.db);
    expect(row).toMatchObject({ status: 'suspended', modules: ['orders'], updatedBy: 'merkez' });
  });

  it('daha önce uygulanandan eski (ya da aynı) paket yeniden uygulanmaz', async () => {
    const env = { url: 'https://merkez.example.com/api/merkez/ayar/firma-b', token: 'x', publicKey, slug: 'firma-b' };
    const newer = signBundle(payload({ slug: 'firma-b', modules: ['orders', 'production'], issuedAt: '2026-10-22T00:00:00.000Z', expiresAt: '2026-10-29T00:00:00.000Z' }), privateKey);
    const older = signBundle(payload({ slug: 'firma-b', modules: ['orders'], issuedAt: '2026-10-21T12:00:00.000Z', expiresAt: '2026-10-28T00:00:00.000Z' }), privateKey);
    const serve = (b: unknown) => async () => new Response(JSON.stringify(b), { status: 200 });
    const now = new Date('2026-10-23T00:00:00Z');
    expect(await syncFromCentral(t.db, t.companyB, env, serve(newer), now)).toMatchObject({ applied: true });
    expect(await syncFromCentral(t.db, t.companyB, env, serve(older), now)).toMatchObject({ applied: false, reason: expect.stringMatching(/eski/) });
    expect(await syncFromCentral(t.db, t.companyB, env, serve(newer), now)).toMatchObject({ applied: false });
    expect(await loadCompanyConfig(t.db, t.companyB)).toMatchObject({ modules: ['orders', 'production'] });
  });
});
