import { asc, count, desc, eq, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { mergeCompanyConfig } from '@/core/company/config';
import { auditLog, companies, companySettings, memberships, platformAudit } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { getInstallConfig, type InstallConfig } from '@/core/install-config';
import { MODULE_IDS, ROLES } from '@/core/modules/types';
import { SECTOR_IDS } from '@/sectors';
import { definePlatformAction, type PlatformCtx } from './action';

async function companyState(ctx: PlatformCtx, companyId: string, base: InstallConfig) {
  return ctx.inCompany(companyId, async (tx) => {
    const [settings] = await tx.select().from(companySettings).where(eq(companySettings.companyId, companyId));
    const [members] = await tx.select({ n: count() }).from(memberships).where(eq(memberships.active, true));
    const [last] = await tx.select({ at: max(auditLog.at) }).from(auditLog);
    return { settings, config: mergeCompanyConfig(base, settings), activeUsers: Number(members?.n ?? 0), lastActivity: last?.at?.toISOString() ?? null };
  });
}

/** Firmalar: ad, kısa ad, durum, sektör, açık modüller, aktif kullanıcı, son işlem. */
export const platformCompanies = definePlatformAction({
  name: 'platform.companies',
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) => {
    const base = getInstallConfig();
    const rows = await ctx.db.select().from(companies).orderBy(asc(companies.name));
    const out = [];
    for (const c of rows) {
      const st = await companyState(ctx, c.id, base);
      out.push({
        id: c.id, name: c.name, slug: c.slug, createdAt: c.createdAt.toISOString(), status: st.settings?.status ?? 'active',
        sector: st.config.sector, modules: st.config.modules, activeUsers: st.activeUsers, lastActivity: st.lastActivity,
      });
    }
    return out;
  },
});

export const platformCompany = definePlatformAction({
  name: 'platform.company',
  rateLimit: false,
  input: z.object({ id: z.string().uuid() }),
  run: async (ctx, i) => {
    const [c] = await ctx.db.select().from(companies).where(eq(companies.id, i.id));
    if (!c) throw new AppError('NOT_FOUND', 'Firma bulunamadı.');
    const st = await companyState(ctx, c.id, getInstallConfig());
    return {
      id: c.id, name: c.name, slug: c.slug, status: st.settings?.status ?? 'active', activeUsers: st.activeUsers, lastActivity: st.lastActivity,
      config: { modules: st.config.modules, sector: st.config.sector, twoFactorRequiredRoles: st.config.security.twoFactorRequiredRoles, features: st.config.features },
      overrides: { modules: Boolean(st.settings?.modules?.length), sector: Boolean(st.settings?.sector), twoFactor: Boolean(st.settings?.twoFactorRoles) },
    };
  },
});

/**
 * Firmanın modülleri, sektörü, 2FA zorunlu rolleri, özellik anahtarları ve durumu. Kapatılan modülün verisi silinmez.
 * Sektör, firmada sipariş varken değiştirilemez (ürün alanları uyumsuz olur).
 */
export const updateCompanySettings = definePlatformAction({
  name: 'platform.updateCompanySettings',
  input: z.object({
    companyId: z.string().uuid(),
    modules: z.array(z.enum(MODULE_IDS)).min(1, 'En az bir modül açık olmalı.'),
    sector: z.string().refine((s) => SECTOR_IDS.includes(s), 'Listeden bir sektör seçin.'),
    twoFactorRoles: z.array(z.enum(ROLES)),
    features: z.record(z.string(), z.boolean()).default({}),
    status: z.enum(['active', 'suspended']),
    reason: z.string().trim().max(300).default(''),
  }),
  run: async (ctx, i) => {
    const base = getInstallConfig();
    const [c] = await ctx.db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, i.companyId));
    if (!c) throw new AppError('NOT_FOUND', 'Firma bulunamadı.');
    try {
      mergeCompanyConfig(base, { modules: i.modules, sector: i.sector, twoFactorRoles: i.twoFactorRoles, features: i.features });
    } catch (e) {
      throw new AppError('VALIDATION', (e as Error).message, { modules: (e as Error).message });
    }
    if (i.status === 'suspended' && i.reason.length < 3) throw new AppError('VALIDATION', 'Askıya alma nedenini yazın.', { reason: 'Nedeni yazın.' });
    const result = await ctx.inCompany(i.companyId, async (tx, audit) => {
      const [before] = await tx.select().from(companySettings).where(eq(companySettings.companyId, i.companyId));
      const current = mergeCompanyConfig(base, before);
      if (current.sector !== i.sector) {
        const [used] = await tx.execute(sql`select exists (select 1 from order_lines) as used`).then((r) => (r as unknown as { rows: { used: boolean }[] }).rows);
        if (used?.used) throw new AppError('INVALID_STATE', 'Firmada sipariş varken sektör değiştirilemez.', { sector: 'Sipariş varken değiştirilemez.' });
      }
      const values = { modules: i.modules, sector: i.sector, twoFactorRoles: i.twoFactorRoles, features: i.features, status: i.status, updatedAt: new Date(), updatedBy: ctx.admin.userId };
      await tx.insert(companySettings).values({ companyId: i.companyId, ...values }).onConflictDoUpdate({ target: companySettings.companyId, set: values });
      const after = { modules: i.modules, sector: i.sector, twoFactorRoles: i.twoFactorRoles, features: i.features, status: i.status };
      const beforeView = { modules: current.modules, sector: current.sector, twoFactorRoles: current.security.twoFactorRequiredRoles, features: current.features, status: before?.status ?? 'active' };
      await audit({ entity: 'company_settings', entityId: i.companyId, before: beforeView, after: { ...after, reason: i.reason || undefined } });
      return { before: beforeView, after };
    });
    await ctx.log({ targetCompanyId: i.companyId, detail: { company: c.name, ...result, reason: i.reason || undefined } });
    return { companyId: i.companyId };
  },
});

/** Merkez panel kaydı (yeniden eskiye). */
export const platformAuditList = definePlatformAction({
  name: 'platform.audit',
  rateLimit: false,
  input: z.object({ companyId: z.string().uuid().optional(), limit: z.number().int().min(1).max(500).default(200) }),
  run: async (ctx, i) => {
    const rows = await ctx.db
      .select({ a: platformAudit, companyName: companies.name })
      .from(platformAudit)
      .leftJoin(companies, eq(companies.id, platformAudit.targetCompanyId))
      .where(i.companyId ? eq(platformAudit.targetCompanyId, i.companyId) : undefined)
      .orderBy(desc(platformAudit.at))
      .limit(i.limit);
    return rows.map(({ a, companyName }) => ({ id: a.id, at: a.at.toISOString(), actorUserId: a.actorUserId, action: a.action, companyName, detail: a.detail }));
  },
});
