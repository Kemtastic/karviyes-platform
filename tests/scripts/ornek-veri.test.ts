import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { testConfig } from '../helpers/runtime';
import { createAuth } from '@/core/auth/auth';
import { withCompany } from '@/core/db/scope';
import { memberships, parties, staff } from '@/core/db/schema';
import { validateTaxId } from '@/core/parties/tax-id';
import { orders } from '@/modules/orders/db/schema';
import { jobs } from '@/modules/production/db/schema';
import { seedSampleData } from '@/seed/sample-data';

let t: TestDb;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.close(); });

const run = () =>
  seedSampleData({ db: t.db, companyId: t.companyA, cfg: testConfig, auth: createAuth(t.db, { secret: 's'.repeat(32), baseURL: 'http://localhost:3000', issuer: 'Test' }), tabletPassword: 'Tablet-Parola-2026' });

describe('örnek veri', () => {
  it('ilk çalıştırmada cari, sipariş, iş, personel ve tablet hesapları oluşur', async () => {
    const r = await run();
    expect(r.created).toBe(true);
    const counts = await withCompany(t.companyA, async (tx) => ({
      parties: (await tx.select().from(parties)).length,
      orders: (await tx.select().from(orders)).length,
      jobs: await tx.select().from(jobs),
      staff: (await tx.select().from(staff)).length,
      devices: (await tx.select().from(memberships)).filter((m) => m.kind === 'device').length,
    }), t.db);
    // 10 müşteri + 4 tedarikçi; 15 sipariş + 3 çok ürünlü demo siparişi
    expect(counts.parties).toBe(14);
    expect(counts.orders).toBe(18);
    expect(counts.staff).toBeGreaterThanOrEqual(7);
    expect(counts.devices).toBe(5);
    expect(new Set(counts.jobs.map((j) => j.stage))).toEqual(new Set(['shipped', 'completed', 'review', 'cutting', 'waiting']));
  });

  it('ikinci çalıştırma çoğaltmaz', async () => {
    expect((await run()).created).toBe(false);
    expect((await withCompany(t.companyA, (tx) => tx.select().from(parties), t.db)).length).toBe(14);
  });

  it('vergi numaraları test aralığında ve geçerli', async () => {
    const rows = await withCompany(t.companyA, (tx) => tx.select().from(parties), t.db);
    for (const p of rows) {
      if (p.taxId) {
        expect(p.taxId.startsWith('999')).toBe(true);
        expect(validateTaxId(p.taxId, 'company')).toBe(true);
      }
      expect(p.email.endsWith('@example.com')).toBe(true);
    }
  });
});
