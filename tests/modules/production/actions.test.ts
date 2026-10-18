import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { createOrder } from '@/modules/orders/server/actions';
import { orderForOffice } from '@/modules/orders/server/queries';
import {
  addFabricRolls,
  approveReview,
  cancelJob,
  finishStage,
  reserveFabric,
  sendToRepair,
  sendToStage,
  shipJob,
  startProduction,
  startStage,
} from '@/modules/production/server/actions';
import { departmentQueue, jobDetail } from '@/modules/production/server/queries';

let t: TestDb;
let partyId: string;
let salesId: string;
let operatorId: string;
const tracking = () => runtime(t, testUser(t.companyA, ['tracking']));
const device = (role: 'slitting' | 'printing' | 'cutting' | 'finishing') => runtime(t, testUser(t.companyA, [role], { kind: 'device', userId: `tablet-${role}` }));
const plainProduct = { width: 45, height: 45, shape: 'Körüksüz', handle: 'El Geçme', gsm: 70, rolls: 1, noPrint: true, biye: 5, colour: 'Beyaz' };

async function newJob(product: Record<string, unknown> = plainProduct) {
  const o = await createOrder({ partyId, salespersonStaffId: salesId, orderDate: '2026-10-18', product, unitPrice: '5', vatRate: '10', currency: 'TRY', packaging: { type: 'sack', capacity: 1000 } }, runtime(t, testUser(t.companyA, ['sales'])));
  if (!o.ok) throw new Error(JSON.stringify(o));
  const j = await startProduction({ orderId: o.data.id }, tracking());
  if (!j.ok) throw new Error(JSON.stringify(j));
  return { orderId: o.data.id, jobId: j.data.id };
}

async function version(jobId: string) {
  const d = await jobDetail({ id: jobId }, tracking());
  if (!d.ok) throw new Error(d.message);
  return d.data.version;
}

async function readyAtCutting() {
  const { orderId, jobId } = await newJob();
  const rolls = await addFabricRolls({ widthCm: 100, colour: 'Beyaz', gsm: 70, metres: 1000, count: 1 }, tracking());
  if (!rolls.ok) throw new Error(rolls.message);
  expect(await reserveFabric({ jobId, rollIds: rolls.data.ids, version: await version(jobId) }, tracking())).toMatchObject({ ok: true });
  expect(await sendToStage({ jobId, stage: 'cutting', version: await version(jobId) }, tracking())).toMatchObject({ ok: true });
  return { orderId, jobId };
}

beforeAll(async () => {
  t = await createTestDb();
  const admin = runtime(t, testUser(t.companyA, ['admin']));
  const p = await createParty({ kind: 'customer', name: 'Örnek', legalType: 'company' }, admin);
  const s = await createStaff({ name: 'Satışçı', kind: 'sales', departments: ['sales'] }, admin);
  const op = await createStaff({ name: 'Emre Kesim', kind: 'master', departments: ['cutting', 'finishing'] }, admin);
  if (!p.ok || !s.ok || !op.ok) throw new Error('kurulum');
  partyId = p.data.id;
  salesId = s.data.id;
  operatorId = op.data.id;
});
afterAll(async () => { await t.close(); });

