import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { addPayment, cancelOrder, createOrder } from '@/modules/orders/server/actions';
import { customerAccount, listOrders, ordersSummary, receivables } from '@/modules/orders/server/queries';

let t: TestDb;
let customer: string;
let paidUp: string;
let salesStaffId: string;
const sales = () => runtime(t, testUser(t.companyA, ['sales']));
const product = { width: 45, height: 45, shape: 'Körüksüz', gusset: 0, biye: 5, handle: 'El Geçme', gsm: 70, rolls: 1, colour: 'Beyaz', noPrint: true };
// 1000 adet × 10 + %20 KDV = 12.000,00
const order = (partyId: string, extra: Record<string, unknown> = {}) => ({ partyId, salespersonStaffId: salesStaffId, orderDate: '2026-10-18', product, quantity: 1000, unitPrice: '10', vatRate: '20', currency: 'TRY', packaging: { type: 'none', capacity: 0 }, ...extra });

beforeAll(async () => {
  t = await createTestDb();
  const admin = runtime(t, testUser(t.companyA, ['admin']));
  const a = await createParty({ kind: 'customer', name: 'Borçlu Müşteri', legalType: 'company' }, admin);
  const b = await createParty({ kind: 'customer', name: 'Ödemiş Müşteri', legalType: 'company' }, admin);
  const s = await createStaff({ name: 'Satışçı', kind: 'sales', departments: ['sales'] }, admin);
  if (!a.ok || !b.ok || !s.ok) throw new Error('kurulum');
  customer = a.data.id;
  paidUp = b.data.id;
  salesStaffId = s.data.id;

  const o1 = await createOrder({ ...order(customer), deposit: '2.000' }, sales());
  const o2 = await createOrder(order(customer), sales());
  const usd = await createOrder({ ...order(customer), currency: 'USD', fxRate: '41,50', fxRateDate: '2026-10-17' }, sales());
  const cancelled = await createOrder({ ...order(customer), deposit: '100' }, sales());
  const full = await createOrder(order(paidUp), sales());
  if (!o1.ok || !o2.ok || !usd.ok || !cancelled.ok || !full.ok) throw new Error('sipariş');
  await addPayment({ orderId: o2.data.id, amount: '500' }, sales());
  await addPayment({ orderId: full.data.id, amount: '12.000' }, sales());
  const c = await cancelOrder({ id: cancelled.data.id, reason: 'Müşteri vazgeçti', version: 1 }, sales());
  if (!c.ok) throw new Error(c.message);
});
afterAll(async () => { await t.close(); });

describe('cari hesap (sipariş bazlı)', () => {
  it('para birimi başına toplam, tahsilat ve bakiye; iptal edilen siparişin peşinatı iade borcudur', async () => {
    const r = await customerAccount({ partyId: customer }, sales());
    if (!r.ok) throw new Error(r.message);
    expect(r.data.totals).toEqual([
      { currency: 'TRY', total: { minor: '2400000', currency: 'TRY' }, paid: { minor: '260000', currency: 'TRY' }, balance: { minor: '2140000', currency: 'TRY' } },
      { currency: 'USD', total: { minor: '1200000', currency: 'USD' }, paid: { minor: '0', currency: 'USD' }, balance: { minor: '1200000', currency: 'USD' } },
    ]);
    const cancelledRow = r.data.orders.find((o) => o.status === 'cancelled');
    expect(cancelledRow?.balance).toEqual({ minor: '-10000', currency: 'TRY' });
    expect(r.data.orders).toHaveLength(4);
  });

  it('sipariş listesinde iptal edilen sipariş borç göstermez', async () => {
    const r = await listOrders({ status: 'cancelled' }, sales());
    expect(r.ok && r.data.map((o) => o.balance.minor)).toEqual(['-10000']);
  });

  it('alacaklar listesi yalnızca açık bakiyesi olan müşterileri büyükten küçüğe verir', async () => {
    const r = await receivables({}, sales());
    if (!r.ok) throw new Error(r.message);
    expect(r.data.map((x) => [x.partyName, x.currency, x.balance.minor])).toEqual([
      ['Borçlu Müşteri', 'TRY', '2140000'],
      ['Borçlu Müşteri', 'USD', '1200000'],
    ]);
  });

  it('başka firma göremez; bölüm tableti erişemez', async () => {
    const other = await receivables({}, runtime(t, testUser(t.companyB, ['sales'])));
    expect(other.ok && other.data).toEqual([]);
    expect(await customerAccount({ partyId: customer }, runtime(t, testUser(t.companyA, ['cutting'], { kind: 'device' })))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('ana sayfa özeti (sipariş)', () => {
  it('durum sayıları ve para birimi başına açık bakiye', async () => {
    const r = await ordersSummary({}, sales());
    if (!r.ok) throw new Error(r.message);
    expect(r.data.counts).toMatchObject({ draft: 4, cancelled: 1 });
    expect(r.data.openBalances).toEqual([{ minor: '2140000', currency: 'TRY' }, { minor: '1200000', currency: 'USD' }]);
  });
});
