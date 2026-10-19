import { cache } from 'react';
import { eq } from 'drizzle-orm';
import type { ZodType, ZodTypeDef } from 'zod';
import { checkRateLimit, toFailure, type ActionResult } from '@/core/action';
import type { Auth } from '@/core/auth/auth';
import type { Db, Tx } from '@/core/db/client';
import { platformAdmins, platformAudit, user } from '@/core/db/schema';
import { withCompany, writeAudit } from '@/core/db/scope';
import { AppError } from '@/core/errors';
import { trErrorMap } from '@/core/zod-tr';

export type PlatformAdmin = { userId: string; email: string; name: string; twoFactorEnabled: boolean };
export type PlatformRuntime = { admin: PlatformAdmin | null; db: Db; batch?: boolean };

/** Oturumdaki kullanıcı merkez panel yöneticisi mi (firma üyeliğinden bağımsız). */
export async function resolvePlatformAdmin(auth: Auth, db: Db, headers: Headers): Promise<PlatformAdmin | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const [row] = await db
    .select({ userId: platformAdmins.userId, email: user.email, name: user.name, twoFactorEnabled: user.twoFactorEnabled })
    .from(platformAdmins)
    .innerJoin(user, eq(user.id, platformAdmins.userId))
    .where(eq(platformAdmins.userId, session.user.id));
  return row ? { ...row, twoFactorEnabled: Boolean(row.twoFactorEnabled) } : null;
}

export const getPlatformAdmin = cache(async (): Promise<PlatformAdmin | null> => {
  const [{ headers }, { getAuth }, { getDb }] = await Promise.all([import('next/headers'), import('@/core/auth/session'), import('@/core/db/client')]);
  return resolvePlatformAdmin(await getAuth(), await getDb(), await headers());
});

export type PlatformCtx = {
  db: Db;
  admin: PlatformAdmin;
  /** Firma verisine yalnızca firma kapsamındaki güvenli kapıdan dokunulur; işlem firmanın denetim kaydına da yazılır. */
  inCompany<T>(companyId: string, fn: (tx: Tx, audit: (r: { entity: string; entityId: string; before?: unknown; after?: unknown }) => Promise<void>) => Promise<T>): Promise<T>;
  /** Merkez panel kaydı. */
  log(r: { targetCompanyId?: string | null; detail?: Record<string, unknown> }): Promise<void>;
};

type Spec<I, O> = { name: string; input: ZodType<I, ZodTypeDef, unknown>; rateLimit?: boolean; run: (ctx: PlatformCtx, input: I) => Promise<O> };

/** Merkez panel eylemi: oturum → platform yöneticisi → 2FA zorunlu → hız sınırı → doğrulama → iş → platform kaydı. */
export function definePlatformAction<I, O>(spec: Spec<I, O>) {
  return async (raw: unknown, runtime?: PlatformRuntime): Promise<ActionResult<O>> => {
    try {
      const rt = runtime ?? { admin: await getPlatformAdmin(), db: await (await import('@/core/db/client')).getDb() };
      const admin = rt.admin;
      if (!admin) throw new AppError('FORBIDDEN', 'Bu alan yalnızca merkez panel yöneticisine açıktır.');
      if (!admin.twoFactorEnabled) throw new AppError('FORBIDDEN', 'Merkez panel için iki adımlı doğrulama zorunludur.');
      if (spec.rateLimit !== false && !rt.batch) await checkRateLimit(rt.db, admin.userId);
      const input = spec.input.parse(raw, { errorMap: trErrorMap });
      const ctx: PlatformCtx = {
        db: rt.db,
        admin,
        inCompany: (companyId, fn) =>
          withCompany(
            companyId,
            (tx) => fn(tx, (r) => writeAudit(tx, { companyId, actorUserId: admin.userId, action: spec.name, ...r })),
            rt.db,
          ),
        log: async (r) => {
          await rt.db.insert(platformAudit).values({ actorUserId: admin.userId, action: spec.name, targetCompanyId: r.targetCompanyId ?? null, detail: r.detail ?? {} });
        },
      };
      return { ok: true, data: await spec.run(ctx, input) };
    } catch (e) {
      return toFailure(e, spec.name);
    }
  };
}
