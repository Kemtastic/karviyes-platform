import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Bir kullanıcının firmadaki rolleri. kind='device': bölüm tableti için tek bölüm rollü hesap.
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    userId: text('user_id').notNull(),
    roles: text('roles').array().notNull(),
    kind: text('kind', { enum: ['person', 'device'] }).notNull().default('person'),
    staffId: uuid('staff_id'),
    active: boolean('active').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('memberships_company_user_uq').on(t.companyId, t.userId), index('memberships_user_idx').on(t.userId)],
);
