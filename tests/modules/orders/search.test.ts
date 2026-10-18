import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testUser } from '../../helpers/runtime';
import { createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { createOrder } from '@/modules/orders/server/actions';
import { listOrders, lastOrderLines } from '@/modules/orders/server/queries';

let t: TestDb;
const nos: Record<string, string> = {};
let ozgur: string;
const sales = () => runtime(t, testUser(t.companyA, ['sales']));
const product = { width: 45, height: 45, shape: 'Körüksüz', handle: 'El Geçme', gsm: 70, rolls: 1, noPrint: true, biye: 5, colour: 'Krem' };

beforeAll(async () => {
  t = await createTestDb();
  const admin = runtime(t, testUser(t.companyA, ['admin']));
  const a = await createParty({ kind: 'customer', name: 'Özgür İçecek A.Ş.', legalType: 'company' }, admin);
  const b = await createParty({ kind: 'customer', name: 'Deniz Tekstil', legalType: 'company' }, admin);
  const s = await createStaff({ name: 'Satışçı', kind: 'sales', departments: ['sales'] }, admin);
  if (!a.ok || !b.ok || !s.ok) throw new Error('kurulum');
  ozgur = a.data.id;
  const order = (partyId: string, orderDate: string, unitPrice: string) => ({ partyId, salespersonStaffId: s.data.id, orderDate, product, unitPrice, vatRate: '10', currency: 'TRY', packaging: { type: 'none', capacity: 0 } });
  for (const [key, partyId, date, price] of [['eylul', a.data.id, '2026-09-15', '4'], ['ekim', a.data.id, '2026-10-10', '5'], ['deniz', b.data.id, '2026-10-12', '6']] as const) {
    const r = await createOrder(order(partyId, date, price), sales());
    if (!r.ok) throw new Error(r.message);
    nos[key] = r.data.no;
  }
});
afterAll(async () => { await t.close(); });

describe('sipariş arama', () => {
  const found = async (input: Record<string, unknown>) => {
    const r = await listOrders(input, sales());
    if (!r.ok) throw new Error(r.message);
    return r.data.map((o) => o.no).sort();
  };

  it('müşteri adında Türkçe harf ve büyük/küçük harf farkı aramayı bozmaz', async () => {
    expect(await found({ q: 'ozgur icecek' })).toEqual([nos.ekim, nos.eylul].sort());
    expect(await found({ q: 'ÖZGÜR' })).toEqual([nos.ekim, nos.eylul].sort());
  });

  it('sipariş numarasıyla (son haneler yeterli)', async () => {
    expect(await found({ q: nos.deniz!.slice(-3) })).toEqual([nos.deniz]);
  });

  it('tarih aralığı', async () => {
    // Harf/rakam kalmayan arama her şeyi döndürmemeli.
    expect(await found({ q: '.' })).toEqual([]);
    expect(await found({ from: '2026-10-01', to: '2026-10-31' })).toEqual([nos.ekim, nos.deniz].sort());
    expect(await found({ from: '2026-10-11' })).toEqual([nos.deniz]);
  });
});

describe('eski siparişten kopyala', () => {
  it('müşterinin son siparişinin satırları (fiyatlarıyla) gelir', async () => {
    const r = await lastOrderLines({ partyId: ozgur }, sales());
    if (!r.ok) throw new Error(r.message);
    expect(r.data).toMatchObject({ no: nos.ekim, lines: [{ unitPrice: '5.0000', vatRate: '10.00', product: { colour: 'Krem' }, plateId: null }] });
  });

  it('siparişi olmayan müşteride boş döner', async () => {
    const admin = runtime(t, testUser(t.companyA, ['admin']));
    const p = await createParty({ kind: 'customer', name: 'Yeni Müşteri', legalType: 'company' }, admin);
    if (!p.ok) throw new Error('x');
    expect(await lastOrderLines({ partyId: p.data.id }, sales())).toMatchObject({ ok: true, data: null });
  });
});
