import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { parties, staff } from '@/core/db/schema';
import { salesCalls, salesContacts } from '../db/schema';
import { SALES } from './actions';

export const CALL_VIEWS = ['today', 'overdue', 'planned', 'all'] as const;
export type CallView = (typeof CALL_VIEWS)[number];

// Takip listesi: her aktif müşteri için son görüşme ve sonraki arama tarihi.
// Bugün: sonraki tarih bugün · Geciken: bugünden önce · Planlanan: bugünden sonra · Tümü: aranmamışlar dahil.
export const callList = defineAction({
  name: 'sales.callList',
  module: 'sales',
  roles: SALES,
  rateLimit: false,
  input: z.object({ view: z.enum(CALL_VIEWS).default('today'), responsibleStaffId: z.string().uuid().optional(), today: z.string().date().optional() }),
  run: async (ctx, i) => {
    const today = i.today ?? istanbulToday();
    const customers = await ctx.tx
      .select({ id: parties.id, name: parties.name, phone: parties.phone, contactName: parties.contactName })
      .from(parties)
      .where(and(eq(parties.archived, false), inArray(parties.kind, ['customer', 'both'])))
      .orderBy(asc(parties.name));
    const last = await ctx.tx
      .selectDistinctOn([salesCalls.partyId], { partyId: salesCalls.partyId, at: salesCalls.at, note: salesCalls.note, nextDate: salesCalls.nextDate })
      .from(salesCalls)
      .orderBy(salesCalls.partyId, desc(salesCalls.at));
    const counts = await ctx.tx.select({ partyId: salesCalls.partyId, n: count() }).from(salesCalls).groupBy(salesCalls.partyId);
    const contacts = await ctx.tx.select({ partyId: salesContacts.partyId, staffId: salesContacts.responsibleStaffId, staffName: staff.name }).from(salesContacts).leftJoin(staff, eq(staff.id, salesContacts.responsibleStaffId));
    const lastOf = new Map(last.map((l) => [l.partyId, l]));
    const countOf = new Map(counts.map((c) => [c.partyId, Number(c.n)]));
    const contactOf = new Map(contacts.map((c) => [c.partyId, c]));
    const rows = customers.map((p) => {
      const l = lastOf.get(p.id);
      const c = contactOf.get(p.id);
      return {
        partyId: p.id, partyName: p.name, phone: p.phone, contactName: p.contactName,
        lastAt: l?.at.toISOString() ?? null, lastNote: l?.note ?? '', nextDate: l?.nextDate ?? null, callCount: countOf.get(p.id) ?? 0,
        responsibleStaffId: c?.staffId ?? null, responsibleName: c?.staffName ?? null,
      };
    });
    const inView = (r: (typeof rows)[number]) => {
      if (i.view === 'all') return true;
      if (!r.nextDate) return false;
      if (i.view === 'today') return r.nextDate === today;
      if (i.view === 'overdue') return r.nextDate < today;
      return r.nextDate > today;
    };
    return rows
      .filter((r) => inView(r) && (!i.responsibleStaffId || r.responsibleStaffId === i.responsibleStaffId))
      .sort((a, b) => (i.view === 'all' ? 0 : (a.nextDate ?? '').localeCompare(b.nextDate ?? '')) || a.partyName.localeCompare(b.partyName, 'tr'));
  },
});

// Cari kartındaki görüşme geçmişi (yeniden eskiye).
export const partyCalls = defineAction({
  name: 'sales.partyCalls',
  module: 'sales',
  roles: SALES,
  rateLimit: false,
  input: z.object({ partyId: z.string().uuid() }),
  run: async (ctx, i) => {
    const rows = await ctx.tx
      .select({ id: salesCalls.id, at: salesCalls.at, note: salesCalls.note, nextDate: salesCalls.nextDate, staffName: staff.name })
      .from(salesCalls)
      .leftJoin(staff, eq(staff.id, salesCalls.staffId))
      .where(eq(salesCalls.partyId, i.partyId))
      .orderBy(desc(salesCalls.at))
      .limit(200);
    const [contact] = await ctx.tx.select({ staffId: salesContacts.responsibleStaffId }).from(salesContacts).where(eq(salesContacts.partyId, i.partyId));
    return { calls: rows.map((r) => ({ ...r, at: r.at.toISOString() })), responsibleStaffId: contact?.staffId ?? null };
  },
});

// Sorumlu seçimi için aktif satış personeli (sipariş modülüne bağlı kalmamak için burada).
export const salesStaffList = defineAction({
  name: 'sales.staff',
  module: 'sales',
  roles: SALES,
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) =>
    (await ctx.tx.select({ id: staff.id, name: staff.name, departments: staff.departments, active: staff.active }).from(staff).orderBy(asc(staff.name)))
      .filter((s) => s.active && s.departments.includes('sales'))
      .map((s) => ({ id: s.id, name: s.name })),
});
