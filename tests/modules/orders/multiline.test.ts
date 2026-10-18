import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { addPayment, createOrder, updateOrder } from '@/modules/orders/server/actions';
import { exportOrders, orderForOffice } from '@/modules/orders/server/queries';
import { addFabricRolls, approveReview, cancelJob, finishStage, reserveFabric, sendToStage, startProduction, startStage } from '@/modules/production/server/actions';
import { jobDetail } from '@/modules/production/server/queries';

let t: TestDb;
let partyId: string;
let salesId: string;
let operatorId: string;
const sales = () => runtime(t, testUser(t.companyA, ['sales']));
const tracking = () => runtime(t, testUser(t.companyA, ['tracking']));
const product = (width: number) => ({ width, height: 45, shape: 'Körüksüz', handle: 'El Geçme', gsm: 70, rolls: 1, noPrint: true, biye: 5, colour: 'Beyaz' });
// 1000 × 10 + %10 = 11.000,00 · 500 × 4 + %20 = 2.400,00
const twoLines = () => [
  { product: product(45), quantity: 1000, unitPrice: '10', vatRate: '10', packaging: { type: 'sack', capacity: 500 }, departmentNotes: { cutting: 'Dikkat' } },
  { product: product(30), quantity: 500, unitPrice: '4', vatRate: '20', packaging: { type: 'box', capacity: 250 } },
];
const header = () => ({ partyId, salespersonStaffId: salesId, orderDate: '2026-10-18', currency: 'TRY' });

async function version(jobId: string) {
  const d = await jobDetail({ id: jobId }, tracking());
  if (!d.ok) throw new Error(d.message);
  return d.data.version;
}

beforeAll(async () => {
  t = await createTestDb();
  const admin = runtime(t, testUser(t.companyA, ['admin']));
  const p = await createParty({ kind: 'customer', name: 'Çok Ürünlü', legalType: 'company' }, admin);
  const s = await createStaff({ name: 'Satışçı', kind: 'sales', departments: ['sales'] }, admin);
  const op = await createStaff({ name: 'Usta', kind: 'master', departments: ['cutting', 'finishing'] }, admin);
  if (!p.ok || !s.ok || !op.ok) throw new Error('kurulum');
  partyId = p.data.id;
  salesId = s.data.id;
  operatorId = op.data.id;
});
afterAll(async () => { await t.close(); });

