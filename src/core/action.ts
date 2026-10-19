import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';
import type { CurrentUser } from '@/core/auth/session';
import { assertRoles, mustEnrollTwoFactor } from '@/core/auth/policy';
import { rowsOf, type Db, type Tx } from '@/core/db/client';
import { withCompany, writeAudit } from '@/core/db/scope';
import { AppError, type AppErrorCode } from '@/core/errors';
import type { InstallConfig } from '@/core/install-config';
import { requireModule } from '@/core/modules/registry';
import type { ModuleId, Role } from '@/core/modules/types';
import { trErrorMap } from '@/core/zod-tr';

export const WRITE_LIMIT_PER_MINUTE = 120;

// batch: sunucu içi toplu iş (örnek veri komutu) hız sınırına takılmaz; isteklerin varsayılan ortamında hiç kurulmaz.
export type ActionRuntime = { user: CurrentUser | null; db: Db; cfg: InstallConfig; batch?: boolean };

export type AuditRecord = { entity: string; entityId: string; before?: unknown; after?: unknown };

export type ActionCtx = {
  tx: Tx;
  user: CurrentUser;
  companyId: string;
  staffId: string | null;
  cfg: InstallConfig;
  audit(record: AuditRecord): Promise<void>;
};

export type ActionResult<O> =
  | { ok: true; data: O }
  | { ok: false; code: AppErrorCode; message: string; errorId?: string; fieldErrors?: Record<string, string> };

export type ActionSpec<I, O> = {
  name: string;
  module?: ModuleId;
  roles: Role[];
  input: ZodType<I, ZodTypeDef, unknown>;
  /** Okuma sorgularında false: yazma hız sınırını tüketmez. */
  rateLimit?: boolean;
  audit?: (input: I, output: O) => AuditRecord | null;
  run: (ctx: ActionCtx, input: I) => Promise<O>;
};

export type Action<O> = (raw: unknown, runtime?: ActionRuntime) => Promise<ActionResult<O>>;

export async function actionRuntime(): Promise<ActionRuntime> {
  const [{ getCurrentUser }, { getDb }, { getConfig }] = await Promise.all([
    import('@/core/auth/session'),
    import('@/core/db/client'),
    import('@/core/company/config'),
  ]);
  const user = await getCurrentUser();
  const main = await getDb();
  const { dataDbFor } = await import('@/core/db/router');
  return { user, db: user ? await dataDbFor(user.companyId, main) : main, cfg: await getConfig() };
}

// Sabit pencereli sayaç: pencere 60 sn; sayaç sınırı aşınca RATE_LIMITED.
export async function checkRateLimit(db: Db, userId: string): Promise<void> {
  const result = await db.execute(sql`
    insert into rate_limits (key, window_start, count) values (${'write:' + userId}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - interval '60 seconds' then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - interval '60 seconds' then now() else rate_limits.window_start end
    returning count`);
  const [row] = rowsOf<{ count: number }>(result);
  if (row && row.count > WRITE_LIMIT_PER_MINUTE) throw new AppError('RATE_LIMITED', 'Çok fazla işlem yapıldı. Bir dakika sonra tekrar deneyin.');
}

function fieldErrors(e: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}

function pgCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.cause?.code ?? err.code;
}

export function toFailure(e: unknown, actionName: string): ActionResult<never> {
  if (e instanceof AppError) return { ok: false, code: e.code, message: e.message, ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}) };
  if (e instanceof ZodError) return { ok: false, code: 'VALIDATION', message: 'Lütfen işaretli alanları düzeltin.', fieldErrors: fieldErrors(e) };
  if (pgCode(e) === '23505') return { ok: false, code: 'CONFLICT', message: 'Bu kayıt zaten var.' };
  const errorId = randomUUID();
  console.error(`[action:${actionName}] errorId=${errorId}`, e);
  return { ok: false, code: 'INTERNAL', message: 'Beklenmeyen bir hata oluştu.', errorId };
}

// Bütün yazma işlemleri buradan geçer: oturum → modül → rol → hız sınırı → doğrulama → firma kapsamlı işlem → audit.
export function defineAction<I, O>(spec: ActionSpec<I, O>): Action<O> {
  return async (raw, runtime) => {
    try {
      const rt = runtime ?? (await actionRuntime());
      const user = rt.user;
      if (!user) throw new AppError('UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
      if (user.readOnly) throw new AppError('FORBIDDEN', 'Müşteri gözüyle bakışta değişiklik yapılamaz.');
      // 2FA zorunlu rollerde yalnızca ekran düzeni değil, her eylem de 2FA ister.
      if (mustEnrollTwoFactor(user, rt.cfg)) throw new AppError('FORBIDDEN', 'Önce iki adımlı doğrulamayı kurmanız gerekiyor.');
      if (spec.module) requireModule(spec.module, rt.cfg);
      assertRoles(user.roles, spec.roles);
      if (spec.rateLimit !== false && !rt.batch) await checkRateLimit(rt.db, user.userId);
      const input = spec.input.parse(raw, { errorMap: trErrorMap });
      const data = await withCompany(
        user.companyId,
        async (tx) => {
          const write = (r: AuditRecord) =>
            writeAudit(tx, { companyId: user.companyId, actorUserId: user.userId, actorStaffId: user.staffId, action: spec.name, ...r });
          const output = await spec.run({ tx, user, companyId: user.companyId, staffId: user.staffId, cfg: rt.cfg, audit: write }, input);
          const record = spec.audit?.(input, output);
          if (record) await write(record);
          return output;
        },
        rt.db,
      );
      return { ok: true, data };
    } catch (e) {
      return toFailure(e, spec.name);
    }
  };
}
