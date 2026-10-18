import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    orderId: uuid('order_id').notNull(),
    no: text('no').notNull(),
    stage: text('stage').notNull().default('waiting'),
    stageStatus: text('stage_status', { enum: ['waiting', 'in_progress'] }).notNull().default('waiting'),
    fabricReserved: boolean('fabric_reserved').notNull().default(false),
    producedQty: integer('produced_qty').notNull().default(0),
    shippedQty: integer('shipped_qty').notNull().default(0),
    reviewNote: text('review_note').notNull().default(''),
    cancelReason: text('cancel_reason'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('jobs_company_order_uq').on(t.companyId, t.orderId), index('jobs_company_stage_idx').on(t.companyId, t.stage)],
);

// Her aşama hareketi ayrı olay: kim, hangi makinede, hangi sonuçla (fire aşama bazında burada).
export const jobEvents = pgTable(
  'job_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    jobId: uuid('job_id').notNull(),
    stage: text('stage').notNull(),
    kind: text('kind').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    userId: text('user_id').notNull(),
    staffIds: uuid('staff_ids').array().notNull().default([]),
    machine: text('machine').notNull().default(''),
    data: jsonb('data').notNull().$type<Record<string, number | string | boolean>>().default({}),
    note: text('note').notNull().default(''),
  },
  (t) => [index('job_events_job_idx').on(t.companyId, t.jobId, t.at)],
);

export const fabricRolls = pgTable(
  'fabric_rolls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    widthCm: numeric('width_cm', { precision: 8, scale: 2 }).notNull(),
    colour: text('colour').notNull(),
    gsm: integer('gsm').notNull(),
    metres: integer('metres').notNull(),
    status: text('status', { enum: ['available', 'reserved', 'used'] }).notNull().default('available'),
    reservedJobId: uuid('reserved_job_id'),
    /** Ayrılan bobinin işteki kullanımı: kumaş veya sap. */
    reservedFor: text('reserved_for', { enum: ['fabric', 'handle'] }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fabric_rolls_status_idx').on(t.companyId, t.status)],
);

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    jobId: uuid('job_id').notNull(),
    qty: integer('qty').notNull(),
    shippedAt: date('shipped_at').notNull(),
    note: text('note').notNull().default(''),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('shipments_job_idx').on(t.companyId, t.jobId)],
);

// Müşteriye ait baskı klişeleri ve görselleri.
export const plates = pgTable(
  'plates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    partyId: uuid('party_id').notNull(),
    name: text('name').notNull(),
    colours: text('colours').notNull().default(''),
    fileIds: uuid('file_ids').array().notNull().default([]),
    notes: text('notes').notNull().default(''),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('plates_party_idx').on(t.companyId, t.partyId)],
);
