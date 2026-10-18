import { bigint, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const ORDER_STATUSES = ['draft', 'in_production', 'ready_to_invoice', 'invoiced', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Satır durumu: açık (işi yok), üretimde, bitti (kontrol onaylandı), iptal.
export const LINE_STATUSES = ['open', 'in_production', 'done', 'cancelled'] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    no: text('no').notNull(),
    partyId: uuid('party_id').notNull(),
    salespersonStaffId: uuid('salesperson_staff_id'),
    orderDate: date('order_date').notNull(),
    // v1.1'den beri ürün bilgisi order_lines'tadır; bu dört alan ve packaging/departmentNotes yalnızca eski kayıtlar için durur (sonraki sürümde kaldırılacak).
    product: jsonb('product').$type<Record<string, unknown>>(),
    quantity: integer('quantity'),
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }),
    currency: text('currency').notNull(),
    fxRate: numeric('fx_rate', { precision: 18, scale: 6 }),
    fxRateDate: date('fx_rate_date'),
    fxSource: text('fx_source'),
    totalMinor: bigint('total_minor', { mode: 'bigint' }).notNull(),
    packaging: jsonb('packaging').$type<{ type: string; capacity: number; packages: number }>(),
    departmentNotes: jsonb('department_notes').$type<Record<string, string>>(),
    status: text('status', { enum: ORDER_STATUSES }).notNull().default('draft'),
    invoiceMark: jsonb('invoice_mark').$type<{ no: string; date: string; by: string; at: string } | null>(),
    producedQty: integer('produced_qty').notNull().default(0),
    shippedQty: integer('shipped_qty').notNull().default(0),
    cancelReason: text('cancel_reason'),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('orders_company_no_uq').on(t.companyId, t.no), index('orders_company_status_idx').on(t.companyId, t.status), index('orders_party_idx').on(t.companyId, t.partyId)],
);

// Siparişin ürün satırları: her satırın kendi ürünü, adedi, fiyatı, KDV'si ve üretim işi vardır.
export const orderLines = pgTable(
  'order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    orderId: uuid('order_id').notNull(),
    lineNo: integer('line_no').notNull(),
    product: jsonb('product').notNull().$type<Record<string, unknown>>(),
    quantity: integer('quantity').notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull(),
    totalMinor: bigint('total_minor', { mode: 'bigint' }).notNull(),
    packaging: jsonb('packaging').notNull().$type<{ type: string; capacity: number; packages: number }>(),
    departmentNotes: jsonb('department_notes').notNull().$type<Record<string, string>>().default({}),
    status: text('status', { enum: LINE_STATUSES }).notNull().default('open'),
    producedQty: integer('produced_qty').notNull().default(0),
    shippedQty: integer('shipped_qty').notNull().default(0),
    cancelReason: text('cancel_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('order_lines_order_no_uq').on(t.companyId, t.orderId, t.lineNo), index('order_lines_status_idx').on(t.companyId, t.status)],
);

export const orderPayments = pgTable(
  'order_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    orderId: uuid('order_id').notNull(),
    kind: text('kind', { enum: ['deposit', 'payment', 'correction'] }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull(),
    paidAt: date('paid_at').notNull(),
    note: text('note').notNull().default(''),
    correctsPaymentId: uuid('corrects_payment_id'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_payments_order_idx').on(t.companyId, t.orderId)],
);

// Firma ve yıl bazında sıralı sipariş numarası sayacı.
export const orderCounters = pgTable(
  'order_counters',
  {
    companyId: uuid('company_id').notNull(),
    year: integer('year').notNull(),
    next: integer('next').notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.year] })],
);
