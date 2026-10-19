import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { parties } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { plates } from '../db/schema';

export const createPlate = defineAction({
  name: 'plates.create',
  module: 'production',
  roles: ['admin', 'tracking', 'sales'],
  input: z.object({ partyId: z.string().uuid(), name: z.string().trim().min(2).max(120), colours: z.string().trim().max(200).default(''), notes: z.string().trim().max(1000).default(''), fileIds: z.array(z.string().uuid()).max(10).default([]) }),
  run: async (ctx, i) => {
    const [party] = await ctx.tx.select({ id: parties.id }).from(parties).where(eq(parties.id, i.partyId));
    if (!party) throw new AppError('VALIDATION', 'Müşteri seçin.', { partyId: 'Müşteri seçin.' });
    const [row] = await ctx.tx.insert(plates).values({ companyId: ctx.companyId, ...i }).returning({ id: plates.id });
    await ctx.audit({ entity: 'plate', entityId: row!.id, after: i });
    return { id: row!.id };
  },
});

export const listPlates = defineAction({
  name: 'plates.list',
  readOnlySafe: true,
  module: 'production',
  roles: ['admin', 'tracking', 'sales', 'printing'],
  rateLimit: false,
  input: z.object({ partyId: z.string().uuid().optional() }),
  run: async (ctx, i) => {
    const rows = await ctx.tx
      .select({ plate: plates, partyName: parties.name })
      .from(plates)
      .innerJoin(parties, eq(parties.id, plates.partyId))
      .where(and(eq(plates.archived, false), i.partyId ? eq(plates.partyId, i.partyId) : undefined))
      .orderBy(asc(parties.name), asc(plates.name));
    return rows.map(({ plate, partyName }) => ({ id: plate.id, name: plate.name, colours: plate.colours, notes: plate.notes, fileIds: plate.fileIds, partyId: plate.partyId, partyName }));
  },
});
