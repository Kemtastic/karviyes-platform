import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { cashForecast, incomeExpense } from '@/modules/finance/server/analysis';
import { createAccount, recordExpense, recordInvoice } from '@/modules/finance/server/actions';
import { createRecurring } from '@/modules/finance/server/recurring';

let t: TestDb;
const acc = () => ({ ...runtime(t, testUser(t.companyA, ['accounting'])), batch: true });

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

beforeAll(async () => {
  t = await createTestDb();
  const admin = { ...runtime(t, testUser(t.companyA, ['admin'])), batch: true };
  const musteri = ok(await createParty({ kind: 'customer', name: 'Müşteri A.Ş.', legalType: 'company' }, admin)).id;
  const tedarikci = ok(await createParty({ kind: 'supplier', name: 'Tedarikçi Ltd.', legalType: 'company' }, admin)).id;
  const kasa = ok(await createAccount({ kind: 'cash', name: 'Kasa', currency: 'TRY', opening: '50.000', openingDate: '2026-01-01' }, acc())).id;
  ok(await recordInvoice({ kind: 'sales', partyId: musteri, docNo: 'S-1', date: '2026-09-10', due: '2026-10-10', currency: 'TRY', base: '1.000', vatRate: 20 }, acc()));
  ok(await recordInvoice({ kind: 'sales', partyId: musteri, docNo: 'S-2', date: '2026-10-01', due: '2026-10-30', currency: 'TRY', base: '10.000', vatRate: 20 }, acc()));
  ok(await recordInvoice({ kind: 'purchase', partyId: tedarikci, docNo: 'A-1', date: '2026-10-02', due: '2026-11-03', currency: 'TRY', base: '5.000', vatRate: 20 }, acc()));
  ok(await recordExpense({ accountId: kasa, amount: '1.200', vatRate: 20, category: 'Kira', date: '2026-10-05' }, acc()));
  ok(await createRecurring({ name: 'Aidat', accountId: kasa, amount: '2.000', category: 'Diğer', dayOfMonth: 25, startMonth: '2026-10' }, acc()));
});
afterAll(async () => { await t.close(); });

describe('gelir-gider', () => {
  it('ay bazında satış, alış, masraf (KDV hariç) ve sonuç; masraf kırılımı', async () => {
    const r = ok(await incomeExpense({ from: '2026-09-01', to: '2026-10-31' }, acc()));
    expect(r.months.map((m) => [m.month, m.revenue, m.purchases, m.expenses, m.result])).toEqual([
      ['2026-09', '1.000,00 ₺', '0,00 ₺', '0,00 ₺', '1.000,00 ₺'],
      ['2026-10', '10.000,00 ₺', '5.000,00 ₺', '1.000,00 ₺', '4.000,00 ₺'],
    ]);
    expect(r.total.result).toBe('5.000,00 ₺');
    expect(r.expenseByCategory).toEqual([{ category: 'Kira', amount: '1.000,00 ₺', share: 100 }]);
  });
});

describe('nakit akış tahmini', () => {
  it('kasa+banka ile başlar; haftalık vadeli tahsilat, ödeme ve tekrarlayan kayıtlarla yürür; vadesi geçenler ilk haftada', async () => {
    const r = ok(await cashForecast({ today: '2026-10-20', weeks: 8 }, acc()));
    expect(r.start).toBe('48.800,00 ₺');
    expect(r.weeks.map((w) => [w.from, w.inflow, w.outflow, w.balance])).toEqual([
      ['2026-10-19', '1.200,00 ₺', '2.000,00 ₺', '48.000,00 ₺'],
      ['2026-10-26', '12.000,00 ₺', '0,00 ₺', '60.000,00 ₺'],
      ['2026-11-02', '0,00 ₺', '6.000,00 ₺', '54.000,00 ₺'],
      ['2026-11-09', '0,00 ₺', '0,00 ₺', '54.000,00 ₺'],
      ['2026-11-16', '0,00 ₺', '0,00 ₺', '54.000,00 ₺'],
      ['2026-11-23', '0,00 ₺', '2.000,00 ₺', '52.000,00 ₺'],
      ['2026-11-30', '0,00 ₺', '0,00 ₺', '52.000,00 ₺'],
      ['2026-12-07', '0,00 ₺', '0,00 ₺', '52.000,00 ₺'],
    ]);
    expect(r.overdueIn).toBe('1.200,00 ₺');
    expect(r.lowest).toMatchObject({ from: '2026-10-19', balance: '48.000,00 ₺' });
  });

  it('satış rolü göremez', async () => {
    expect(await cashForecast({}, { ...runtime(t, testUser(t.companyA, ['sales'])), batch: true })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
