import { asc, count, desc, eq, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { mergeCompanyConfig } from '@/core/company/config';
import { auditLog, companies, companySettings, invites, memberships, platformAudit } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { getInstallConfig, type InstallConfig } from '@/core/install-config';
import { MODULE_IDS, ROLES } from '@/core/modules/types';
import { SECTOR_IDS } from '@/sectors';
import { connectDb, migrateDb } from '@/core/db/client';
import { clearDataRoutes, encryptUrl } from '@/core/db/router';
import { definePlatformAction, type PlatformCtx } from './action';

/** Ayrı veritabanı adresi: canlıda yalnız Postgres; geliştirme ve testte gömülü veritabanı da. */
function checkDatabaseUrl(url: string): string {
  const ok = /^postgres(ql)?:\/\/\S+$/.test(url) || (process.env.NODE_ENV !== 'production' && /^pglite:\/\/(?!memory$)\S+$/.test(url));
  if (!ok) throw new AppError('VALIDATION', 'Veritabanı adresi postgres:// ile başlamalı.', { databaseUrl: 'postgres://… biçiminde girin.' });
  return url;
}

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
        id: c.id, name: c.name, slug: c.slug, host: c.host, dataLocation: c.dataUrlEnc ? 'dedicated' : 'shared', createdAt: c.createdAt.toISOString(), status: st.settings?.status ?? 'active',
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

/**
 * Yeni firma: firma kaydı, ayarları (sektör, modüller) ve ilk yöneticiye tek kullanımlık davet (72 saat).
 * Adres verilirse firma o adresten açılır (DNS kaydı ayrıca yapılır); davet bağlantısı yanıtta bir kez döner.
 */
export const createCompany = definePlatformAction({
  name: 'platform.createCompany',
  input: z.object({
    name: z.string().trim().min(2, 'Firma adını yazın.').max(120),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, 'Kısa ad: küçük harf, rakam ve tire (2–40).'),
    host: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Adres örn. plastik.kemalayan.com').or(z.literal('')).default(''),
    sector: z.string().refine((s) => SECTOR_IDS.includes(s), 'Listeden bir sektör seçin.'),
    modules: z.array(z.enum(MODULE_IDS)).min(1, 'En az bir modül seçin.'),
    adminName: z.string().trim().min(2, 'Yöneticinin adını yazın.').max(120),
    adminEmail: z.string().trim().toLowerCase().email('Geçerli bir e-posta yazın.'),
    /** Firmaya ayrı veritabanı (Postgres bağlantı adresi). Boşsa ortak veritabanı. */
    databaseUrl: z.string().trim().max(2000).default(''),
  }),
  run: async (ctx, i) => {
    try {
      mergeCompanyConfig(getInstallConfig(), { modules: i.modules, sector: i.sector, twoFactorRoles: null, features: {} });
    } catch (e) {
      throw new AppError('VALIDATION', (e as Error).message, { modules: (e as Error).message });
    }
    const [slugTaken] = await ctx.db.select({ id: companies.id }).from(companies).where(eq(companies.slug, i.slug));
    if (slugTaken) throw new AppError('CONFLICT', 'Bu kısa ad kullanılıyor.', { slug: 'Başka bir kısa ad seçin.' });
    if (i.host) {
      const [hostTaken] = await ctx.db.select({ id: companies.id }).from(companies).where(eq(companies.host, i.host));
      if (hostTaken) throw new AppError('CONFLICT', 'Bu adres başka firmada.', { host: 'Başka bir adres seçin.' });
    }
    const dedicated = i.databaseUrl ? checkDatabaseUrl(i.databaseUrl) : null;
    const [c] = await ctx.db
      .insert(companies)
      .values({ name: i.name, slug: i.slug, host: i.host || null, dataUrlEnc: dedicated ? encryptUrl(dedicated) : null })
      .returning({ id: companies.id });
    const companyId = c!.id;
    if (dedicated) {
      // Ayrı veritabanı hazırlanır: tablolar (göçler) ve firmanın kendi kaydı. Hata olursa firma kaydı geri alınır.
      try {
        const target = await connectDb(dedicated);
        await migrateDb(target, dedicated);
        await target.insert(companies).values({ id: companyId, name: i.name, slug: i.slug, host: i.host || null }).onConflictDoNothing();
        clearDataRoutes(companyId);
      } catch (e) {
        await ctx.db.delete(companies).where(eq(companies.id, companyId));
        throw new AppError('VALIDATION', `Ayrı veritabanı hazırlanamadı: ${(e as Error).message.slice(0, 200)}`, { databaseUrl: 'Adresi ve erişimi kontrol edin.' });
      }
    }
    const { randomBytes } = await import('node:crypto');
    const { hashToken, INVITE_TTL_HOURS } = await import('@/core/users/service');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);
    await ctx.inCompany(companyId, async (tx, audit) => {
      await tx.insert(companySettings).values({ companyId, modules: i.modules, sector: i.sector, updatedBy: ctx.admin.userId });
      const [inv] = await tx
        .insert(invites)
        .values({ companyId, email: i.adminEmail, name: i.adminName, roles: ['admin'], tokenHash: hashToken(token), expiresAt, createdBy: ctx.admin.userId })
        .returning({ id: invites.id });
      await audit({ entity: 'company', entityId: companyId, after: { name: i.name, sector: i.sector, modules: i.modules, adminEmail: i.adminEmail, inviteId: inv!.id } });
    });
    const base = i.host ? `https://${i.host}` : (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000');
    const link = `${base.replace(/\/$/, '')}/davet/${token}`;
    const { sendMail } = await import('@/core/mail');
    const mailed = await sendMail(i.adminEmail, `${i.name} · hesabınız hazır`, `${i.adminName}, ${i.name} için yönetici hesabınızı oluşturmak üzere bağlantı (${INVITE_TTL_HOURS} saat geçerli):\n${link}`).then(() => true, () => false);
    await ctx.log({ targetCompanyId: companyId, detail: { name: i.name, slug: i.slug, host: i.host || null, sector: i.sector, modules: i.modules, adminEmail: i.adminEmail, mailed, dataLocation: dedicated ? 'dedicated' : 'shared' } });
    return { companyId, inviteLink: link, mailed };
  },
});
