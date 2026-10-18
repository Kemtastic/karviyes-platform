import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { createOrder, setDeliveryDate } from '@/modules/orders/server/actions';
import { orderForOffice } from '@/modules/orders/server/queries';
import { productionAlerts } from '@/modules/production/server/alerts';

let t: TestDb;
const admin = () => runtime(t, testUser(t.companyA, ['admin']));
const product = { width: 45, height: 45, shape: 'Körüksüz', gusset: 0, biye: 5, handle: 'El Geçme', gsm: 70, rolls: 1, colour: 'Beyaz', noPrint: true };
let base: Record<string, unknown>;

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

beforeAll(async () => {
  t = await createTestDb();
  const party = ok(await createParty({ kind: 'customer', name: 'Teslim Müşterisi', legalType: 'company' }, admin())).id;
  const s = ok(await createStaff({ name: 'Satışçı', kind: 'sales', departments: ['sales'] }, admin())).id;
  base = { partyId: party, salespersonStaffId: s, orderDate: '2026-10-01', product, quantity: 1000, unitPrice: '10', vatRate: '20', currency: 'TRY', packaging: { type: 'none', capacity: 0 } };
});
afterAll(async () => { await t.close(); });

describe('teslim tarihi', () => {
  it('siparişle kaydedilir; sipariş tarihinden önce olamaz; sonradan değiştirilebilir', async () => {
    expect(await createOrder({ ...base, deliveryDate: '2026-09-30' }, admin())).toMatchObject({ ok: false, fieldErrors: { deliveryDate: expect.any(String) } });
    const o = ok(await createOrder({ ...base, deliveryDate: '2026-10-10' }, admin()));
    expect(ok(await orderForOffice({ id: o.id }, admin())).deliveryDate).toBe('2026-10-10');
    ok(await setDeliveryDate({ id: o.id, version: 1, deliveryDate: '2026-10-20' }, admin()));
    expect(ok(await orderForOffice({ id: o.id }, admin())).deliveryDate).toBe('2026-10-20');
    expect(await setDeliveryDate({ id: o.id, version: 1, deliveryDate: null }, admin())).toMatchObject({ ok: false, code: 'CONFLICT' });
    ok(await setDeliveryDate({ id: o.id, version: 2, deliveryDate: null }, admin()));
    expect(ok(await orderForOffice({ id: o.id }, admin())).deliveryDate).toBeNull();
  });

  it('teslim tarihi geçen sipariş uyarılarda görünür', async () => {
    const o = ok(await createOrder({ ...base, deliveryDate: '2026-10-12' }, admin()));
    const alerts = ok(await productionAlerts({ today: '2026-10-18' }, admin()));
    expect(alerts.find((a) => a.href === `/siparisler/${o.id}`)).toMatchObject({ kind: 'late', days: 6 });
  });
});

describe('üretim içgörüleri', () => {
  it('ölçü başına satış, bobin ve bobin başı satış; bekleyen bobinler', async () => {
    const { productionInsights } = await import('@/modules/production/server/insights');
    const r = ok(await productionInsights({ from: '2026-10-01', to: '2026-10-31' }, admin()));
    // Önceki testlerde iki sipariş: 1000 adet × 10 TL, 1 bobin
    const spec = r.specs[0]!;
    expect(spec).toMatchObject({ currency: 'TRY', lines: 2, quantity: 2000, rolls: 2, sales: '2000000', perRoll: '1000000' });
    expect(r.rolls).toEqual({ pending: 2, production: 0, done: 0 });
    expect(r.stock).toEqual([]);
    expect(await productionInsights({ from: '2026-10-01', to: '2026-10-31' }, runtime(t, testUser(t.companyA, ['sales'])))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
