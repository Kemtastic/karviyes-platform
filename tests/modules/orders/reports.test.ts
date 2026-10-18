import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { cancelOrder, createOrder } from '@/modules/orders/server/actions';
import { salesReport } from '@/modules/orders/server/reports';

let t: TestDb;
const sales = () => runtime(t, testUser(t.companyA, ['sales']));
const bag = (width: number, gsm: number) => ({ width, height: 45, shape: 'Körüksüz', handle: 'El Geçme', gsm, rolls: 1, noPrint: true, biye: 5, colour: 'Krem' });

beforeAll(async () => {
  t = await createTestDb();
  const admin = runtime(t, testUser(t.companyA, ['admin']));
  const a = await createParty({ kind: 'customer', name: 'Alfa', legalType: 'company' }, admin);
  const b = await createParty({ kind: 'customer', name: 'Beta', legalType: 'company' }, admin);
  const ali = await createStaff({ name: 'Ali', kind: 'sales', departments: ['sales'] }, admin);
  const ayse = await createStaff({ name: 'Ayşe', kind: 'sales', departments: ['sales'] }, admin);
  if (!a.ok || !b.ok || !ali.ok || !ayse.ok) throw new Error('kurulum');
  const line = (width: number, gsm: number, quantity: number, unitPrice: string) => ({ product: bag(width, gsm), quantity, unitPrice, vatRate: '10', packaging: { type: 'none', capacity: 0 } });
  const order = async (partyId: string, staffId: string, orderDate: string, lines: ReturnType<typeof line>[], currency = 'TRY') => {
    const r = await createOrder({ partyId, salespersonStaffId: staffId, orderDate, currency, lines, ...(currency !== 'TRY' ? { fxRate: '40', fxRateDate: orderDate } : {}) }, sales());
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.data.id;
  };
  // Ali/Alfa: Ekim, 2 satır: 1000 × 5 = 5.000 net, 500 × 4 = 2.000 net
  await order(a.data.id, ali.data.id, '2026-10-05', [line(45, 70, 1000, '5'), line(30, 80, 500, '4')]);
  // Ayşe/Beta: Ekim, 2000 × 6 = 12.000 net
  await order(b.data.id, ayse.data.id, '2026-10-20', [line(45, 70, 2000, '6')]);
  // Ayşe/Beta: Eylül (aralık dışı)
  await order(b.data.id, ayse.data.id, '2026-09-20', [line(45, 70, 100, '9')]);
  // Ali/Alfa: Ekim, iptal (sayılmaz)
  const cancelled = await order(a.data.id, ali.data.id, '2026-10-06', [line(45, 70, 9999, '9')]);
  await cancelOrder({ id: cancelled, reason: 'Vazgeçti', version: 1 }, sales());
  // Ali/Alfa: Ekim, dolar
  await order(a.data.id, ali.data.id, '2026-10-07', [line(45, 70, 100, '1')], 'USD');
});
afterAll(async () => { await t.close(); });

const range = { from: '2026-10-01', to: '2026-10-31' };

describe('satış raporu', () => {
  it('satışçıya göre: sipariş sayısı, adet, KDV hariç, KDV ve toplam; para birimi ayrı; iptal sayılmaz', async () => {
    const r = await salesReport({ ...range, groupBy: 'salesperson' }, sales());
    if (!r.ok) throw new Error(r.message);
    expect(r.data.rows.map((x) => [x.label, x.currency, x.orders, x.quantity, x.net.minor, x.vat.minor, x.total.minor])).toEqual([
      ['Ayşe', 'TRY', 1, 2000, '1200000', '120000', '1320000'],
      ['Ali', 'TRY', 1, 1500, '700000', '70000', '770000'],
      ['Ali', 'USD', 1, 100, '10000', '1000', '11000'],
    ]);
  });

  it('müşteriye ve aya göre', async () => {
    const byParty = await salesReport({ ...range, groupBy: 'customer' }, sales());
    expect(byParty.ok && byParty.data.rows.filter((x) => x.currency === 'TRY').map((x) => [x.label, x.net.minor])).toEqual([['Beta', '1200000'], ['Alfa', '700000']]);
    const byMonth = await salesReport({ from: '2026-09-01', to: '2026-10-31', groupBy: 'month' }, sales());
    expect(byMonth.ok && byMonth.data.rows.filter((x) => x.currency === 'TRY').map((x) => [x.label, x.quantity])).toEqual([['2026-09', 100], ['2026-10', 3500]]);
  });

  it('ürüne göre: ağırlıklı ortalama birim fiyat ve son fiyat', async () => {
    const r = await salesReport({ from: '2026-09-01', to: '2026-10-31', groupBy: 'product' }, sales());
    if (!r.ok) throw new Error(r.message);
    const p45 = r.data.rows.find((x) => x.currency === 'TRY' && x.label.startsWith('45×45'));
    // (100×9 + 1000×5 + 2000×6) / 3100 = 5,7742
    expect(p45).toMatchObject({ quantity: 3100, avgUnitPrice: '5.7742', lastUnitPrice: '6.0000' });
  });

  it('bölüm tableti rapor göremez', async () => {
    expect(await salesReport({ ...range, groupBy: 'salesperson' }, runtime(t, testUser(t.companyA, ['cutting'], { kind: 'device' })))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
