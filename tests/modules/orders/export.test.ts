import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { withCompany } from '@/core/db/scope';
import { auditLog } from '@/core/db/schema';
import { createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { addPayment, createOrder } from '@/modules/orders/server/actions';
import { exportOrders } from '@/modules/orders/server/queries';

let t: TestDb;
const sales = () => runtime(t, testUser(t.companyA, ['sales']));

beforeAll(async () => {
  t = await createTestDb();
  const admin = runtime(t, testUser(t.companyA, ['admin']));
  const p = await createParty({ kind: 'customer', name: 'Örnek Gıda', legalType: 'company', contactName: 'Ayşe Kaya' }, admin);
  const s = await createStaff({ name: 'Ali Satış', kind: 'sales', departments: ['sales'] }, admin);
  if (!p.ok || !s.ok) throw new Error('kurulum');
  const o = await createOrder({ partyId: p.data.id, salespersonStaffId: s.data.id, orderDate: '2026-10-18', product: { width: 45, height: 45, shape: 'Körüksüz', handle: 'El Geçme', gsm: 70, rolls: 1, noPrint: true, biye: 5, colour: 'Krem' }, quantity: 1000, unitPrice: '10,5', vatRate: '20', currency: 'TRY', packaging: { type: 'none', capacity: 0 } }, sales());
  if (!o.ok) throw new Error(o.message);
  await addPayment({ orderId: o.data.id, amount: '600' }, sales());
});
afterAll(async () => { await t.close(); });

describe('sipariş dışa aktarımı', () => {
  it('başlıklar sektör alanlarından; tutarlar Türkçe ondalıkla; tarih GG.AA.YYYY', async () => {
    const r = await exportOrders({}, sales());
    if (!r.ok) throw new Error(r.message);
    const { headers, rows } = r.data;
    const row = Object.fromEntries(headers.map((h, i) => [h, rows[0]![i]]));
    expect(row).toMatchObject({
      'Sipariş No': expect.stringMatching(/^S-2026-/), Tarih: '18.10.2026', Müşteri: 'Örnek Gıda', Yetkili: 'Ayşe Kaya', Satışçı: 'Ali Satış',
      'En (cm)': 45, 'Kumaş rengi': 'Krem', 'Kumaş eni (cm)': 100, Adet: 1000, 'Birim fiyat': '10,5000', 'KDV %': '20,00', 'Para birimi': 'TRY',
      Toplam: '12600,00', Tahsilat: '600,00', Kalan: '12000,00', Durum: 'Yeni sipariş',
    });
  });

  it('dışa aktarım denetim kaydına yazılır', async () => {
    await exportOrders({}, sales());
    const logs = await withCompany(t.companyA, (tx) => tx.select().from(auditLog).where(eq(auditLog.action, 'orders.export')), t.db);
    expect(logs.length).toBeGreaterThan(0);
  });

  it('bölüm tableti dışa aktaramaz', async () => {
    expect(await exportOrders({}, runtime(t, testUser(t.companyA, ['cutting'], { kind: 'device' })))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
