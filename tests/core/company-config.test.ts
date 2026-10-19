import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { testConfig } from '../helpers/runtime';
import { loadCompanyConfig, mergeCompanyConfig } from '@/core/company/config';
import { companySettings } from '@/core/db/schema';
import { withCompany } from '@/core/db/scope';

let t: TestDb;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.close(); });

describe('firma ayarları', () => {
  it('kayıt yoksa kurulum ayarı geçerli', async () => {
    expect(await loadCompanyConfig(t.db, t.companyA, testConfig)).toEqual(testConfig);
  });

  it('veritabanındaki modül, sektör, 2FA rolleri ve özellikler kurulum ayarının üstüne gelir; firma başına ayrı', async () => {
    await withCompany(t.companyA, (tx) => tx.insert(companySettings).values({ companyId: t.companyA, modules: ['orders', 'production'], sector: 'plastic-bags', twoFactorRoles: ['admin'], features: { fiyatGizle: true } }), t.db);
    const a = await loadCompanyConfig(t.db, t.companyA, testConfig);
    expect(a).toMatchObject({ modules: ['orders', 'production'], sector: 'plastic-bags', security: { twoFactorRequiredRoles: ['admin'] }, features: { fiyatGizle: true } });
    expect(await loadCompanyConfig(t.db, t.companyB, testConfig)).toEqual(testConfig);
  });

  it('bağımlılığı eksik modül seti reddedilir; boş alanlar kurulum ayarından gelir', () => {
    expect(() => mergeCompanyConfig(testConfig, { modules: ['production'], sector: null, twoFactorRoles: null, features: {} })).toThrow(/orders/);
    expect(mergeCompanyConfig(testConfig, { modules: null, sector: null, twoFactorRoles: null, features: {} })).toEqual(testConfig);
  });
});

describe('özellik anahtarları', () => {
  it('firma ayarı yoksa varsayılan; varsa firmanın değeri', async () => {
    const { feature } = await import('@/core/features');
    expect(feature(testConfig, 'finance.reconciliationEmail')).toBe(true);
    expect(feature(testConfig, 'orders.requireDeliveryDate')).toBe(false);
    expect(feature({ features: { 'orders.requireDeliveryDate': true } }, 'orders.requireDeliveryDate')).toBe(true);
  });

  it('teslim tarihi zorunlu firmada tarihsiz sipariş reddedilir', async () => {
    const { runtime, testUser } = await import('../helpers/runtime');
    const { createParty } = await import('@/core/parties/service');
    const { createStaff } = await import('@/core/users/service');
    const { createOrder } = await import('@/modules/orders/server/actions');
    const rt = { ...runtime(t, testUser(t.companyB, ['admin'])), cfg: { ...testConfig, features: { 'orders.requireDeliveryDate': true } } };
    const party = await createParty({ kind: 'customer', name: 'Teslim Müşterisi', legalType: 'company' }, rt);
    const staff = await createStaff({ name: 'Satış Personeli', kind: 'sales', departments: ['sales'] }, rt);
    if (!party.ok || !staff.ok) throw new Error('kurulum');
    const product = { width: 45, height: 45, shape: 'Körüksüz', gusset: 0, biye: 5, handle: 'El Geçme', gsm: 70, rolls: 1, colour: 'Beyaz', noPrint: true };
    const order = { partyId: party.data.id, salespersonStaffId: staff.data.id, orderDate: '2026-10-01', product, quantity: 10, unitPrice: '1', vatRate: '0', currency: 'TRY', packaging: { type: 'none', capacity: 0 } };
    expect(await createOrder(order, rt)).toMatchObject({ ok: false, fieldErrors: { deliveryDate: expect.any(String) } });
    expect(await createOrder({ ...order, deliveryDate: '2026-10-20' }, rt)).toMatchObject({ ok: true });
  });
});
