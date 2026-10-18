import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { createOrder } from '@/modules/orders/server/actions';
import { addFabricRolls, finishStage, reserveFabric, sendToStage, startProduction, startStage } from '@/modules/production/server/actions';
import { jobDetail, listFabric, materialShortages } from '@/modules/production/server/queries';
import { salesReport } from '@/modules/orders/server/reports';
import { orderLines } from '@/modules/orders/db/schema';
import { withCompany } from '@/core/db/scope';
import { eq } from 'drizzle-orm';

let t: TestDb;
let partyId: string;
let salesId: string;
let operatorId: string;
const tracking = () => runtime(t, testUser(t.companyA, ['tracking']));
const cutter = () => runtime(t, testUser(t.companyA, ['cutting'], { kind: 'device', userId: 'tablet-cutting' }));
// 45×45, biye 5 → kumaş eni 100 cm; 1 bobin → 2222 adet → 2 bobin sap
const kulplu = { width: 45, height: 45, shape: 'Körüksüz', handle: 'Kulplu', handleLength: 60, gsm: 70, rolls: 1, noPrint: true, biye: 5, colour: 'Krem', handleColour: 'Kırmızı' };

async function order(product: Record<string, unknown>) {
  const o = await createOrder({ partyId, salespersonStaffId: salesId, orderDate: '2026-10-18', product, unitPrice: '5', vatRate: '10', currency: 'TRY', packaging: { type: 'none', capacity: 0 } }, runtime(t, testUser(t.companyA, ['sales'])));
  if (!o.ok) throw new Error(JSON.stringify(o));
  return o.data.id;
}

async function version(jobId: string) {
  const d = await jobDetail({ id: jobId }, tracking());
  if (!d.ok) throw new Error(d.message);
  return d.data.version;
}

async function jobAtCutting() {
  const j = await startProduction({ orderId: await order(kulplu) }, tracking());
  if (!j.ok) throw new Error(j.message);
  const jobId = j.data.id;
  const rolls = await addFabricRolls({ widthCm: 100, colour: 'Krem', gsm: 70, metres: 1000, count: 1 }, tracking());
  if (!rolls.ok) throw new Error(rolls.message);
  expect(await reserveFabric({ jobId, rollIds: rolls.data.ids, version: await version(jobId) }, tracking())).toMatchObject({ ok: true });
  expect(await sendToStage({ jobId, stage: 'cutting', version: await version(jobId) }, tracking())).toMatchObject({ ok: true });
  return jobId;
}

beforeAll(async () => {
  t = await createTestDb();
  const admin = runtime(t, testUser(t.companyA, ['admin']));
  const p = await createParty({ kind: 'customer', name: 'Örnek', legalType: 'company' }, admin);
  const s = await createStaff({ name: 'Satışçı', kind: 'sales', departments: ['sales'] }, admin);
  const op = await createStaff({ name: 'Emre Kesim', kind: 'master', departments: ['cutting'] }, admin);
  if (!p.ok || !s.ok || !op.ok) throw new Error('kurulum');
  partyId = p.data.id;
  salesId = s.data.id;
  operatorId = op.data.id;
});
afterAll(async () => { await t.close(); });

