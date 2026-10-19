import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

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

// Müşteri gözüyle bakış: panel yöneticisi gerekçeyle, süreli ve salt okunur olarak bir firmanın ekranlarını görür.
export const platformViews = pgTable(
  'platform_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: text('admin_user_id').notNull(),
    // company_id değil: firma tablolarına otomatik uygulanan satır güvenliği bu tabloya uygulanmamalı.
    targetCompanyId: uuid('target_company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    reason: text('reason').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('platform_views_admin_idx').on(t.adminUserId, t.expiresAt)],
);
