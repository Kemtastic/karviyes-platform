import { integer, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Tek kullanımlık davet; token yalnızca SHA-256 özetiyle saklanır.
export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    roles: text('roles').array().notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** Var olan hesaba yanlış parola denemeleri; sınıra ulaşınca davet geçersiz olur. */
    failedAttempts: integer('failed_attempts').notNull().default(0),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('invites_company_idx').on(t.companyId)],
);