describe('sap ayırma ve tüketim', () => {
  it('sap stoğu yoksa kesim başlamaz ve eksik söylenir', async () => {
    const jobId = await jobAtCutting();
    const r = await startStage({ jobId, machine: 'Kesim 1', staffIds: [operatorId], version: await version(jobId) }, cutter());
    expect(r).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    if (!r.ok) expect(r.message).toMatch(/2 bobin 5 cm Kırmızı sap.*boşta 0/);
  });

  it('kesim başlarken sap ayrılır, kesim bitince kumaş ve sap kullanıldı olur', async () => {
    const jobId = await jobAtCutting();
    await addFabricRolls({ widthCm: 5, colour: 'kırmızı', gsm: 80, metres: 1000, count: 3 }, tracking());
    expect(await startStage({ jobId, machine: 'Kesim 1', staffIds: [operatorId], version: await version(jobId) }, cutter())).toMatchObject({ ok: true });
    let d = await jobDetail({ id: jobId }, tracking());
    expect(d.ok && d.data.materials).toEqual([
      { kind: 'fabric', label: 'Kumaş', widthCm: 100, colour: 'Krem', gsm: 70, rolls: 1, reserved: 1, used: 0 },
      { kind: 'handle', label: 'Sap', widthCm: 5, colour: 'Kırmızı', gsm: null, rolls: 2, reserved: 2, used: 0 },
    ]);
    expect(await finishStage({ jobId, good: 2200, cutWaste: 5, version: await version(jobId) }, cutter())).toMatchObject({ ok: true });
    d = await jobDetail({ id: jobId }, tracking());
    expect(d.ok && d.data.materials.map((m) => [m.kind, m.reserved, m.used])).toEqual([['fabric', 0, 1], ['handle', 0, 2]]);
    const free = await listFabric({ status: 'available' }, tracking());
    expect(free.ok && free.data.filter((r) => Number(r.widthCm) === 5)).toHaveLength(1);
  });
});

describe('stok açığı', () => {
  it('üretime alınmamış sipariş ve kumaşı ayrılmamış işin eksik kumaş ve sapı listelenir', async () => {
    await order({ ...kulplu, colour: 'Lacivert', handleColour: 'Sarı', rolls: 2 });
    await addFabricRolls({ widthCm: 100, colour: 'lacivert', gsm: 70, metres: 1000, count: 1 }, tracking());
    await addFabricRolls({ widthCm: 140, colour: 'Lacivert', gsm: 70, metres: 1000, count: 1 }, tracking());
    const r = await materialShortages({}, tracking());
    if (!r.ok) throw new Error(r.message);
    const lacivert = r.data.find((s) => s.kind === 'fabric' && s.colour === 'Lacivert');
    expect(lacivert).toMatchObject({ widthCm: 100, gsm: 70, required: 2, available: 1, missing: 1, canSlit: true });
    expect(r.data.find((s) => s.kind === 'handle' && s.colour === 'Sarı')).toMatchObject({ required: 4, available: 0, missing: 4 });
  });

  it('bölüm tableti stok açığını göremez', async () => {
    expect(await materialShortages({}, cutter())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('malzeme ayırmadan başlatma (inceleme)', () => {
  it('üretim takip bilinçli olarak sapsız başlatabilir ve kayda geçer; bölüm tableti yapamaz', async () => {
    const jobId = await jobAtCutting();
    expect(await startStage({ jobId, machine: 'Kesim 1', staffIds: [operatorId], skipMaterials: true, version: await version(jobId) }, cutter())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await startStage({ jobId, machine: 'Kesim 1', staffIds: [operatorId], skipMaterials: true, version: await version(jobId) }, tracking())).toMatchObject({ ok: true });
    const d = await jobDetail({ id: jobId }, tracking());
    if (!d.ok) throw new Error(d.message);
    expect(d.data.events.find((e) => e.kind === 'started')?.data).toMatchObject({ materialsSkipped: true });
    expect(d.data.materials.find((m) => m.kind === 'handle')).toMatchObject({ reserved: 0 });
  });
});

describe('bozuk ürün kaydı (inceleme)', () => {
  it('tek satırın ürün bilgisi bozuksa stok açığı ve satış raporu yine çalışır', async () => {
    const orderId = await order({ ...kulplu, colour: 'Bordo' });
    await withCompany(t.companyA, (tx) => tx.update(orderLines).set({ product: { width: 'bozuk' } }).where(eq(orderLines.orderId, orderId)), t.db);
    expect(await materialShortages({}, tracking())).toMatchObject({ ok: true });
    expect(await salesReport({ from: '2026-01-01', to: '2026-12-31', groupBy: 'product' }, tracking())).toMatchObject({ ok: true });
  });
});
