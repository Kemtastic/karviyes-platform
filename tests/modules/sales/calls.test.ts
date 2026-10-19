import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { runtime, testConfig, testUser } from '../../helpers/runtime';
import { istanbulToday } from '@/core/dates';
import { parseInstallConfig } from '@/core/install-config';
import { archiveParty, createParty } from '@/core/parties/service';
import { createStaff } from '@/core/users/service';
import { logCall, setPriority, setResponsible, transferCustomers } from '@/modules/sales/server/actions';
import { callList, partyCalls } from '@/modules/sales/server/queries';

let t: TestDb;
const ids: Record<string, string> = {};
let ali: string;
let tracker: string;
const sales = () => runtime(t, testUser(t.companyA, ['sales']));
const admin = () => runtime(t, testUser(t.companyA, ['admin']));

function shift(days: number): string {
  const d = new Date(`${istanbulToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  t = await createTestDb();
  for (const [key, kind] of [['bugun', 'customer'], ['geciken', 'customer'], ['planli', 'both'], ['hic', 'customer'], ['tedarikci', 'supplier'], ['arsiv', 'customer']] as const) {
    const p = await createParty({ kind, name: `Cari ${key}`, legalType: 'company' }, admin());
    if (!p.ok) throw new Error(p.message);
    ids[key] = p.data.id;
  }
  const a = await createStaff({ name: 'Ali Satış', kind: 'sales', departments: ['sales'] }, admin());
  const k = await createStaff({ name: 'Kesimci', kind: 'operator', departments: ['cutting'] }, admin());
  if (!a.ok || !k.ok) throw new Error('personel');
  ali = a.data.id;
  tracker = k.data.id;
});
afterAll(async () => { await t.close(); });

describe('arama kaydı', () => {
  it('geçmiş bir sonraki arama tarihi reddedilir; not zorunlu', async () => {
    expect(await logCall({ partyId: ids.bugun!, note: 'Fiyat istedi', nextDate: shift(-1) }, sales())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await logCall({ partyId: ids.bugun!, note: '', nextDate: shift(1) }, sales())).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('tedarikçi ve arşivli cari için arama kaydedilmez', async () => {
    expect(await logCall({ partyId: ids.tedarikci!, note: 'x arandı', nextDate: null }, sales())).toMatchObject({ ok: false, code: 'VALIDATION' });
    const archivedVersion = 1;
    await archiveParty({ id: ids.arsiv!, version: archivedVersion }, admin());
    expect(await logCall({ partyId: ids.arsiv!, note: 'x arandı', nextDate: null }, sales())).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('listeler son aramanın sonraki tarihine göre: bugün, geciken, planlanan, tümü', async () => {
    expect(await logCall({ partyId: ids.bugun!, note: 'Numune gönderildi', nextDate: shift(3) }, sales())).toMatchObject({ ok: true });
    expect(await logCall({ partyId: ids.bugun!, note: 'Numuneyi beğendi, bugün tekrar ara', nextDate: shift(0) }, sales())).toMatchObject({ ok: true });
    expect(await logCall({ partyId: ids.planli!, note: 'Ay sonu sipariş', nextDate: shift(10) }, sales())).toMatchObject({ ok: true });
    expect(await logCall({ partyId: ids.geciken!, note: 'Yarın ara', nextDate: shift(0) }, sales())).toMatchObject({ ok: true });

    const names = async (view: 'today' | 'overdue' | 'planned' | 'all', today?: string) => {
      const r = await callList({ view, today }, sales());
      if (!r.ok) throw new Error(r.message);
      return r.data.map((x) => x.partyName).sort();
    };
    expect(await names('today')).toEqual(['Cari bugun', 'Cari geciken']);
    expect(await names('planned')).toEqual(['Cari planli']);
    // Yarının gözüyle: bugüne planlananlar gecikmiş olur.
    expect(await names('overdue', shift(1))).toEqual(['Cari bugun', 'Cari geciken']);
    expect(await names('all')).toEqual(['Cari bugun', 'Cari geciken', 'Cari hic', 'Cari planli']);

    const todays = await callList({ view: 'today' }, sales());
    expect(todays.ok && todays.data.find((x) => x.partyName === 'Cari bugun')).toMatchObject({ lastNote: 'Numuneyi beğendi, bugün tekrar ara', nextDate: shift(0), callCount: 2 });
  });

  it('cari kartında arama geçmişi yeniden eskiye', async () => {
    const r = await partyCalls({ partyId: ids.bugun! }, sales());
    expect(r.ok && r.data.calls.map((c) => c.note)).toEqual(['Numuneyi beğendi, bugün tekrar ara', 'Numune gönderildi']);
  });
});

describe('sorumlu satışçı', () => {
  it('yalnızca aktif satış personeli atanır; liste sorumluya göre süzülür', async () => {
    expect(await setResponsible({ partyId: ids.planli!, staffId: tracker }, sales())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await setResponsible({ partyId: ids.planli!, staffId: ali }, sales())).toMatchObject({ ok: true });
    const r = await callList({ view: 'all', responsibleStaffId: ali }, sales());
    expect(r.ok && r.data.map((x) => [x.partyName, x.responsibleName])).toEqual([['Cari planli', 'Ali Satış']]);
    expect(await setResponsible({ partyId: ids.planli!, staffId: null }, sales())).toMatchObject({ ok: true });
  });
});

describe('yetki ve kapsam', () => {
  it('bölüm tableti ve üretim takip erişemez; başka firma görmez', async () => {
    expect(await callList({ view: 'all' }, runtime(t, testUser(t.companyA, ['cutting'], { kind: 'device' })))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await callList({ view: 'all' }, runtime(t, testUser(t.companyA, ['tracking'])))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const other = await callList({ view: 'all' }, runtime(t, testUser(t.companyB, ['sales'])));
    expect(other.ok && other.data).toEqual([]);
    expect(await logCall({ partyId: ids.bugun!, note: 'sızma', nextDate: null }, runtime(t, testUser(t.companyB, ['sales'])))).toMatchObject({ ok: false });
  });

  it('modül kurulumda kapalıysa erişilemez', async () => {
    const cfg = parseInstallConfig({ ...testConfig, modules: ['orders', 'production'] });
    expect(await callList({ view: 'all' }, { ...sales(), cfg })).toMatchObject({ ok: false, code: 'MODULE_DISABLED' });
  });
});

describe('müşteri önceliği, toplu aktarma ve süzme', () => {
  it('öncelik verilir; listede önce A gelir ve önceliğe göre süzülür', async () => {
    expect(await setPriority({ partyId: ids.hic!, priority: 'A' }, sales())).toMatchObject({ ok: true });
    const all = await callList({ view: 'all' }, sales());
    if (!all.ok) throw new Error(all.message);
    expect(all.data[0]).toMatchObject({ partyId: ids.hic, priority: 'A' });
    expect(all.data.find((r) => r.partyId === ids.bugun)?.priority).toBe('B');
    const onlyA = await callList({ view: 'all', priority: 'A' }, sales());
    expect(onlyA.ok && onlyA.data.map((r) => r.partyId)).toEqual([ids.hic]);
    expect(await setPriority({ partyId: ids.tedarikci!, priority: 'A' }, sales())).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('bir satışçının bütün müşterileri başka satışçıya aktarılır (yalnız yönetici); sayısı döner', async () => {
    const v = await createStaff({ name: 'Veli Satış', kind: 'sales', departments: ['sales'] }, admin());
    if (!v.ok) throw new Error(v.message);
    await setResponsible({ partyId: ids.bugun!, staffId: ali }, sales());
    await setResponsible({ partyId: ids.geciken!, staffId: ali }, sales());
    expect(await transferCustomers({ fromStaffId: ali, toStaffId: v.data.id }, sales())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await transferCustomers({ fromStaffId: ali, toStaffId: tracker }, admin())).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await transferCustomers({ fromStaffId: ali, toStaffId: v.data.id }, admin())).toMatchObject({ ok: true, data: { moved: 2 } });
    const r = await callList({ view: 'all', responsibleStaffId: v.data.id }, sales());
    expect(r.ok && r.data.map((x) => x.partyId).sort()).toEqual([ids.bugun, ids.geciken].sort());
    const none = await callList({ view: 'all', responsibleStaffId: ali }, sales());
    expect(none.ok && none.data).toEqual([]);
  });

  it('uzun süredir aranmayanlar ve sorumlusu olmayanlar süzülür; adla aranır', async () => {
    const stale = await callList({ view: 'all', staleDays: 30 }, sales());
    expect(stale.ok && stale.data.some((r) => r.partyId === ids.hic)).toBe(true);
    expect(stale.ok && stale.data.some((r) => r.partyId === ids.bugun)).toBe(false);
    const unassigned = await callList({ view: 'all', unassigned: true }, sales());
    expect(unassigned.ok && unassigned.data.every((r) => r.responsibleStaffId === null)).toBe(true);
    const q = await callList({ view: 'all', q: 'GECİK' }, sales());
    expect(q.ok && q.data.map((r) => r.partyId)).toEqual([ids.geciken]);
  });
});
