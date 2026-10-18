import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { addPayment, cancelOrder, correctPayment, createOrder, markInvoiced, updateOrder } from '@/modules/orders/server/actions';
import { orderForOffice, orderForWorkshop } from '@/modules/orders/server/queries';
import { markInProduction, markReadyToInvoice } from '@/modules/orders/server/public';
import { withCompany } from '@/core/db/scope';

let t: TestDb;
let partyId: string;
let salesStaffId: string;
let cutterId: string;
const sales = () => runtime(t, testUser(t.companyA, ['sales']));
const tracking = () => runtime(t, testUser(t.companyA, ['tracking']));
const product = { width: 45, height: 45, shape: 'Körüksüz', gusset: 0, biye: 5, handle: 'El Geçme', gsm: 70, rolls: 3, colour: 'Beyaz', print: 'siyah', noPrint: false };
const order = () => ({ partyId, salespersonStaffId: salesStaffId, orderDate: '2026-10-18', product, unitPrice: '8,75', vatRate: '10', currency: 'TRY', deposit: '', packaging: { type: 'sack', capacity: 2000 }, departmentNotes: { printing: 'Logo ortalı' } });

beforeAll(async () => {
  t = await createTestDb();
  const admin = runtime(t, testUser(t.companyA, ['admin']));
  const p = await createParty({ kind: 'customer', name: 'Örnek Gıda', legalType: 'company', taxId: '9990000005' }, admin);
  if (!p.ok) throw new Error(p.message);
  partyId = p.data.id;
  const s = await createStaff({ name: 'Ayşe Kara', kind: 'sales', departments: ['sales'] }, admin);
  const c = await createStaff({ name: 'Emre Kesim', kind: 'master', departments: ['cutting'] }, admin);
  if (!s.ok || !c.ok) throw new Error('personel');
  salesStaffId = s.data.id;
  cutterId = c.data.id;
});
afterAll(async () => { await t.close(); });

