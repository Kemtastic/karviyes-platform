// Demo için hayali örnek veri. Gerçek kişi/firma verisi içermez: vergi no 999… test aralığında,
// telefon 0555 000 …, e-posta @example.com. Uygulamanın kendi eylemleriyle yüklenir (kurallar ve audit çalışır).
import { like } from 'drizzle-orm';
import type { ActionResult, ActionRuntime } from '@/core/action';
import type { Auth } from '@/core/auth/auth';
import type { CurrentUser } from '@/core/auth/session';
import type { Db } from '@/core/db/client';
import { withCompany } from '@/core/db/scope';
import { parties } from '@/core/db/schema';
import type { InstallConfig } from '@/core/install-config';
import { createParty } from '@/core/parties/service';
import { createDeviceAccount, createStaff } from '@/core/users/service';
import { createOrder } from '@/modules/orders/server/actions';
import * as production from '@/modules/production/server/actions';
import { jobDetail } from '@/modules/production/server/queries';
import data from '../../scripts/data/ornek-veri.json';
import { seedDemoExtras } from './demo-extra';
import { seedDemoFinance } from './demo-finance';
import { finAccounts } from '@/modules/finance/db/schema';

type Seed = { db: Db; companyId: string; cfg: InstallConfig; auth: Auth; tabletPassword: string };

function vkn(nine: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const t = (Number(nine[i]) + (9 - i)) % 10;
    let v = t === 0 ? 0 : (t * 2 ** (9 - i)) % 9;
    if (v === 0 && t !== 0) v = 9;
    sum += v;
  }
  return nine + String((10 - (sum % 10)) % 10);
}

function ok<T>(r: ActionResult<T>, what: string): T {
  if (!r.ok) throw new Error(`Örnek veri (${what}): ${r.message} ${JSON.stringify(r.fieldErrors ?? {})}`);
  return r.data;
}

