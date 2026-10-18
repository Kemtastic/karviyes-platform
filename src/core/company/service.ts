import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { auditLog, companies } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { ROLES } from '@/core/modules/types';

export const updateCompanyBranding = defineAction({
  name: 'company.branding',
  roles: ['admin'],
  input: z.object({
    name: z.string().trim().min(2).max(120),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı.'),
    logoFileId: z.string().uuid().nullable().optional(),
  }),
  run: async (ctx, i) => {
    const [before] = await ctx.tx.select().from(companies).where(eq(companies.id, ctx.companyId));
    if (!before) throw new AppError('NOT_FOUND', 'Firma bulunamadı.');
    const [row] = await ctx.tx
      .update(companies)
      .set({ name: i.name, brandColor: i.brandColor, ...(i.logoFileId !== undefined ? { logoFileId: i.logoFileId } : {}) })
      .where(eq(companies.id, ctx.companyId))
      .returning();
    await ctx.audit({ entity: 'company', entityId: ctx.companyId, before, after: row });
    return { name: row!.name, brandColor: row!.brandColor, logoFileId: row!.logoFileId };
  },
});

// Firma adı, rengi ve logosu: kabuk ve belgeler (PDF) buradan okur, kurulum dosyasından değil.
export const companyProfile = defineAction({
  name: 'company.profile',
  roles: [...ROLES],
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) => {
    const [row] = await ctx.tx.select({ name: companies.name, brandColor: companies.brandColor, logoFileId: companies.logoFileId }).from(companies).where(eq(companies.id, ctx.companyId));
    if (!row) throw new AppError('NOT_FOUND', 'Firma bulunamadı.');
    return row;
  },
});

export const AUDIT_PAGE_SIZE = 50;

export const listAudit = defineAction({
  name: 'audit.list',
  roles: ['admin'],
  rateLimit: false,
  input: z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    entity: z.string().max(40).optional(),
    actor: z.string().max(80).optional(),
    page: z.number().int().min(0).default(0),
  }),
  run: async (ctx, i) => {
    const where: SQL[] = [];
    // Tarih aralığı İstanbul günüyle.
    if (i.from) where.push(gte(auditLog.at, new Date(`${i.from}T00:00:00+03:00`)));
    if (i.to) where.push(lte(auditLog.at, new Date(`${i.to}T23:59:59.999+03:00`)));
    if (i.entity) where.push(eq(auditLog.entity, i.entity));
    if (i.actor) where.push(eq(auditLog.actorUserId, i.actor));
    const cond = where.length ? and(...where) : undefined;
    const rows = await ctx.tx.select().from(auditLog).where(cond).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(AUDIT_PAGE_SIZE).offset(i.page * AUDIT_PAGE_SIZE);
    const [total] = await ctx.tx.select({ n: count() }).from(auditLog).where(cond);
    return { rows: rows.map((r) => ({ ...r, id: r.id.toString(), at: r.at.toISOString() })), total: total?.n ?? 0 };
  },
});
