import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { recordInvoice } from '@/modules/finance/server/actions';
import { babsReport } from '@/modules/finance/server/reports';

let t: TestDb;
const acc = () => runtime(t, testUser(t.companyA, ['accounting']));
const admin = () => runtime(t, testUser(t.companyA, ['admin']));
const ids: Record<string, string> = {};

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

beforeAll(async () => {
  t = await createTestDb();
  ids.buyuk = ok(await createParty({ kind: 'customer', name: 'Büyük Müşteri', legalType: 'company', taxId: '9990000021' }, admin())).id;
  ids.kucuk = ok(await createParty({ kind: 'customer', name: 'Küçük Müşteri', legalType: 'company' }, admin())).id;
  ids.ted = ok(await createParty({ kind: 'supplier', name: 'Tedarikçi', legalType: 'company' }, admin())).id;
  const inv = (kind: 'sales' | 'purchase' | 'sales_return', partyId: string, docNo: string, base: string, date = '2026-09-10', currency = 'TRY', fxRate?: string) =>
    recordInvoice({ kind, partyId, docNo, date, currency, base, vatRate: 20, fxRate }, acc()).then(ok);
  await inv('sales', ids.buyuk, 'B1', '3.000');
  await inv('sales', ids.buyuk, 'B2', '2.500');
  await inv('sales_return', ids.buyuk, 'BI', '9.000');
  await inv('sales', ids.kucuk, 'K1', '4.999,99');
  await inv('purchase', ids.ted, 'T1', '6.000');
  await inv('purchase', ids.ted, 'T2', '1.000', '2026-10-01');
  await inv('sales', ids.kucuk, 'D1', '100', '2026-09-11', 'USD', '41,5');
});
afterAll(async () => { await t.close(); });

describe('Ba-Bs hazırlık', () => {
  it('ay içinde aynı cariyle KDV hariç toplamı eşiği aşanlar; iade ve başka ay dahil değil; dövizli kuruyla TL', async () => {
    const r = ok(await babsReport({ month: '2026-09' }, acc()));
    // Küçük müşteri: 4.999,99 + 100 USD × 41,5 = 9.149,99 TL
    expect(r.rows.map((x) => [x.form, x.name, x.count, x.base, x.missingTaxId])).toEqual([
      ['Ba', 'Tedarikçi', 1, '600000', true],
      ['Bs', 'Küçük Müşteri', 2, '914999', true],
      ['Bs', 'Büyük Müşteri', 2, '550000', false],
    ]);
    expect(r.foreign).toEqual([]);
    expect(await recordInvoice({ kind: 'sales', partyId: ids.kucuk, docNo: 'D2', date: '2026-09-12', currency: 'EUR', base: '10', vatRate: 0 }, acc())).toMatchObject({ ok: false, fieldErrors: { fxRate: expect.any(String) } });
    expect(ok(await babsReport({ month: '2026-09', thresholdTl: 9150 }, acc())).rows.map((x) => x.name)).not.toContain('Küçük Müşteri');
    expect(await babsReport({ month: '2026-09' }, runtime(t, testUser(t.companyA, ['sales'])))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