// Teslim tarihi: sipariş tarihinden birkaç hafta sonra (bir kısmı geçmiş olur, uyarılar görünsün).
function plusDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function seedSampleData({ db, companyId, cfg, auth, tabletPassword }: Seed): Promise<{ created: boolean; tablets: { role: string; loginEmail: string }[] }> {
  const existing = await withCompany(companyId, (tx) => tx.select({ id: parties.id }).from(parties).where(like(parties.taxId, '999%')).limit(1), db);
  const user: CurrentUser = { userId: 'ornek-veri', email: 'ornek-veri@example.com', name: 'Örnek veri', companyId, membershipId: '00000000-0000-0000-0000-000000000000', roles: ['admin', 'tracking', 'sales'], kind: 'person', staffId: null, twoFactorEnabled: true };
  const rt: ActionRuntime = { user, db, cfg, batch: true };
  if (existing.length) {
    // Örnek veri önceki bir sürümde yüklendiyse sonradan açılan ön muhasebe modülünün demo verisi eklenir.
    if (cfg.modules.includes('finance') && !(await withCompany(companyId, (tx) => tx.select({ id: finAccounts.id }).from(finAccounts).limit(1), db)).length) await seedDemoFinance(rt);
    return { created: false, tablets: [] };
  }

  // Personel
  const salesNames = ['Ayşe Kara', 'Murat Tunç', 'Selin Doğan'];
  const salesIds: string[] = [];
  for (const name of salesNames) salesIds.push(ok(await createStaff({ name, kind: 'sales', departments: ['sales'] }, rt), 'personel').id);
  const workshop = [
    { name: 'Hakan Usta', kind: 'master', departments: ['slitting'] },
    { name: 'Zeynep Baskı', kind: 'operator', departments: ['printing'] },
    { name: 'Emre Kesim', kind: 'master', departments: ['cutting', 'finishing'] },
    { name: 'Gül Dikiş', kind: 'operator', departments: ['finishing', 'repair'] },
    { name: 'Ayten Toplayıcı', kind: 'collector', departments: ['cutting', 'finishing'] },
  ];
  const workerIds: Record<string, string> = {};
  for (const w of workshop) workerIds[w.name] = ok(await createStaff(w, rt), 'personel').id;

  // Bölüm tabletleri
  const tablets: { role: string; loginEmail: string }[] = [];
  for (const [role, label] of [['slitting', 'Dilimleme tableti'], ['printing', 'Baskı tableti'], ['cutting', 'Kesim tableti'], ['finishing', 'Kesim bitiş tableti'], ['repair', 'Tamir tableti']] as const) {
    const r = ok(await createDeviceAccount({ label, roles: [role], password: tabletPassword }, rt, { auth }), 'tablet');
    tablets.push({ role, loginEmail: r.loginEmail });
  }

  // Cariler
  const partyIds = new Map<string, string>();
  for (const [i, m] of data.musteriler.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const r = ok(
      await createParty({
        kind: 'customer', name: m.firma, legalType: 'company', taxId: vkn(`9990000${n}`), taxOffice: `${m.ilce} Vergi Dairesi Müdürlüğü`, city: m.il, district: m.ilce,
        address: m.adres, contactName: m.yetkili, phone: `0555 000 ${n} ${String(10 + i).padStart(2, '0')}`, email: `muhasebe${n}@example.com`,
      }, rt),
      `cari ${m.firma}`,
    );
    partyIds.set(m.firma, r.id);
  }

  // Siparişler (tarih sırasıyla)
  const orderIds: string[] = [];
  for (const [i, s] of [...data.siparisler].sort((a, b) => a.tarih.localeCompare(b.tarih)).entries()) {
    const product = { width: s.en, height: s.boy, gusset: s.koruk, shape: s.model, handle: s.tutma, handleLength: s.tutma === 'Kulplu' ? 40 : '', gsm: s.gramaj, colour: s.renk, print: s.baski, rolls: s.bobin, biye: 5 };
    const r = ok(
      await createOrder({
        partyId: partyIds.get(s.musteri)!, salespersonStaffId: salesIds[i % salesIds.length]!, orderDate: s.tarih, deliveryDate: plusDays(s.tarih, 21 + (i % 4) * 7), product,
        unitPrice: String(s.birimFiyat), vatRate: '10', currency: 'TRY', deposit: i % 3 === 0 ? '1.500,00' : '', packaging: { type: 'sack', capacity: 2000 },
        departmentNotes: { printing: s.not },
      }, rt),
      `sipariş ${s.musteri}`,
    );
    orderIds.push(r.id);
  }

  // Kumaş stoğu
  const rolls = ok(await production.addFabricRolls({ widthCm: 100, colour: 'Beyaz', gsm: 70, metres: 1000, count: 8 }, rt), 'kumaş').ids;
  ok(await production.addFabricRolls({ widthCm: 110, colour: 'Krem', gsm: 80, metres: 1000, count: 4 }, rt), 'kumaş');
  // Kulplu siparişlerin renklerinde 5 cm sap bobini (kesim başlarken otomatik ayrılır)
  for (const colour of new Set(data.siparisler.filter((x) => x.tutma === 'Kulplu').map((x) => x.renk))) {
    ok(await production.addFabricRolls({ widthCm: 5, colour, gsm: 80, metres: 1000, count: 6 }, rt), 'sap');
  }

  // İlk beş sipariş farklı aşamalarda
  const v = async (jobId: string) => ok(await jobDetail({ id: jobId }, rt), 'iş').version;
  const step = async (fn: (raw: unknown, r: ActionRuntime) => Promise<ActionResult<unknown>>, input: Record<string, unknown>, what: string) => ok(await fn({ ...input, version: await v(input.jobId as string) }, rt), what);
  const emre = workerIds['Emre Kesim']!;
  async function toCuttingDone(jobId: string, qty: number, rollId: string) {
    await step(production.reserveFabric, { jobId, rollIds: [rollId] }, 'kumaş ayır');
    const d = ok(await jobDetail({ id: jobId }, rt), 'iş');
    await step(production.sendToStage, { jobId, stage: d.firstStages[0] }, 'gönder');
    // dilimleme (ve baskılıysa baskı) → kesim
    for (let guard = 0; guard < 4; guard++) {
      const cur = ok(await jobDetail({ id: jobId }, rt), 'iş');
      if (cur.stage === 'cutting') break;
      await step(production.startStage, { jobId, machine: cur.stage === 'printing' ? 'Baskı 1' : 'Dilimleme 1', staffIds: [workerIds[cur.stage === 'printing' ? 'Zeynep Baskı' : 'Hakan Usta']!] }, 'başlat');
      await step(production.finishStage, { jobId, metres: 1000, printWaste: cur.stage === 'printing' ? 25 : 0 }, 'bitir');
    }
    await step(production.startStage, { jobId, machine: 'Kesim 1', staffIds: [emre] }, 'kesim başlat');
    await step(production.finishStage, { jobId, good: qty, cutWaste: Math.round(qty * 0.02) }, 'kesim bitir');
  }

  const jobIds: string[] = [];
  for (const orderId of orderIds.slice(0, 5)) jobIds.push(ok(await production.startProduction({ orderId }, rt), 'üretime al').id);
  const qtyOf = async (jobId: string) => ok(await jobDetail({ id: jobId }, rt), 'iş').quantity;

  // 1: sevk edildi · 2: faturaya hazır · 3: kontrol bekliyor · 4: kesimde · 5: kumaş bekliyor
  for (const [idx, target] of (['shipped', 'completed', 'review'] as const).entries()) {
    const jobId = jobIds[idx]!;
    const q = await qtyOf(jobId);
    await toCuttingDone(jobId, q, rolls[idx]!);
    await step(production.startStage, { jobId, machine: 'Masa 1', staffIds: [workerIds['Gül Dikiş']!] }, 'bitiş başlat');
    await step(production.finishStage, { jobId, good: q, cutWaste: 3, sacks: Math.ceil(q / 2000) }, 'bitiş bitir');
    if (target === 'review') continue;
    await step(production.approveReview, { jobId }, 'onay');
    if (target === 'shipped') {
      // İki parça sevk: rapor ve sevk geçmişi dolu görünsün.
      const first = Math.floor(q / 2);
      await step(production.shipJob, { jobId, qty: first, shippedAt: '2026-10-13', note: 'İlk parti' }, 'sevk');
      await step(production.shipJob, { jobId, qty: q - first, shippedAt: '2026-10-15', note: 'Kalan' }, 'sevk');
    }
  }
  // Önceki haftalardan tamamen sevk edilmiş birkaç iş daha (farklı müşteri, tarih ve personel).
  const extraShips: [string, string][] = [['2026-09-24', 'Masa 1'], ['2026-10-02', 'Masa 2'], ['2026-10-09', 'Masa 1']];
  for (const [i, [date, table]] of extraShips.entries()) {
    const orderId = orderIds[5 + i];
    const rollId = rolls[4 + i];
    if (!orderId || !rollId) break;
    const jobId = ok(await production.startProduction({ orderId }, rt), 'üretime al').id;
    const q = await qtyOf(jobId);
    await toCuttingDone(jobId, q, rollId);
    await step(production.startStage, { jobId, machine: table, staffIds: [workerIds['Gül Dikiş']!] }, 'bitiş başlat');
    await step(production.finishStage, { jobId, good: q, cutWaste: 2 + i, sacks: Math.ceil(q / 2000) }, 'bitiş bitir');
    await step(production.approveReview, { jobId }, 'onay');
    await step(production.shipJob, { jobId, qty: q, shippedAt: date, note: i === 1 ? 'Müşteri kendisi aldı' : '' }, 'sevk');
  }
  await step(production.reserveFabric, { jobId: jobIds[3]!, rollIds: [rolls[3]!] }, 'kumaş ayır');
  const d4 = ok(await jobDetail({ id: jobIds[3]! }, rt), 'iş');
  if (d4.firstStages.includes('cutting')) await step(production.sendToStage, { jobId: jobIds[3]!, stage: 'cutting' }, 'gönder');
  else {
    await step(production.sendToStage, { jobId: jobIds[3]!, stage: 'slitting' }, 'gönder');
    for (const st of ['slitting', 'printing'] as const) {
      await step(production.startStage, { jobId: jobIds[3]!, machine: st === 'printing' ? 'Baskı 1' : 'Dilimleme 1', staffIds: [] }, 'başlat');
      await step(production.finishStage, { jobId: jobIds[3]!, metres: 1000 }, `${st} bitir`);
    }
  }
  await step(production.startStage, { jobId: jobIds[3]!, machine: 'Kesim 2', staffIds: [emre] }, 'kesim başlat');

  await seedDemoExtras({ rt, companyId, partyIds, salesIds, orderIds, suppliers: data.tedarikciler });
  await seedDemoFinance(rt);
  return { created: true, tablets };
}