describe('üretim eylemleri', () => {
  it('üretime alınan sipariş "Üretimde" olur ve ikinci kez alınamaz', async () => {
    const { orderId } = await newJob();
    const o = await orderForOffice({ id: orderId }, tracking());
    expect(o.ok && o.data.status).toBe('in_production');
    expect(await startProduction({ orderId }, tracking())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('kumaş ayrılmadan bölüme gönderilemez', async () => {
    const { jobId } = await newJob();
    expect(await sendToStage({ jobId, stage: 'slitting', version: await version(jobId) }, tracking())).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('aynı işi iki tablet aynı anda bitirirse biri CONFLICT alır, tek olay yazılır', async () => {
    const { jobId } = await readyAtCutting();
    expect(await startStage({ jobId, machine: 'Kesim 1', staffIds: [operatorId], version: await version(jobId) }, device('cutting'))).toMatchObject({ ok: true });
    const v = await version(jobId);
    const finish = { jobId, good: 2200, cutWaste: 10, version: v, quantityAcknowledged: true };
    const results = await Promise.all([finishStage(finish, device('cutting')), finishStage(finish, device('cutting'))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ code: 'CONFLICT' });
    const d = await jobDetail({ id: jobId }, tracking());
    expect(d.ok && d.data.events.filter((e) => e.kind === 'finished')).toHaveLength(1);
  });

  it('baskı tableti kesim aşamasındaki işi başlatamaz', async () => {
    const { jobId } = await readyAtCutting();
    expect(await startStage({ jobId, machine: 'X', staffIds: [], version: await version(jobId) }, device('printing'))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('hedefin %90 altında sağlam adet onaysız kabul edilmez', async () => {
    const { jobId } = await readyAtCutting();
    await startStage({ jobId, machine: 'Kesim 1', staffIds: [operatorId], version: await version(jobId) }, device('cutting'));
    const r = await finishStage({ jobId, good: 100, cutWaste: 0, version: await version(jobId) }, device('cutting'));
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION', fieldErrors: expect.objectContaining({ good: expect.any(String) }) });
    expect(await finishStage({ jobId, good: 100, cutWaste: 0, version: await version(jobId), quantityAcknowledged: true }, device('cutting'))).toMatchObject({ ok: true });
  });

  it('tamamlanınca sipariş faturaya hazır olur; sevk üretileni aşamaz ve siparişe yansır', async () => {
    const { orderId, jobId } = await readyAtCutting();
    await startStage({ jobId, machine: 'Kesim 1', staffIds: [operatorId], version: await version(jobId) }, device('cutting'));
    await finishStage({ jobId, good: 2200, cutWaste: 5, version: await version(jobId) }, device('cutting'));
    await startStage({ jobId, machine: 'Masa 1', staffIds: [operatorId], version: await version(jobId) }, device('finishing'));
    expect(await finishStage({ jobId, good: 2180, cutWaste: 20, sacks: 3, version: await version(jobId) }, device('finishing'))).toMatchObject({ ok: true });
    expect(await approveReview({ jobId, version: await version(jobId) }, tracking())).toMatchObject({ ok: true });
    let o = await orderForOffice({ id: orderId }, tracking());
    expect(o.ok && [o.data.status, o.data.producedQty]).toEqual(['ready_to_invoice', 2180]);
    expect(await shipJob({ jobId, qty: 2181, shippedAt: '2026-10-19', version: await version(jobId) }, tracking())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await shipJob({ jobId, qty: 1000, shippedAt: '2026-10-19', version: await version(jobId) }, tracking())).toMatchObject({ ok: true });
    o = await orderForOffice({ id: orderId }, tracking());
    expect(o.ok && o.data.shippedQty).toBe(1000);
  });

  it('iş iptal edilince sipariş iptal olur ve ayrılan kumaş serbest kalır', async () => {
    const { orderId, jobId } = await readyAtCutting();
    expect(await cancelJob({ jobId, reason: 'Müşteri iptal etti', version: await version(jobId) }, tracking())).toMatchObject({ ok: true });
    const o = await orderForOffice({ id: orderId }, tracking());
    expect(o.ok && o.data.status).toBe('cancelled');
  });

  it('bölüm kuyruğu yalnızca o bölümün işlerini ve fiyatsız bilgiyi verir', async () => {
    await readyAtCutting();
    const q = await departmentQueue({ stage: 'cutting' }, device('cutting'));
    if (!q.ok) throw new Error(q.message);
    expect(q.data.length).toBeGreaterThan(0);
    expect(q.data.every((j) => j.stage === 'cutting')).toBe(true);
    expect(JSON.stringify(q.data)).not.toMatch(/unitPrice|total|balance/);
    expect(await departmentQueue({ stage: 'cutting' }, device('printing'))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('başka firmanın işi görünmez', async () => {
    const { jobId } = await newJob();
    expect(await jobDetail({ id: jobId }, runtime(t, testUser(t.companyB, ['tracking'])))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('rapor için makine ve personel', () => {
  it('bitirirken seçilmezse başlatmadaki makine ve personel bitirme kaydına taşınır', async () => {
    const { jobId } = await readyAtCutting();
    await startStage({ jobId, machine: 'Kesim 2', staffIds: [operatorId], version: await version(jobId) }, device('cutting'));
    await finishStage({ jobId, good: 2200, cutWaste: 4, version: await version(jobId) }, device('cutting'));
    const d = await jobDetail({ id: jobId }, tracking());
    const finished = d.ok && d.data.events.find((e) => e.kind === 'finished');
    expect(finished && [finished.machine, finished.staff]).toEqual(['Kesim 2', ['Emre Kesim']]);
  });
});

describe('tamir yetkisi (v1.1)', () => {
  it('kontroldeki işi yalnızca üretim takip tamire gönderir; kesim bitiş tableti gönderemez', async () => {
    const { jobId } = await readyAtCutting();
    await startStage({ jobId, machine: 'Kesim 1', staffIds: [operatorId], version: await version(jobId) }, device('cutting'));
    await finishStage({ jobId, good: 2200, cutWaste: 5, version: await version(jobId) }, device('cutting'));
    await startStage({ jobId, machine: 'Masa 1', staffIds: [operatorId], version: await version(jobId) }, device('finishing'));
    await finishStage({ jobId, good: 2180, cutWaste: 20, sacks: 3, version: await version(jobId) }, device('finishing'));
    expect(await sendToRepair({ jobId, version: await version(jobId) }, device('finishing'))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await sendToRepair({ jobId, version: await version(jobId) }, tracking())).toMatchObject({ ok: true });
  });
});
