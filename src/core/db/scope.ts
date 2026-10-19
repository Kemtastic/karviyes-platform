import { sql } from 'drizzle-orm';
import { getDb, type Db, type Tx } from './client';
import { dataDbFor } from './router';
import { auditLog } from './schema';

const ROLE_NAME = /^[a-z_][a-z0-9_]*$/;

// DB_APP_ROLE yalnızca rol adı olarak SQL'e girer; bu yüzden biçimi sıkı denetlenir.
function appRole(): string {
  const role = process.env.DB_APP_ROLE || 'app_user';
  if (!ROLE_NAME.test(role)) throw new Error('DB_APP_ROLE geçersiz');
  return role;
}

// Bütün iş sorguları bu sarmalayıcı içinde, uygulama rolüyle ve tek firma kapsamında çalışır.
// Bağlantı verilmezse firmanın veri veritabanı kullanılır (firmaya ayrı veritabanı varsa o).
export async function withCompany<T>(companyId: string, fn: (tx: Tx) => Promise<T>, db?: Db): Promise<T> {
  const database = db ?? (await dataDbFor(companyId, await getDb()));
  return database.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local role ${appRole()}`));
    await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
    return fn(tx as Tx);
  });
}

export type AuditEntry = {
  companyId: string;
  actorUserId: string | null;
  actorStaffId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    companyId: entry.companyId,
    actorUserId: entry.actorUserId,
    actorStaffId: entry.actorStaffId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
