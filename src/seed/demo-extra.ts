// Demo ekranlarının dolu görünmesi için ek hayali veri: tedarikçiler, çok ürünlü siparişler, tahsilatlar,
// klişeler, renkli kumaş ve sap stoğu, satış görüşmeleri. Gerçek kişi/firma verisi içermez.
import type { ActionResult, ActionRuntime } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { withCompany } from '@/core/db/scope';
import { createParty } from '@/core/parties/service';
import { addPayment, createOrder } from '@/modules/orders/server/actions';
import * as production from '@/modules/production/server/actions';
import { createPlate } from '@/modules/production/server/plates';
import { salesCalls } from '@/modules/sales/db/schema';
import { setResponsible } from '@/modules/sales/server/actions';

type Ctx = {
  rt: ActionRuntime;
  companyId: string;
  partyIds: Map<string, string>;
  salesIds: string[];
  orderIds: string[];
  suppliers: { firma: string; tedarik: string }[];
};

function ok<T>(r: ActionResult<T>, what: string): T {
  if (!r.ok) throw new Error(`Örnek veri (${what}): ${r.message} ${JSON.stringify(r.fieldErrors ?? {})}`);
  return r.data;
}

function shift(days: number): string {
  const d = new Date(`${istanbulToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const bag = (width: number, height: number, extra: Record<string, unknown> = {}) => ({
  width, height, gusset: 0, shape: 'Körüksüz', handle: 'El Geçme', gsm: 70, colour: 'Beyaz', print: 'siyah', rolls: 1, biye: 5, ...extra,
});

const NOTES = [
  ['Yeni sezon fiyat listesini istedi, e-postayla gönderildi.', 3],
  ['Numune beğenildi; 5.000 adetlik sipariş için onay bekleniyor.', 0],
  ['Ödeme planını konuştuk, ay sonunda kalan bakiyeyi kapatacak.', 7],
  ['Fuar öncesi baskılı çanta talebi var; logo dosyası gelecek.', 0],
  ['Rakip teklif almışlar; birim fiyatta %3 indirim istediler.', 14],
  ['Teslimat tarihini teyit ettik, memnunlar.', 30],
] as const;

export async function seedDemoExtras({ rt, companyId, partyIds, salesIds, orderIds, suppliers }: Ctx): Promise<void> {
  // Tedarikçiler
  for (const [i, s] of suppliers.entries()) {
    ok(await createParty({ kind: 'supplier', name: s.firma, legalType: 'company', city: 'İstanbul', contactName: 'Satış Birimi', phone: `0555 100 0${i} 00`, email: `satis0${i}@example.com`, notes: s.tedarik }, rt), 'tedarikçi');
  }

  const customers = [...partyIds.entries()];

  // Tahsilatlar: kimi siparişte kısmi, kiminde tamamı.
  for (const [i, orderId] of orderIds.entries()) {
    if (i % 4 === 1) ok(await addPayment({ orderId, amount: '5.000,00', paidAt: shift(-20 + i), note: 'Havale' }, rt), 'tahsilat');
    if (i % 5 === 2) ok(await addPayment({ orderId, amount: '12.500,00', paidAt: shift(-10 + i), note: 'Çek' }, rt), 'tahsilat');
  }

  // Çok ürünlü siparişler
  const multi: [number, Parameters<typeof bag>[2][]][] = [
    [1, [{ colour: 'Krem', print: 'lacivert' }, { colour: 'Lacivert', print: 'beyaz', handle: 'Kulplu', handleLength: 60, handleColour: 'Lacivert' }]],
    [4, [{ colour: 'Siyah', print: 'altın' }, { colour: 'Beyaz', print: 'kırmızı · siyah' }, { colour: 'Kırmızı', print: 'beyaz', shape: 'Alt Körüklü', gusset: 10 }]],
    [7, [{ colour: 'Yeşil', print: 'beyaz', gsm: 80 }, { colour: 'Bej', noPrint: true, print: '' }]],
  ];
  for (const [n, products] of multi) {
    const [, partyId] = customers[n % customers.length]!;
    ok(
      await createOrder({
        partyId, salespersonStaffId: salesIds[n % salesIds.length]!, orderDate: shift(-n), currency: 'TRY', deposit: n === 4 ? '10.000,00' : '',
        lines: products.map((extra, k) => ({
          product: bag(35 + k * 5, 45 + k * 5, extra), quantity: 2500 + k * 1500, unitPrice: String(6.5 + k), vatRate: '10',
          packaging: { type: k % 2 ? 'box' : 'sack', capacity: k % 2 ? 250 : 2000 }, departmentNotes: k === 0 ? { printing: 'Logo ortalı, 2 cm üst boşluk' } : {},
        })),
      }, rt),
      'çok ürünlü sipariş',
    );
  }

  // Klişeler
  for (const [i, [name, partyId]] of customers.slice(0, 6).entries()) {
    ok(await createPlate({ partyId, name: `${name.split(' ')[0]} logo ${i % 2 ? 'arka yüz' : 'ön yüz'}`, colours: ['siyah', 'kırmızı · siyah', 'lacivert', 'yeşil · beyaz'][i % 4]!, notes: i % 3 ? '' : 'Rafta 3. bölmede' }, rt), 'klişe');
  }

  // Renkli kumaş ve sap stoğu
  for (const [colour, width, gsm, count] of [['Siyah', 120, 80, 4], ['Lacivert', 147, 60, 3], ['Kırmızı', 135, 70, 3], ['Yeşil', 132, 70, 2], ['Bej', 110, 70, 2], ['Siyah', 5, 80, 6], ['Lacivert', 5, 80, 4]] as const) {
    ok(await production.addFabricRolls({ widthCm: width, colour, gsm, metres: 1000, count }, rt), 'kumaş');
  }

  // Satış görüşmeleri: sorumlu, geçmiş görüşmeler (geciken dahil) ve sonraki arama tarihleri.
  // Geçmiş tarihli kayıt kuralı (sonraki tarih bugünden önce olamaz) yalnızca kullanıcı girişi içindir; demo için doğrudan yazılır.
  for (const [i, [, partyId]] of customers.entries()) {
    ok(await setResponsible({ partyId, staffId: salesIds[i % salesIds.length]! }, rt), 'sorumlu');
    const [note, nextIn] = NOTES[i % NOTES.length]!;
    const next = i % 5 === 3 ? shift(-2) : shift(nextIn);
    await withCompany(
      companyId,
      (tx) =>
        tx.insert(salesCalls).values([
          { companyId, partyId, at: new Date(Date.now() - (20 + i) * 86400000), note: 'İlk tanışma görüşmesi; ürün kataloğu iletildi.', nextDate: shift(-10 + i), createdBy: rt.user!.userId },
          { companyId, partyId, at: new Date(Date.now() - (i + 1) * 3600000 * 6), note, nextDate: next, createdBy: rt.user!.userId },
        ]),
      rt.db,
    );
  }
}
