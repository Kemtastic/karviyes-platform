import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Giriş yapmayan personel kartları (usta, toplayıcı, operatör). Formlarda "işi yapan" olarak seçilir.
export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['master', 'collector', 'operator', 'sales', 'other'] }).notNull().default('operator'),
  departments: text('departments').array().notNull().default([]),
  active: boolean('active').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