describe('çok ürünlü sipariş', () => {
  it('her satırın kendi tutarı ve KDV oranı; sipariş toplamı satırların toplamı', async () => {
    const r = await createOrder({ ...header(), lines: twoLines() }, sales());
    if (!r.ok) throw new Error(JSON.stringify(r));
    const o = await orderForOffice({ id: r.data.id }, sales());
    if (!o.ok) throw new Error(o.message);
    expect(o.data.lines.map((l) => [l.lineNo, l.quantity, l.total.minor, l.packaging.packages])).toEqual([[1, 1000, '1100000', 2], [2, 500, '240000', 2]]);
    expect(o.data.total).toEqual({ minor: '1340000', currency: 'TRY' });
    expect(o.data.quantity).toBe(1500);
    expect(o.data.lines[0]!.departmentNotes).toEqual({ cutting: 'Dikkat' });
  });

  it('satır hatası satır numarasıyla döner', async () => {
    const lines = twoLines();
    lines[1]!.product = { ...product(30), width: '' } as never;
    const r = await createOrder({ ...header(), lines }, sales());
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION' });
    if (!r.ok) expect(Object.keys(r.fieldErrors ?? {})).toContain('lines.1.product.width');
  });

  it('en çok 20 satır; satırsız sipariş olmaz', async () => {
    const many = Array.from({ length: 21 }, () => twoLines()[0]!);
    expect(await createOrder({ ...header(), lines: many }, sales())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await createOrder({ ...header(), lines: [] }, sales())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await createOrder(header(), sales())).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('taslakta satırlar değiştirilebilir', async () => {
    const r = await createOrder({ ...header(), lines: twoLines() }, sales());
    if (!r.ok) throw new Error('x');
    expect(await updateOrder({ ...header(), id: r.data.id, version: 1, lines: [twoLines()[1]!] }, sales())).toMatchObject({ ok: true });
    const o = await orderForOffice({ id: r.data.id }, sales());
    expect(o.ok && [o.data.lines.length, o.data.total.minor]).toEqual([1, '240000']);
  });
});

describe('satır bazında üretim', () => {
  it('her satır kendi işi; biri bitip diğeri iptal edilince sipariş faturaya hazır ve tutar düşer', async () => {
    const r = await createOrder({ ...header(), lines: twoLines(), deposit: '1.000' }, sales());
    if (!r.ok) throw new Error('x');
    const started = await startProduction({ orderId: r.data.id }, tracking());
    if (!started.ok) throw new Error(started.message);
    expect(started.data.ids).toHaveLength(2);
    const [job1, job2] = started.data.ids as [string, string];
    const d1 = await jobDetail({ id: job1 }, tracking());
    const d2 = await jobDetail({ id: job2 }, tracking());
    expect(d1.ok && d2.ok && [d1.data.no, d2.data.no, d1.data.quantity, d2.data.quantity]).toEqual([`${r.data.no}/1`, `${r.data.no}/2`, 1000, 500]);
    let o = await orderForOffice({ id: r.data.id }, sales());
    expect(o.ok && [o.data.status, o.data.lines.map((l) => l.status)]).toEqual(['in_production', ['in_production', 'in_production']]);
    expect(await startProduction({ orderId: r.data.id }, tracking())).toMatchObject({ ok: false, code: 'INVALID_STATE' });

    const rolls = await addFabricRolls({ widthCm: 100, colour: 'Beyaz', gsm: 70, metres: 1000, count: 1 }, tracking());
    if (!rolls.ok) throw new Error(rolls.message);
    await reserveFabric({ jobId: job1, rollIds: rolls.data.ids, version: await version(job1) }, tracking());
    await sendToStage({ jobId: job1, stage: 'cutting', version: await version(job1) }, tracking());
    await startStage({ jobId: job1, machine: 'K1', staffIds: [operatorId], version: await version(job1) }, tracking());
    await finishStage({ jobId: job1, good: 1000, cutWaste: 0, version: await version(job1) }, tracking());
    await startStage({ jobId: job1, machine: 'M1', staffIds: [operatorId], version: await version(job1) }, tracking());
    await finishStage({ jobId: job1, good: 990, cutWaste: 10, version: await version(job1) }, tracking());
    expect(await approveReview({ jobId: job1, version: await version(job1) }, tracking())).toMatchObject({ ok: true });

    o = await orderForOffice({ id: r.data.id }, sales());
    expect(o.ok && [o.data.status, o.data.producedQty]).toEqual(['in_production', 990]);

    expect(await cancelJob({ jobId: job2, reason: 'Müşteri ikinci ürünü istemedi', version: await version(job2) }, tracking())).toMatchObject({ ok: true });
    o = await orderForOffice({ id: r.data.id }, sales());
    if (!o.ok) throw new Error(o.message);
    expect([o.data.status, o.data.lines.map((l) => l.status), o.data.total.minor, o.data.balance.minor]).toEqual(['ready_to_invoice', ['done', 'cancelled'], '1100000', '1000000']);
    expect(await addPayment({ orderId: r.data.id, amount: '10.000' }, sales())).toMatchObject({ ok: true });
  });
});

describe('inceleme düzeltmeleri (çok satır)', () => {
  it('son satır üretimden iptal edilince siparişin iptal nedeni yazılır', async () => {
    const r = await createOrder({ ...header(), lines: [twoLines()[0]!] }, sales());
    if (!r.ok) throw new Error('x');
    const started = await startProduction({ orderId: r.data.id }, tracking());
    if (!started.ok) throw new Error(started.message);
    await cancelJob({ jobId: started.data.id, reason: 'Müşteri vazgeçti', version: await version(started.data.id) }, tracking());
    const o = await orderForOffice({ id: r.data.id }, sales());
    expect(o.ok && [o.data.status, o.data.cancelReason]).toEqual(['cancelled', 'Müşteri vazgeçti']);
  });

  it('iptal edilen satırın adedi sipariş adedine girmez', async () => {
    const r = await createOrder({ ...header(), lines: twoLines() }, sales());
    if (!r.ok) throw new Error('x');
    const started = await startProduction({ orderId: r.data.id }, tracking());
    if (!started.ok) throw new Error(started.message);
    await cancelJob({ jobId: started.data.ids[1]!, reason: 'İkinci ürün iptal', version: await version(started.data.ids[1]!) }, tracking());
    const o = await orderForOffice({ id: r.data.id }, sales());
    expect(o.ok && o.data.quantity).toBe(1000);
    // Excel: iptal satırının tutarı toplama girmez ve satır durumu görünür.
    const ex = await exportOrders({}, sales());
    if (!ex.ok) throw new Error(ex.message);
    const mine = ex.data.rows.filter((row) => row[0] === r.data.no).map((row) => Object.fromEntries(ex.data.headers.map((h, i) => [h, row[i]])));
    expect(mine.map((m) => [m.Satır, m['Satır durumu'], m.Toplam])).toEqual([[1, 'Üretimde', '11000,00'], [2, 'İptal', '0,00']]);
  });
});
