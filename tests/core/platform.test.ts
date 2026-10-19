import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, dbError, type TestDb } from '../helpers/db';
import { auditLog, companySettings, platformAdmins, platformAudit, user } from '@/core/db/schema';
import { withCompany } from '@/core/db/scope';
import { loadCompanyConfig } from '@/core/company/config';
import type { PlatformAdmin, PlatformRuntime } from '@/core/platform/action';
import { platformAuditList, platformCompanies, platformCompany, updateCompanySettings } from '@/core/platform/companies';
import { runtime, testUser } from '../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { createOrder } from '@/modules/orders/server/actions';

let t: TestDb;
const admin: PlatformAdmin = { userId: 'kurucu', email: 'kurucu@example.com', name: 'Kurucu', twoFactorEnabled: true };
const rt = (a: PlatformAdmin | null = admin): PlatformRuntime => ({ admin: a, db: t.db, batch: true });
const base = { modules: ['orders', 'production', 'sales'] as const, sector: 'bags', twoFactorRoles: ['admin'] as const, features: {}, status: 'active' as const };

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(user).values({ id: 'kurucu', name: 'Kurucu', email: 'kurucu@example.com', emailVerified: true, twoFactorEnabled: true });
  await t.db.insert(platformAdmins).values({ userId: 'kurucu', createdBy: 'kurulum' });
});
afterAll(async () => { await t.close(); });

describe('merkez panel yetkisi', () => {
  it('yönetici olmayan ve 2FA kurmamış yönetici giremez', async () => {
    expect(await platformCompanies({}, rt(null))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await platformCompanies({}, rt({ ...admin, twoFactorEnabled: false }))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('firma kapsamındaki uygulama rolü panel tablolarını göremez', async () => {
    const msg = await dbError(withCompany(t.companyA, (tx) => tx.select().from(platformAdmins), t.db));
    expect(msg).toMatch(/permission denied/i);
  });
});

describe('firma ayarları', () => {
  it('firmalar listelenir; modül değişikliği firmaya özel uygulanır ve iki kayda da yazılır', async () => {
    const list = ok(await platformCompanies({}, rt()));
    expect(list.map((c) => c.slug)).toEqual(['firma-a', 'firma-b']);
    ok(await updateCompanySettings({ ...base, companyId: t.companyB, modules: ['orders', 'production'], sector: 'plastic-bags' }, rt()));
    const b = await loadCompanyConfig(t.db, t.companyB);
    expect(b).toMatchObject({ modules: ['orders', 'production'], sector: 'plastic-bags' });
    expect((await loadCompanyConfig(t.db, t.companyA)).sector).not.toBe('plastic-bags');
    expect(ok(await platformCompany({ id: t.companyB }, rt()))).toMatchObject({ config: { sector: 'plastic-bags' }, overrides: { modules: true } });
    const companyLog = await withCompany(t.companyB, (tx) => tx.select().from(auditLog), t.db);
    expect(companyLog.find((a) => a.action === 'platform.updateCompanySettings')).toMatchObject({ actorUserId: 'kurucu', entity: 'company_settings' });
    expect(ok(await platformAuditList({}, rt()))[0]).toMatchObject({ action: 'platform.updateCompanySettings', companyName: 'Firma B' });
  });

  it('bağımlılık eksik modül seti ve bilinmeyen sektör reddedilir', async () => {
    expect(await updateCompanySettings({ ...base, companyId: t.companyA, modules: ['production'] }, rt())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await updateCompanySettings({ ...base, companyId: t.companyA, sector: 'yok' }, rt())).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('sipariş varken sektör değiştirilemez; askıya alma neden ister', async () => {
    const companyRt = runtime(t, testUser(t.companyA, ['admin']));
    const party = ok(await createParty({ kind: 'customer', name: 'Müşteri', legalType: 'company' }, companyRt)).id;
    const staff = ok(await createStaff({ name: 'Satışçı', kind: 'sales', departments: ['sales'] }, companyRt)).id;
    const product = { width: 45, height: 45, shape: 'Körüksüz', gusset: 0, biye: 5, handle: 'El Geçme', gsm: 70, rolls: 1, colour: 'Beyaz', noPrint: true };
    ok(await createOrder({ partyId: party, salespersonStaffId: staff, orderDate: '2026-10-01', product, quantity: 10, unitPrice: '1', vatRate: '0', currency: 'TRY', packaging: { type: 'none', capacity: 0 } }, companyRt));
    expect(await updateCompanySettings({ ...base, companyId: t.companyA, sector: 'plastic-bags' }, rt())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    expect(await updateCompanySettings({ ...base, companyId: t.companyA, status: 'suspended' }, rt())).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    ok(await updateCompanySettings({ ...base, companyId: t.companyA, status: 'suspended', reason: 'Ödeme gecikti' }, rt()));
    const [st] = await withCompany(t.companyA, (tx) => tx.select().from(companySettings), t.db);
    expect(st?.status).toBe('suspended');
    expect((await t.db.select().from(platformAudit)).length).toBeGreaterThanOrEqual(2);
  });
});
