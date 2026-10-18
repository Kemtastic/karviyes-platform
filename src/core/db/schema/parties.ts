import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const parties = pgTable(
  'parties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    kind: text('kind', { enum: ['customer', 'supplier', 'both'] }).notNull(),
    name: text('name').notNull(),
    legalType: text('legal_type', { enum: ['company', 'individual'] }).notNull().default('company'),
    taxId: text('tax_id').notNull().default(''),
    taxOffice: text('tax_office').notNull().default(''),
    city: text('city').notNull().default(''),
    district: text('district').notNull().default(''),
    address: text('address').notNull().default(''),
    contactName: text('contact_name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    notes: text('notes').notNull().default(''),
    archived: boolean('archived').notNull().default(false),
    searchKey: text('search_key').notNull().default(''),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('parties_company_search_idx').on(t.companyId, t.searchKey),
    // Aynı firmada aynı vergi numarasıyla tek aktif cari.
    uniqueIndex('parties_company_tax_uq').on(t.companyId, t.taxId).where(sql`${t.archived} = false and ${t.taxId} <> ''`),
  ],
);
