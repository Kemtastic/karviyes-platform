import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { createAccount, recordPayment, reverseMovement } from '@/modules/finance/server/actions';
import { partyOpenOrders } from '@/modules/finance/server/queries';
import { createOrder } from '@/modules/orders/server/actions';
import { customerAccount } from '@/modules/orders/server/queries';

let t: TestDb;
const acc = () => runtime(t, testUser(t.companyA, ['accounting']));
const admin = () => runtime(t, testUser(t.companyA, ['admin']));
const ids: Record<string, string> = {};

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

const product = { width: 45, height: 45, shape: 'Körüksüz', gusset: 0, biye: 5, handle: 'El Geçme', gsm: 70, rolls: 1, colour: 'Beyaz', noPrint: true };
const orderBalance = async (orderId: string) => ok(await customerAccount({ partyId: ids.musteri! }, admin())).orders.find((o) => o.id === orderId)!.balance.minor;

beforeAll(async () => {
  t = await createTestDb();
  ids.musteri = ok(await createParty({ kind: 'customer', name: 'Sipariş Müşterisi', legalType: 'company' }, admin())).id;
  ids.baska = ok(await createParty({ kind: 'customer', name: 'Başka Müşteri', legalType: 'company' }, admin())).id;
  const s = ok(await createStaff({ name: 'Satışçı', kind: 'sales', departments: ['sales'] }, admin())).id;
  // 1000 × 10 + %20 = 12.000,00
  ids.siparis = ok(await createOrder({ partyId: ids.musteri, salespersonStaffId: s, orderDate: '2026-10-01', product, quantity: 1000, unitPrice: '10', vatRate: '20', currency: 'TRY', packaging: { type: 'none', capacity: 0 } }, admin())).id;
  ids.banka = ok(await createAccount({ kind: 'bank', name: 'Banka', currency: 'TRY', openingDate: '2026-01-01' }, acc())).id;
  ids.usd = ok(await createAccount({ kind: 'bank', name: 'USD', currency: 'USD', openingDate: '2026-01-01' }, acc())).id;
});
afterAll(async () => { await t.close(); });

describe('tahsilatı siparişe de işleme', () => {
  it('açık siparişler listelenir; tahsilat sipariş bakiyesini düşürür', async () => {
    expect(ok(await partyOpenOrders({ partyId: ids.musteri! }, acc()))).toEqual([expect.objectContaining({ id: ids.siparis, balance: { minor: '1200000', currency: 'TRY' } })]);
    const r = ok(await recordPayment({ kind: 'collection', partyId: ids.musteri, accountId: ids.banka, amount: '2.000', date: '2026-10-05', orderId: ids.siparis }, acc()));
    expect(r.order).toMatch(/^S-/);
    expect(await orderBalance(ids.siparis!)).toBe('1000000');
    ids.hareket = r.id;
  });

  it('hareket iptal edilince sipariş tahsilatı düzeltmeyle sıfırlanır', async () => {
    ok(await reverseMovement({ id: ids.hareket, reason: 'Yanlış tutar' }, acc()));
    expect(await orderBalance(ids.siparis!)).toBe('1200000');
  });

  it('başka carinin siparişi, farklı para birimi ve ödeme yönü reddedilir; hiçbir kayıt yarım kalmaz', async () => {
    expect(await recordPayment({ kind: 'collection', partyId: ids.baska, accountId: ids.banka, amount: '100', date: '2026-10-05', orderId: ids.siparis }, acc())).toMatchObject({ ok: false, fieldErrors: { orderId: expect.any(String) } });
    expect(await recordPayment({ kind: 'collection', partyId: ids.musteri, accountId: ids.usd, amount: '100', date: '2026-10-05', orderId: ids.siparis }, acc())).toMatchObject({ ok: false, fieldErrors: { orderId: expect.any(String) } });
    expect(await recordPayment({ kind: 'payment', partyId: ids.musteri, accountId: ids.banka, amount: '100', date: '2026-10-05', orderId: ids.siparis }, acc())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await orderBalance(ids.siparis!)).toBe('1200000');
  });
});
