import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const ACCOUNT_KINDS = ['cash', 'bank'] as const;
export const INVOICE_KINDS = ['sales', 'purchase'] as const;
export const MOVEMENT_KINDS = ['collection', 'payment', 'expense', 'income', 'transfer', 'check'] as const;
export const CHECK_STATUSES = ['portfolio', 'collected', 'endorsed', 'returned', 'issued', 'paid', 'cancelled'] as const;

// Kasa ve banka hesapları. Para birimi açıldıktan sonra değişmez.
export const finAccounts = pgTable(
  'fin_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    kind: text('kind', { enum: ACCOUNT_KINDS }).notNull(),
    name: text('name').notNull(),
    currency: text('currency').notNull(),
    openingMinor: bigint('opening_minor', { mode: 'bigint' }).notNull().default(sql`0`),
    openingDate: date('opening_date').notNull(),
    bank: text('bank').notNull().default(''),
    iban: text('iban').notNull().default(''),
    archived: boolean('archived').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fin_accounts_company_idx').on(t.companyId, t.archived)],
);

// Fatura kayıtları: başka yerde (e-Fatura/e-Arşiv, kâğıt) kesilmiş faturanın cariye işlenmesi. Sistem fatura kesmez.
export const finInvoices = pgTable(
  'fin_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    kind: text('kind', { enum: INVOICE_KINDS }).notNull(),
    partyId: uuid('party_id').notNull(),
    docNo: text('doc_no').notNull(),
    date: date('date').notNull(),
    due: date('due'),
    currency: text('currency').notNull(),
    baseMinor: bigint('base_minor', { mode: 'bigint' }).notNull(),
    vatMinor: bigint('vat_minor', { mode: 'bigint' }).notNull(),
    withholdingMinor: bigint('withholding_minor', { mode: 'bigint' }).notNull().default(sql`0`),
    totalMinor: bigint('total_minor', { mode: 'bigint' }).notNull(),
    note: text('note').notNull().default(''),
    status: text('status', { enum: ['recorded', 'cancelled'] }).notNull().default('recorded'),
    cancelNote: text('cancel_note'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fin_invoices_party_idx').on(t.companyId, t.partyId, t.date), index('fin_invoices_date_idx').on(t.companyId, t.date)],
);

// Para hareketleri. Cari varsa cari bakiyesini, hesap varsa kasa/banka bakiyesini etkiler.
// direction 'in': firmaya giren (tahsilat), 'out': çıkan (ödeme, masraf). Silinmez; ters kayıt yerine reversedAt ile iptal edilir.
export const finMovements = pgTable(
  'fin_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    kind: text('kind', { enum: MOVEMENT_KINDS }).notNull(),
    direction: text('direction', { enum: ['in', 'out'] }).notNull(),
    partyId: uuid('party_id'),
    accountId: uuid('account_id'),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    vatMinor: bigint('vat_minor', { mode: 'bigint' }).notNull().default(sql`0`),
    currency: text('currency').notNull(),
    date: date('date').notNull(),
    category: text('category').notNull().default(''),
    note: text('note').notNull().default(''),
    checkId: uuid('check_id'),
    transferGroup: uuid('transfer_group'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reverseReason: text('reverse_reason'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fin_movements_party_idx').on(t.companyId, t.partyId, t.date),
    index('fin_movements_account_idx').on(t.companyId, t.accountId, t.date),
    index('fin_movements_date_idx').on(t.companyId, t.date),
  ],
);

// Çekler. Alınan: portföy → tahsil / ciro / karşılıksız-iade. Verilen: verildi → ödendi / iade.
export const finChecks = pgTable(
  'fin_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    direction: text('direction', { enum: ['received', 'issued'] }).notNull(),
    partyId: uuid('party_id').notNull(),
    checkNo: text('check_no').notNull(),
    bank: text('bank').notNull(),
    date: date('date').notNull(),
    due: date('due').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull(),
    status: text('status', { enum: CHECK_STATUSES }).notNull(),
    endorsedPartyId: uuid('endorsed_party_id'),
    note: text('note').notNull().default(''),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fin_checks_status_idx').on(t.companyId, t.status, t.due), index('fin_checks_party_idx').on(t.companyId, t.partyId)],
);

// Carinin açılış bakiyesi (para birimi başına). Artı: cari bize borçlu; eksi: biz cariye borçluyuz.
export const finOpenings = pgTable(
  'fin_openings',
  {
    companyId: uuid('company_id').notNull(),
    partyId: uuid('party_id').notNull(),
    currency: text('currency').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    date: date('date').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.partyId, t.currency] })],
);

export const RECONCILIATION_STATUSES = ['draft', 'pending', 'agreed', 'disputed', 'cancelled'] as const;

export type ReconciliationSnapshot = {
  company: string;
  partyName: string;
  taxId: string;
  rows: { date: string; text: string; debit: string; credit: string; balance: string }[];
  truncated: boolean;
};

export type ReconciliationResponse = { name: string; title: string; note: string; counterBalance: string | null; at: string; external: boolean };

// Cari mutabakat: belirli tarihteki bakiyenin dondurulmuş hâli ve karşı tarafın cevabı.
// Bağlantı gizli anahtarının yalnızca SHA-256 özeti saklanır; bağlantı yenilenince eskisi geçersiz olur.
export const finReconciliations = pgTable(
  'fin_reconciliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    no: text('no').notNull(),
    partyId: uuid('party_id').notNull(),
    currency: text('currency').notNull(),
    asOf: date('as_of').notNull(),
    balanceMinor: bigint('balance_minor', { mode: 'bigint' }).notNull(),
    snapshot: jsonb('snapshot').$type<ReconciliationSnapshot>().notNull(),
    email: text('email').notNull().default(''),
    contactName: text('contact_name').notNull().default(''),
    message: text('message').notNull().default(''),
    status: text('status', { enum: RECONCILIATION_STATUSES }).notNull().default('draft'),
    tokenHash: text('token_hash'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    response: jsonb('response').$type<ReconciliationResponse>(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (t) => [index('fin_reconciliations_party_idx').on(t.companyId, t.partyId, t.asOf), index('fin_reconciliations_status_idx').on(t.companyId, t.status)],
);
