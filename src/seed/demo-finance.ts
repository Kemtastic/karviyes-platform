// Ön muhasebe demo verisi: kasa/banka, fatura kayıtları (bir kısmı vadesi geçmiş), tahsilat ve ödemeler,
// masraflar, virman, açılış bakiyesi ve çekler. Tutarlar ve firmalar hayalidir.
import type { ActionResult, ActionRuntime } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { searchParties } from '@/core/parties/service';
import * as fin from '@/modules/finance/server/actions';
import * as rec from '@/modules/finance/server/reconciliation';

function ok<T>(r: ActionResult<T>, what: string): T {
  if (!r.ok) throw new Error(`Örnek veri (${what}): ${r.message} ${JSON.stringify(r.fieldErrors ?? {})}`);
  return r.data;
}

function shift(days: number): string {
  const d = new Date(`${istanbulToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const tl = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function seedDemoFinance(rt: ActionRuntime): Promise<void> {
  if (!rt.cfg.modules.includes('finance')) return;
  const customers = ok(await searchParties({ kind: 'customer', limit: 50 }, rt), 'müşteriler').filter((p) => p.kind === 'customer');
  const suppliers = ok(await searchParties({ kind: 'supplier', limit: 50 }, rt), 'tedarikçiler').filter((p) => p.kind === 'supplier');
  if (!customers.length || !suppliers.length) return;

  const yearStart = `${istanbulToday().slice(0, 4)}-01-01`;
  const kasa = ok(await fin.createAccount({ kind: 'cash', name: 'Merkez kasa', currency: 'TRY', opening: '18.500,00', openingDate: yearStart }, rt), 'kasa').id;
  const ziraat = ok(await fin.createAccount({ kind: 'bank', name: 'Ziraat TL', currency: 'TRY', opening: '245.300,00', openingDate: yearStart, bank: 'Ziraat Bankası', iban: 'TR330006100519786457841326' }, rt), 'banka').id;
  const garanti = ok(await fin.createAccount({ kind: 'bank', name: 'Garanti TL', currency: 'TRY', opening: '62.000,00', openingDate: yearStart, bank: 'Garanti BBVA' }, rt), 'banka').id;
  ok(await fin.createAccount({ kind: 'bank', name: 'Garanti USD', currency: 'USD', opening: '4.250,00', openingDate: yearStart, bank: 'Garanti BBVA' }, rt), 'döviz');

  // Satış faturaları: müşteri başına 1–2 fatura; eski olanların vadesi geçmiş.
  let no = 1;
  const docNo = () => `KRV${istanbulToday().slice(0, 4)}${String(no++).padStart(9, '0')}`;
  for (const [i, c] of customers.slice(0, 8).entries()) {
    const base = 18000 + i * 7350;
    ok(await fin.recordInvoice({ kind: 'sales', partyId: c.id, docNo: docNo(), date: shift(-75 + i * 3), due: shift(-45 + i * 3), currency: 'TRY', base: tl(base), vatRate: 20 }, rt), 'satış faturası');
    if (i % 2 === 0) ok(await fin.recordInvoice({ kind: 'sales', partyId: c.id, docNo: docNo(), date: shift(-20 + i), due: shift(10 + i * 2), currency: 'TRY', base: tl(base * 0.6), vatRate: 20 }, rt), 'satış faturası');
    // Tahsilatlar: kimi tamamını, kimi bir kısmını ödemiş.
    const paid = i % 3 === 0 ? base * 1.2 : i % 3 === 1 ? base * 0.5 : 0;
    if (paid) ok(await fin.recordPayment({ kind: 'collection', partyId: c.id, accountId: i % 2 ? garanti : ziraat, amount: tl(paid), date: shift(-40 + i * 2), note: 'Havale/EFT' }, rt), 'tahsilat');
  }
  ok(await fin.recordPayment({ kind: 'collection', partyId: customers[1]!.id, accountId: kasa, amount: '7.500,00', date: shift(-6), note: 'Elden nakit' }, rt), 'tahsilat');

  // Alış faturaları ve ödemeler.
  for (const [i, s] of suppliers.entries()) {
    const base = 42000 + i * 15800;
    ok(await fin.recordInvoice({ kind: 'purchase', partyId: s.id, docNo: `TED-${2400 + i * 13}`, date: shift(-50 + i * 5), due: shift(-20 + i * 12), currency: 'TRY', base: tl(base), vatRate: 20, withholding: i === 1 ? 5 : 0 }, rt), 'alış faturası');
    if (i !== 2) ok(await fin.recordPayment({ kind: 'payment', partyId: s.id, accountId: ziraat, amount: tl(base * (i === 0 ? 1.2 : 0.7)), date: shift(-25 + i * 4), note: 'Kumaş / malzeme ödemesi' }, rt), 'ödeme');
  }
  if (customers[9]) ok(await fin.setOpening({ partyId: customers[9].id, currency: 'TRY', amount: '14.250,00', side: 'debit', date: yearStart }, rt), 'açılış');

  // Masraflar ve diğer gelir.
  const expenses: [string, string, number, number][] = [
    ['Kira', '45.000,00', 20, -48], ['Kira', '45.000,00', 20, -18], ['Elektrik, su, doğalgaz', '18.420,35', 20, -12], ['Personel', '214.600,00', 0, -17],
    ['Kargo ve nakliye', '6.840,00', 20, -9], ['Yakıt ve ulaşım', '4.350,00', 20, -4], ['Banka masrafı', '385,50', 0, -3], ['Yemek', '9.200,00', 10, -2],
  ];
  for (const [category, amount, vatRate, day] of expenses) {
    ok(await fin.recordExpense({ direction: 'out', accountId: category === 'Yemek' || category === 'Yakıt ve ulaşım' ? kasa : ziraat, amount, vatRate, category, date: shift(day) }, rt), 'masraf');
  }
  ok(await fin.recordExpense({ direction: 'in', accountId: ziraat, amount: '2.180,00', vatRate: 0, category: 'Faiz geliri', date: shift(-5) }, rt), 'gelir');
  ok(await fin.transfer({ fromAccountId: ziraat, toAccountId: kasa, amount: '20.000,00', date: shift(-8), note: 'Nakit çekim' }, rt), 'virman');

  // Çekler: portföyde, tahsil edilmiş, ciro edilmiş ve bizim verdiğimiz.
  const banks = ['İş Bankası', 'Akbank', 'Yapı Kredi', 'Halkbank'];
  const checks = [];
  for (const [i, c] of customers.slice(0, 4).entries()) {
    checks.push(ok(await fin.receiveCheck({ partyId: c.id, checkNo: `${48210 + i * 7}`, bank: banks[i]!, date: shift(-30 + i * 4), due: shift(-3 + i * 15), amount: tl(25000 + i * 8500), currency: 'TRY' }, rt), 'çek'));
  }
  ok(await fin.settleCheck({ id: checks[0]!.id, version: 1, accountId: ziraat, date: shift(-2) }, rt), 'çek tahsil');
  ok(await fin.endorseCheck({ id: checks[1]!.id, version: 1, partyId: suppliers[0]!.id, date: shift(-10) }, rt), 'ciro');
  ok(await fin.issueCheck({ partyId: suppliers[suppliers.length - 1]!.id, checkNo: 'KRV-0012', bank: 'Ziraat Bankası', date: shift(-7), due: shift(21), amount: '30.000,00', currency: 'TRY' }, rt), 'verilen çek');

  // Mutabakatlar: biri cevaplanmış, biri cevap bekliyor.
  const done = ok(await rec.createReconciliation({ partyId: customers[0]!.id, currency: 'TRY', asOf: shift(-31), email: 'muhasebe@example.com', contactName: 'Muhasebe birimi' }, rt), 'mutabakat');
  ok(await rec.recordReconciliationAnswer({ id: done.id, version: 1, status: 'agreed', name: 'Selin Kaya', title: 'Muhasebe sorumlusu', note: 'Kaşeli yazıyla teyit edildi.' }, rt), 'mutabakat cevabı');
  const waiting = ok(await rec.createReconciliation({ partyId: customers[2]!.id, currency: 'TRY', asOf: shift(-1), message: 'Ay sonu kapanışı için bakiyenizi teyit etmenizi rica ederiz.' }, rt), 'mutabakat');
  ok(await rec.issueReconciliationLink({ id: waiting.id, version: 1, send: false }, rt), 'mutabakat bağlantısı');
}
