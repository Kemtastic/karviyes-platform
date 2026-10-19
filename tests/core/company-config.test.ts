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
