import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Merkez panel yöneticileri (kurucu). Firmaların kullanıcılarından ayrıdır; uygulama rolü bu tabloları göremez.
export const platformAdmins = pgTable('platform_admins', {
  userId: text('user_id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').notNull(),
});

// Merkez panelde yapılan her işlem: kim, ne zaman, hangi firmada, ne değişti.
export const platformAudit = pgTable(
  'platform_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: text('actor_user_id').notNull(),
    action: text('action').notNull(),
    targetCompanyId: uuid('target_company_id'),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('platform_audit_at_idx').on(t.at), index('platform_audit_company_idx').on(t.targetCompanyId, t.at)],
);
