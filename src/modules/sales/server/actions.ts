import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction, type ActionCtx } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { parties, staff } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import type { Role } from '@/core/modules/types';
import { salesCalls, salesContacts } from '../db/schema';
import { PRIORITIES } from '../db/schema';

export const SALES: Role[] = ['admin', 'sales'];

// Satış takibi yalnızca aktif müşteriler içindir (tedarikçi ve arşivli cari değil).
async function assertCustomer(ctx: ActionCtx, partyId: string) {
  const [p] = await ctx.tx.select({ kind: parties.kind, archived: parties.archived }).from(parties).where(eq(parties.id, partyId));
  if (!p || p.archived || p.kind === 'supplier') throw new AppError('VALIDATION', 'Listeden aktif bir müşteri seçin.', { partyId: 'Listeden aktif bir müşteri seçin.' });
}

export const logCall = defineAction({
  name: 'sales.logCall',
  module: 'sales',
  roles: SALES,
  input: z.object({
    partyId: z.string().uuid(),
    note: z.string().trim().min(3, 'Görüşme notunu yazın.').max(2000),
    nextDate: z.string().date().nullable().default(null),
  }),
  run: async (ctx, i) => {
    await assertCustomer(ctx, i.partyId);
    if (i.nextDate && i.nextDate < istanbulToday()) throw new AppError('VALIDATION', 'Sonraki arama tarihi bugünden önce olamaz.', { nextDate: 'Bugün veya sonrası seçin.' });
    const [row] = await ctx.tx
      .insert(salesCalls)
      .values({ companyId: ctx.companyId, partyId: i.partyId, note: i.note, nextDate: i.nextDate, createdBy: ctx.user.userId, staffId: ctx.user.staffId })
      .returning({ id: salesCalls.id });
    await ctx.audit({ entity: 'sales_call', entityId: row!.id, after: { partyId: i.partyId, nextDate: i.nextDate } });
    return { id: row!.id };
  },
});

export const setResponsible = defineAction({
  name: 'sales.setResponsible',
  module: 'sales',
  roles: SALES,
  input: z.object({ partyId: z.string().uuid(), staffId: z.string().uuid().nullable() }),
  run: async (ctx, i) => {
    await assertCustomer(ctx, i.partyId);
    if (i.staffId) {
      const [s] = await ctx.tx.select({ active: staff.active, departments: staff.departments }).from(staff).where(and(eq(staff.id, i.staffId)));
      if (!s?.active || !s.departments.includes('sales')) throw new AppError('VALIDATION', 'Sorumluyu satış personelinden seçin.', { staffId: 'Satış personelinden seçin.' });
    }
    await ctx.tx
      .insert(salesContacts)
      .values({ companyId: ctx.companyId, partyId: i.partyId, responsibleStaffId: i.staffId })
      .onConflictDoUpdate({ target: [salesContacts.companyId, salesContacts.partyId], set: { responsibleStaffId: i.staffId, updatedAt: new Date() } });
    await ctx.audit({ entity: 'party', entityId: i.partyId, after: { responsibleStaffId: i.staffId } });
    return { partyId: i.partyId };
  },
});

export const setPriority = defineAction({
  name: 'sales.setPriority',
  module: 'sales',
  roles: SALES,
  input: z.object({ partyId: z.string().uuid(), priority: z.enum(PRIORITIES) }),
  run: async (ctx, i) => {
    await assertCustomer(ctx, i.partyId);
    await ctx.tx
      .insert(salesContacts)
      .values({ companyId: ctx.companyId, partyId: i.partyId, priority: i.priority })
      .onConflictDoUpdate({ target: [salesContacts.companyId, salesContacts.partyId], set: { priority: i.priority, updatedAt: new Date() } });
    await ctx.audit({ entity: 'party', entityId: i.partyId, after: { priority: i.priority } });
    return { partyId: i.partyId, priority: i.priority };
  },
});

/** Bir satışçının bütün müşterilerini başka satışçıya aktarır (ayrılan ya da bölge değiştiren satışçı). Yalnız yönetici. */
export const transferCustomers = defineAction({
  name: 'sales.transferCustomers',
  module: 'sales',
  roles: ['admin'],
  input: z.object({ fromStaffId: z.string().uuid('Kimden aktarılacağını seçin.'), toStaffId: z.string().uuid('Kime aktarılacağını seçin.') }),
  run: async (ctx, i) => {
    if (i.fromStaffId === i.toStaffId) throw new AppError('VALIDATION', 'Aynı kişiye aktarılamaz.', { toStaffId: 'Başka bir satışçı seçin.' });
    const [s] = await ctx.tx.select({ active: staff.active, departments: staff.departments }).from(staff).where(eq(staff.id, i.toStaffId));
    if (!s?.active || !s.departments.includes('sales')) throw new AppError('VALIDATION', 'Aktif bir satış personeli seçin.', { toStaffId: 'Satış personelinden seçin.' });
    const moved = await ctx.tx
      .update(salesContacts)
      .set({ responsibleStaffId: i.toStaffId, updatedAt: new Date() })
      .where(eq(salesContacts.responsibleStaffId, i.fromStaffId))
      .returning({ partyId: salesContacts.partyId });
    await ctx.audit({ entity: 'staff', entityId: i.fromStaffId, after: { transferredTo: i.toStaffId, customers: moved.map((m) => m.partyId) } });
    return { moved: moved.length };
  },
});
