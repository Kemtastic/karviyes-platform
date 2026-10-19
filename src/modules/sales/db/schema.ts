import { date, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Müşteri aramaları: her kayıt bir görüşme; son kaydın sonraki tarihi takip listesini belirler.
export const salesCalls = pgTable(
  'sales_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    partyId: uuid('party_id').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    note: text('note').notNull(),
    nextDate: date('next_date'),
    createdBy: text('created_by').notNull(),
    staffId: uuid('staff_id'),
  },
  (t) => [index('sales_calls_party_idx').on(t.companyId, t.partyId, t.at)],
);

// Müşterinin satış takibindeki durumu: sorumlu satışçı ve öncelik (A önemli, B normal, C düşük).
export const PRIORITIES = ['A', 'B', 'C'] as const;
export const salesContacts = pgTable(
  'sales_contacts',
  {
    companyId: uuid('company_id').notNull(),
    partyId: uuid('party_id').notNull(),
    responsibleStaffId: uuid('responsible_staff_id'),
    priority: text('priority', { enum: PRIORITIES }).notNull().default('B'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.partyId] }), index('sales_contacts_staff_idx').on(t.companyId, t.responsibleStaffId)],
);
