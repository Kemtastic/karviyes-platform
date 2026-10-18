import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { testUser } from '../../helpers/runtime';
import type { ActionRuntime } from '@/core/action';
import { parseInstallConfig } from '@/core/install-config';
import { createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { createOrder } from '@/modules/orders/server/actions';
import { approveReview, finishStage, sendToStage, startProduction, startStage } from '@/modules/production/server/actions';
import { jobDetail } from '@/modules/production/server/queries';
import { machineStaffReport } from '@/modules/production/server/reports';

// Plastik poşet kurulumu: aynı üretim modülü, sektör paketi farklı.
const cfg = parseInstallConfig({ company: { name: 'Poşet Firma', slug: 'poset' }, modules: ['orders', 'production'], sector: 'plastic-bags' });
let t: TestDb;
const rt = (roles: Parameters<typeof testUser>[1]): ActionRuntime => ({ user: testUser(t.companyA, roles), db: t.db, cfg });
let jobId = '';

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}
const version = async () => ok(await jobDetail({ id: jobId }, rt(['tracking']))).version;

beforeAll(async () => {
  t = await createTestDb();
  const party = ok(await createParty({ kind: 'customer', name: 'Market Zinciri', legalType: 'company' }, rt(['admin']))).id;
  const s = ok(await createStaff({ name: 'Satışçı', kind: 'sales', departments: ['sales'] }, rt(['admin']))).id;
  const product = { type: 'Atlet', width: 30, height: 50, gusset: 0, micron: 25, material: 'HDPE', printColours: 1, print: 'yeşil', unit: 'kg', amount: 100, tolerancePct: 10 };
  const order = ok(await createOrder({ partyId: party, salespersonStaffId: s, orderDate: '2026-10-10', product, unitPrice: '0,35', vatRate: '20', currency: 'TRY', packaging: { type: 'box', capacity: 1000 } }, rt(['admin'])));
  jobId = ok(await startProduction({ orderId: order.id }, rt(['tracking']))).id;
});
afterAll(async () => { await t.close(); });

describe('plastik poşet üretim akışı', () => {
  it('100 kg sipariş adet hedefine çevrilir; malzeme ayırma gerekmez', async () => {
    const d = ok(await jobDetail({ id: jobId }, rt(['tracking'])));
    expect(d.quantity).toBe(14035);
    expect(d.fabricReserved).toBe(true);
    expect(d.firstStages).toEqual(['slitting']);
  });

  it('baskılı iş baskıyı atlayamaz; ekstrüzyonda kg ve fire kg kaydedilir', async () => {
    expect(await sendToStage({ jobId, stage: 'cutting', version: await version() }, rt(['tracking']))).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    ok(await sendToStage({ jobId, stage: 'slitting', version: await version() }, rt(['tracking'])));
    ok(await startStage({ jobId, machine: 'Ekstrüder 1', staffIds: [], version: await version() }, rt(['slitting'])));
    ok(await finishStage({ jobId, kg: 104.5, wasteKg: 3.2, version: await version() }, rt(['slitting'])));
    expect(ok(await jobDetail({ id: jobId }, rt(['tracking']))).stage).toBe('printing');
  });

  it('baskı → kesim-kaynak → paketleme → kontrol; üretilen adet paketlemede yazılır', async () => {
    ok(await startStage({ jobId, machine: 'Flekso 1', staffIds: [], version: await version() }, rt(['printing'])));
    ok(await finishStage({ jobId, kg: 101, wasteKg: 3.5, version: await version() }, rt(['printing'])));
    ok(await startStage({ jobId, machine: 'Kesim-Kaynak 2', staffIds: [], version: await version() }, rt(['cutting'])));
    ok(await finishStage({ jobId, good: 14000, wasteKg: 2.1, version: await version() }, rt(['cutting'])));
    ok(await startStage({ jobId, machine: 'Paket', staffIds: [], version: await version() }, rt(['finishing'])));
    ok(await finishStage({ jobId, good: 13950, kg: 99.4, sacks: 14, version: await version() }, rt(['finishing'])));
    const d = ok(await jobDetail({ id: jobId }, rt(['tracking'])));
    expect(d).toMatchObject({ stage: 'review', producedQty: 13950 });
    ok(await approveReview({ jobId, version: await version() }, rt(['tracking'])));
  });

  it('raporda fire kg aşamalara göre toplanır', async () => {
    const r = ok(await machineStaffReport({ from: '2026-01-01', to: '2099-12-31' }, rt(['tracking'])));
    expect(r.byJob[0]).toMatchObject({ wasteKg: 8.8, good: 13950 });
    expect(r.byMachine.find((m) => m.key === 'Ekstrüder 1')).toMatchObject({ wasteKg: 3.2 });
  });
});
