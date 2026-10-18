import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Yalnızca ekleme yapılır: uygulama rolünün UPDATE/DELETE yetkisi yoktur.
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    companyId: uuid('company_id').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: text('actor_user_id'),
    actorStaffId: uuid('actor_staff_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
  },
  (t) => [index('audit_log_company_at_idx').on(t.companyId, t.at), index('audit_log_entity_idx').on(t.companyId, t.entity, t.entityId)],
);
