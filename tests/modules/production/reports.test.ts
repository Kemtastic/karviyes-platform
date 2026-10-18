import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { withCompany } from '@/core/db/scope';
import { createStaff } from '@/core/users/service';
import { jobEvents } from '@/modules/production/db/schema';
import { machineStaffReport } from '@/modules/production/server/reports';
import { createParty } from '@/core/parties/service';
import { createOrder } from '@/modules/orders/server/actions';
import { startProduction } from '@/modules/production/server/actions';

let t: TestDb;
let printer: string;
let cutter: string;
let jobId: string;

beforeAll(async () => {
  t = await createTestDb();
  const admin = runtime(t, testUser(t.companyA, ['admin', 'tracking', 'sales']));
  const p = await createStaff({ name: 'Zeynep Baskı', kind: 'operator', departments: ['printing'] }, admin);
  const c = await createStaff({ name: 'Emre Kesim', kind: 'master', departments: ['cutting'] }, admin);
  const s = await createStaff({ name: 'Satışçı', kind: 'sales', departments: ['sales'] }, admin);
  const party = await createParty({ kind: 'customer', name: 'Rapor Müşterisi', legalType: 'company' }, admin);
  if (!p.ok || !c.ok || !s.ok || !party.ok) throw new Error('kurulum');
  printer = p.data.id;
  cutter = c.data.id;
  const order = await createOrder({ partyId: party.data.id, salespersonStaffId: s.data.id, orderDate: '2026-10-18', product: { width: 45, height: 45, shape: 'Körüksüz', handle: 'El Geçme', gsm: 70, rolls: 1, noPrint: true, biye: 5 }, unitPrice: '5', vatRate: '10', currency: 'TRY', packaging: { type: 'sack', capacity: 1000 } }, admin);
  if (!order.ok) throw new Error(order.message);
  const job = await startProduction({ orderId: order.data.id }, admin);
  if (!job.ok) throw new Error(job.message);
  jobId = job.data.id;
  await withCompany(t.companyA, (tx) => tx.insert(jobEvents).values([
    // 18 Ekim 10:00 İstanbul
    { companyId: t.companyA, jobId, stage: 'printing', kind: 'finished', userId: 'u', staffIds: [printer], machine: 'Baskı 1', data: { printWaste: 30, cutWaste: 0 }, at: new Date('2026-10-18T07:00:00Z') },
    // Kesimde yanlışlıkla baskı firesi girilmiş: kesim makinesine baskı firesi yazılmamalı
    { companyId: t.companyA, jobId, stage: 'cutting', kind: 'finished', userId: 'u', staffIds: [cutter], machine: 'Kesim 1', data: { good: 2200, cutWaste: 10, printWaste: 5 }, at: new Date('2026-10-18T09:00:00Z') },
    // 19 Ekim 01:00 İstanbul (UTC'de hâlâ 18 Ekim): 18 Ekim raporuna girmemeli
    { companyId: t.companyA, jobId, stage: 'cutting', kind: 'finished', userId: 'u', staffIds: [cutter], machine: 'Kesim 1', data: { good: 100, cutWaste: 1 }, at: new Date('2026-10-18T22:00:00Z') },
    { companyId: t.companyA, jobId, stage: 'cutting', kind: 'started', userId: 'u', staffIds: [cutter], machine: 'Kesim 1', data: {}, at: new Date('2026-10-18T08:00:00Z') },
  ]), t.db);
});
afterAll(async () => { await t.close(); });

describe('makine ve personel raporu', () => {
  it('fire yalnızca kendi aşamasındaki makine ve personele yazılır; gün İstanbul saatiyle', async () => {
    const r = await machineStaffReport({ from: '2026-10-18', to: '2026-10-18' }, runtime(t, testUser(t.companyA, ['tracking'])));
    if (!r.ok) throw new Error(r.message);
    expect(r.data.byMachine).toEqual([
      { key: 'Baskı 1', stage: 'printing', jobs: 1, good: 0, cutWaste: 0, printWaste: 30, wasteKg: 0 },
      { key: 'Kesim 1', stage: 'cutting', jobs: 1, good: 2200, cutWaste: 10, printWaste: 0, wasteKg: 0 },
    ]);
    expect(r.data.byStaff).toEqual([
      { key: 'Emre Kesim', stage: 'cutting', jobs: 1, good: 2200, cutWaste: 10, printWaste: 0, wasteKg: 0 },
      { key: 'Zeynep Baskı', stage: 'printing', jobs: 1, good: 0, cutWaste: 0, printWaste: 30, wasteKg: 0 },
    ]);
  });

  it('iş özeti: hedef, son sağlam adet, kesim firesi (adet), baskı firesi (metre) ve fire oranı', async () => {
    const r = await machineStaffReport({ from: '2026-10-18', to: '2026-10-18' }, runtime(t, testUser(t.companyA, ['tracking'])));
    if (!r.ok) throw new Error(r.message);
    expect(r.data.byJob).toEqual([
      { jobId, jobNo: expect.stringMatching(/\/1$/), partyName: 'Rapor Müşterisi', target: 2222, good: 2200, cutWaste: 10, printWaste: 30, wasteKg: 0, wasteRate: '0.45' },
    ]);
  });

  it('satışçı raporu göremez', async () => {
    expect(await machineStaffReport({ from: '2026-10-18', to: '2026-10-18' }, runtime(t, testUser(t.companyA, ['sales'])))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