describe('sipariş oluşturma', () => {
  it('numara, hedef adet ve tutar hesaplanır; peşinat ödeme olarak yazılır', async () => {
    const r = await createOrder({ ...order(), deposit: '1.500,00' }, sales());
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.data.no).toMatch(/^S-2026-\d{6}$/);
    const o = await orderForOffice({ id: r.data.id }, sales());
    if (!o.ok) throw new Error(o.message);
    expect(o.data.quantity).toBe(6666);
    expect(o.data.total).toEqual({ minor: '6416025', currency: 'TRY' });
    expect(o.data.balance).toEqual({ minor: '6266025', currency: 'TRY' });
    expect(o.data.packaging).toMatchObject({ packages: 4 });
  });

  it('aynı anda iki sipariş farklı ve ardışık numara alır', async () => {
    const [a, b] = await Promise.all([createOrder(order(), sales()), createOrder(order(), sales())]);
    if (!a.ok || !b.ok) throw new Error('oluşmadı');
    const nums = [a.data.no, b.data.no].map((n) => Number(n.slice(-6))).sort((x, y) => x - y);
    expect(nums[1]! - nums[0]!).toBe(1);
  });

  it('satış bölümünde olmayan personel satışçı seçilemez', async () => {
    const r = await createOrder({ ...order(), salespersonStaffId: cutterId }, sales());
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('dövizli siparişte kur zorunlu', async () => {
    expect(await createOrder({ ...order(), currency: 'USD' }, sales())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await createOrder({ ...order(), currency: 'USD', fxRate: '41.2350', fxRateDate: '2026-10-17' }, sales())).toMatchObject({ ok: true });
  });

  it('ürün doğrulama hatası alan bazında döner', async () => {
    const r = await createOrder({ ...order(), product: { ...product, gusset: 8 } }, sales());
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION', fieldErrors: expect.objectContaining({ 'product.gusset': expect.any(String) }) });
  });
});

describe('sipariş değişiklikleri', () => {
  it('eski sürümle güncelleme CONFLICT', async () => {
    const r = await createOrder(order(), sales());
    if (!r.ok) throw new Error('x');
    expect(await updateOrder({ ...order(), id: r.data.id, version: 1, unitPrice: '9' }, sales())).toMatchObject({ ok: true });
    expect(await updateOrder({ ...order(), id: r.data.id, version: 1, unitPrice: '10' }, sales())).toMatchObject({ ok: false, code: 'CONFLICT' });
  });

  it('iptal sonrası ödeme eklenemez', async () => {
    const r = await createOrder(order(), sales());
    if (!r.ok) throw new Error('x');
    expect(await cancelOrder({ id: r.data.id, reason: 'Müşteri vazgeçti', version: 1 }, sales())).toMatchObject({ ok: true });
    expect(await addPayment({ orderId: r.data.id, amount: '100', paidAt: '2026-10-18' }, sales())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('ödeme düzeltmesi orijinali silmeden bakiyeyi düzeltir', async () => {
    const r = await createOrder(order(), sales());
    if (!r.ok) throw new Error('x');
    const p = await addPayment({ orderId: r.data.id, amount: '1.000,00', paidAt: '2026-10-18' }, sales());
    if (!p.ok) throw new Error(p.message);
    expect(await correctPayment({ paymentId: p.data.id, amount: '800,00', note: 'Yanlış girildi' }, sales())).toMatchObject({ ok: true });
    const o = await orderForOffice({ id: r.data.id }, sales());
    if (!o.ok) throw new Error('x');
    expect(o.data.payments.map((x) => [x.kind, x.amount.minor])).toEqual([['payment', '100000'], ['correction', '-20000']]);
    expect(o.data.balance.minor).toBe((6416025n - 80000n).toString());
  });

  it('fatura işareti yalnızca faturaya hazır siparişe konur', async () => {
    const r = await createOrder(order(), sales());
    if (!r.ok) throw new Error('x');
    expect(await markInvoiced({ id: r.data.id, invoiceNo: 'ABC2026000000001', invoiceDate: '2026-10-18', version: 1 }, tracking())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    await withCompany(t.companyA, async (tx) => { await markInProduction(tx, r.data.id); await markReadyToInvoice(tx, r.data.id); }, t.db);
    const o = await orderForOffice({ id: r.data.id }, tracking());
    if (!o.ok) throw new Error('x');
    expect(await markInvoiced({ id: r.data.id, invoiceNo: 'ABC2026000000001', invoiceDate: '2026-10-18', version: o.data.version }, tracking())).toMatchObject({ ok: true });
  });
});

describe('atölye görünümü', () => {
  it('bölüm tableti fiyat ve ödemeleri göremez', async () => {
    const r = await createOrder(order(), sales());
    if (!r.ok) throw new Error('x');
    const device = runtime(t, testUser(t.companyA, ['printing'], { kind: 'device' }));
    expect(await orderForOffice({ id: r.data.id }, device)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const w = await orderForWorkshop({ id: r.data.id }, device);
    if (!w.ok) throw new Error(w.message);
    expect(Object.keys(w.data)).not.toEqual(expect.arrayContaining(['unitPrice']));
    expect(JSON.stringify(w.data)).not.toMatch(/unitPrice|total|payments|balance/);
    expect(w.data.departmentNotes).toEqual({ printing: 'Logo ortalı' });
  });

  it('başka firmanın siparişi görünmez', async () => {
    const r = await createOrder(order(), sales());
    if (!r.ok) throw new Error('x');
    expect(await orderForOffice({ id: r.data.id }, runtime(t, testUser(t.companyB, ['sales'])))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('inceleme düzeltmeleri', () => {
  it('tahsilatı olan siparişin para birimi değiştirilemez (liste bozulmasın)', async () => {
    const r = await createOrder({ ...order(), deposit: '100' }, sales());
    if (!r.ok) throw new Error('x');
    const u = await updateOrder({ ...order(), id: r.data.id, version: 1, currency: 'USD', fxRate: '41', fxRateDate: '2026-10-17' }, sales());
    expect(u).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });
});
