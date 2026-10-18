import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction, type ActionCtx } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { parties } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { CURRENCIES, parseMoney, type Currency } from '@/core/money';
import type { Role } from '@/core/modules/types';
import { finAccounts, finChecks, finInvoices, finMovements, finOpenings } from '../db/schema';
import { invoiceTotals } from '../domain/ledger';

export const FIN: Role[] = ['admin', 'accounting'];

const isoDate = z.string().date('Tarih GG.AA.YYYY biçiminde olmalı.');
const notFuture = (field: string) => (d: string) => {
  if (d > istanbulToday()) throw new AppError('VALIDATION', 'İleri tarihli kayıt girilemez.', { [field]: 'Bugün veya önceki bir tarih seçin.' });
};
const currency = z.enum(CURRENCIES);
const note = z.string().trim().max(500).default('');

/** "1.234,56" biçimindeki tutarı kuruşa çevirir; sıfır ve eksi reddedilir. */
function positive(text: string, cur: Currency, field: string): bigint {
  let minor: bigint;
  try {
    minor = parseMoney(text, cur).minor;
  } catch (e) {
    throw new AppError('VALIDATION', (e as Error).message, { [field]: 'Örnek: 1.234,56' });
  }
  if (minor <= 0n) throw new AppError('VALIDATION', 'Tutar sıfırdan büyük olmalı.', { [field]: 'Sıfırdan büyük bir tutar girin.' });
  if (minor > 100_000_000_000_000n) throw new AppError('VALIDATION', 'Tutar çok büyük.', { [field]: 'Tutarı kontrol edin.' });
  return minor;
}

async function party(ctx: ActionCtx, id: string, want?: 'customer' | 'supplier', field = 'partyId') {
  const [p] = await ctx.tx.select({ id: parties.id, kind: parties.kind, archived: parties.archived, name: parties.name }).from(parties).where(eq(parties.id, id));
  if (!p || p.archived) throw new AppError('VALIDATION', 'Listeden aktif bir cari seçin.', { [field]: 'Listeden aktif bir cari seçin.' });
  if (want && p.kind !== want && p.kind !== 'both') {
    const text = want === 'customer' ? 'Bu kayıt için müşteri seçin.' : 'Bu kayıt için tedarikçi seçin.';
    throw new AppError('VALIDATION', text, { [field]: text });
  }
  return p;
}

async function account(ctx: ActionCtx, id: string, field = 'accountId') {
  const [a] = await ctx.tx.select().from(finAccounts).where(eq(finAccounts.id, id));
  if (!a || a.archived) throw new AppError('VALIDATION', 'Listeden açık bir kasa veya banka hesabı seçin.', { [field]: 'Hesap seçin.' });
  return { ...a, currency: a.currency as Currency };
}

// ── Kasa ve banka hesapları ────────────────────────────────────────────────

export const createAccount = defineAction({
  name: 'finance.createAccount',
  module: 'finance',
  roles: FIN,
  input: z.object({
    kind: z.enum(['cash', 'bank']),
    name: z.string().trim().min(2, 'Hesap adını yazın.').max(80),
    currency,
    opening: z.string().trim().max(30).default('0'),
    openingDate: isoDate,
    bank: z.string().trim().max(80).default(''),
    iban: z.string().trim().max(40).default(''),
  }),
  run: async (ctx, i) => {
    let opening: bigint;
    try {
      opening = parseMoney(i.opening || '0', i.currency).minor;
    } catch (e) {
      throw new AppError('VALIDATION', (e as Error).message, { opening: 'Örnek: 1.234,56' });
    }
    const iban = i.iban.replace(/\s/g, '').toUpperCase();
    if (iban && !/^TR\d{24}$/.test(iban)) throw new AppError('VALIDATION', 'IBAN TR ile başlayan 26 karakter olmalı.', { iban: 'TR ile başlayan 26 karakter.' });
    const [row] = await ctx.tx
      .insert(finAccounts)
      .values({ companyId: ctx.companyId, kind: i.kind, name: i.name, currency: i.currency, openingMinor: opening, openingDate: i.openingDate, bank: i.kind === 'bank' ? i.bank : '', iban: i.kind === 'bank' ? iban : '' })
      .returning({ id: finAccounts.id });
    await ctx.audit({ entity: 'fin_account', entityId: row!.id, after: { kind: i.kind, name: i.name, currency: i.currency, opening: opening.toString() } });
    return { id: row!.id };
  },
});

export const archiveAccount = defineAction({
  name: 'finance.archiveAccount',
  module: 'finance',
  roles: FIN,
  input: z.object({ id: z.string().uuid(), version: z.number().int(), archived: z.boolean() }),
  run: async (ctx, i) => {
    const [row] = await ctx.tx
      .update(finAccounts)
      .set({ archived: i.archived, version: i.version + 1 })
      .where(and(eq(finAccounts.id, i.id), eq(finAccounts.version, i.version)))
      .returning({ id: finAccounts.id });
    if (!row) throw new AppError('CONFLICT', 'Hesap başka biri tarafından değiştirildi. Sayfayı yenileyin.');
    await ctx.audit({ entity: 'fin_account', entityId: i.id, after: { archived: i.archived } });
    return { id: i.id };
  },
});

// ── Fatura kayıtları ───────────────────────────────────────────────────────

export const VAT_RATES = [0, 1, 10, 20] as const;

export const recordInvoice = defineAction({
  name: 'finance.recordInvoice',
  module: 'finance',
  roles: FIN,
  input: z.object({
    kind: z.enum(['sales', 'purchase']),
    partyId: z.string().uuid('Cari seçin.'),
    docNo: z.string().trim().min(1, 'Fatura numarasını yazın.').max(40),
    date: isoDate,
    due: isoDate.nullable().default(null),
    currency,
    base: z.string().trim().min(1, 'Matrahı yazın.').max(30),
    vatRate: z.coerce.number().min(0).max(100),
    withholding: z.coerce.number().int().min(0).max(10).default(0),
    note,
  }),
  run: async (ctx, i) => {
    await party(ctx, i.partyId, i.kind === 'sales' ? 'customer' : 'supplier');
    notFuture('date')(i.date);
    if (i.due && i.due < i.date) throw new AppError('VALIDATION', 'Vade fatura tarihinden önce olamaz.', { due: 'Fatura tarihi veya sonrası.' });
    const base = positive(i.base, i.currency, 'base');
    const t = invoiceTotals(base, i.vatRate, i.withholding);
    const [dup] = await ctx.tx
      .select({ id: finInvoices.id })
      .from(finInvoices)
      .where(and(eq(finInvoices.kind, i.kind), eq(finInvoices.partyId, i.partyId), eq(finInvoices.docNo, i.docNo), eq(finInvoices.status, 'recorded')));
    if (dup) throw new AppError('CONFLICT', 'Bu cari için aynı numaralı fatura zaten kayıtlı.', { docNo: 'Bu numara kayıtlı.' });
    const [row] = await ctx.tx
      .insert(finInvoices)
      .values({
        companyId: ctx.companyId, kind: i.kind, partyId: i.partyId, docNo: i.docNo, date: i.date, due: i.due, currency: i.currency,
        baseMinor: base, vatMinor: t.vat, withholdingMinor: t.withholding, totalMinor: t.total, note: i.note, createdBy: ctx.user.userId,
      })
      .returning({ id: finInvoices.id });
    await ctx.audit({ entity: 'fin_invoice', entityId: row!.id, after: { kind: i.kind, partyId: i.partyId, docNo: i.docNo, total: t.total.toString(), currency: i.currency } });
    return { id: row!.id, total: t.total.toString() };
  },
});

export const cancelInvoice = defineAction({
  name: 'finance.cancelInvoice',
  module: 'finance',
  roles: FIN,
  input: z.object({ id: z.string().uuid(), reason: z.string().trim().min(3, 'İptal nedenini yazın.').max(500) }),
  run: async (ctx, i) => {
    const [row] = await ctx.tx
      .update(finInvoices)
      .set({ status: 'cancelled', cancelNote: i.reason })
      .where(and(eq(finInvoices.id, i.id), eq(finInvoices.status, 'recorded')))
      .returning({ id: finInvoices.id });
    if (!row) throw new AppError('INVALID_STATE', 'Fatura kaydı bulunamadı ya da zaten iptal edilmiş.');
    await ctx.audit({ entity: 'fin_invoice', entityId: i.id, after: { status: 'cancelled', reason: i.reason } });
    return { id: i.id };
  },
});

// ── Para hareketleri ───────────────────────────────────────────────────────

/** Tahsilat (müşteriden giriş) ve ödeme (cariye çıkış). Para birimi hesabın para birimidir. */
export const recordPayment = defineAction({
  name: 'finance.recordPayment',
  module: 'finance',
  roles: FIN,
  input: z.object({ kind: z.enum(['collection', 'payment']), partyId: z.string().uuid('Cari seçin.'), accountId: z.string().uuid('Hesap seçin.'), amount: z.string().trim().min(1, 'Tutarı yazın.').max(30), date: isoDate, note }),
  run: async (ctx, i) => {
    await party(ctx, i.partyId);
    const a = await account(ctx, i.accountId);
    notFuture('date')(i.date);
    const amount = positive(i.amount, a.currency, 'amount');
    const [row] = await ctx.tx
      .insert(finMovements)
      .values({ companyId: ctx.companyId, kind: i.kind, direction: i.kind === 'collection' ? 'in' : 'out', partyId: i.partyId, accountId: a.id, amountMinor: amount, currency: a.currency, date: i.date, note: i.note, createdBy: ctx.user.userId })
      .returning({ id: finMovements.id });
    await ctx.audit({ entity: 'fin_movement', entityId: row!.id, after: { kind: i.kind, partyId: i.partyId, accountId: a.id, amount: amount.toString(), currency: a.currency } });
    return { id: row!.id };
  },
});

export const EXPENSE_CATEGORIES = ['Kira', 'Elektrik, su, doğalgaz', 'Personel', 'Yakıt ve ulaşım', 'Kargo ve nakliye', 'Bakım ve onarım', 'Vergi ve harç', 'Banka masrafı', 'Ofis ve kırtasiye', 'Yemek', 'Diğer'] as const;

/** Cariye bağlı olmayan kasa/banka çıkışı (masraf) ya da girişi (diğer gelir). Tutar KDV dahil girilir. */
export const recordExpense = defineAction({
  name: 'finance.recordExpense',
  module: 'finance',
  roles: FIN,
  input: z.object({
    direction: z.enum(['out', 'in']).default('out'),
    accountId: z.string().uuid('Hesap seçin.'),
    amount: z.string().trim().min(1, 'Tutarı yazın.').max(30),
    vatRate: z.coerce.number().min(0).max(100).default(0),
    category: z.string().trim().min(1, 'Kategori seçin.').max(60),
    date: isoDate,
    note,
  }),
  run: async (ctx, i) => {
    const a = await account(ctx, i.accountId);
    notFuture('date')(i.date);
    const amount = positive(i.amount, a.currency, 'amount');
    // KDV dahil tutardan KDV: tutar × oran / (100 + oran), kuruşa yuvarlanır.
    const rate = BigInt(Math.round(i.vatRate * 100));
    const vat = rate > 0n ? (amount * rate * 2n + (10000n + rate)) / ((10000n + rate) * 2n) : 0n;
    const [row] = await ctx.tx
      .insert(finMovements)
      .values({ companyId: ctx.companyId, kind: i.direction === 'out' ? 'expense' : 'income', direction: i.direction, accountId: a.id, amountMinor: amount, vatMinor: vat, currency: a.currency, date: i.date, category: i.category, note: i.note, createdBy: ctx.user.userId })
      .returning({ id: finMovements.id });
    await ctx.audit({ entity: 'fin_movement', entityId: row!.id, after: { kind: i.direction === 'out' ? 'expense' : 'income', accountId: a.id, amount: amount.toString(), category: i.category } });
    return { id: row!.id, vat: vat.toString() };
  },
});

/** Hesaplar arası virman: aynı para biriminde iki hareket, ortak grup kimliğiyle. */
export const transfer = defineAction({
  name: 'finance.transfer',
  module: 'finance',
  roles: FIN,
  input: z.object({ fromAccountId: z.string().uuid('Çıkış hesabını seçin.'), toAccountId: z.string().uuid('Giriş hesabını seçin.'), amount: z.string().trim().min(1, 'Tutarı yazın.').max(30), date: isoDate, note }),
  run: async (ctx, i) => {
    if (i.fromAccountId === i.toAccountId) throw new AppError('VALIDATION', 'Aynı hesaba virman yapılamaz.', { toAccountId: 'Farklı bir hesap seçin.' });
    const from = await account(ctx, i.fromAccountId, 'fromAccountId');
    const to = await account(ctx, i.toAccountId, 'toAccountId');
    if (from.currency !== to.currency) throw new AppError('VALIDATION', 'Virman yalnızca aynı para birimindeki hesaplar arasında yapılır.', { toAccountId: `${from.currency} hesabı seçin.` });
    notFuture('date')(i.date);
    const amount = positive(i.amount, from.currency, 'amount');
    const group = randomUUID();
    const base = { companyId: ctx.companyId, kind: 'transfer' as const, amountMinor: amount, currency: from.currency, date: i.date, note: i.note, transferGroup: group, createdBy: ctx.user.userId };
    await ctx.tx.insert(finMovements).values([
      { ...base, direction: 'out', accountId: from.id },
      { ...base, direction: 'in', accountId: to.id },
    ]);
    await ctx.audit({ entity: 'fin_transfer', entityId: group, after: { from: from.id, to: to.id, amount: amount.toString() } });
    return { group };
  },
});

/** Hareketi iptal eder (silmez). Virmanda iki taraf birlikte; çek hareketleri yalnızca çek ekranından. */
export const reverseMovement = defineAction({
  name: 'finance.reverseMovement',
  module: 'finance',
  roles: FIN,
  input: z.object({ id: z.string().uuid(), reason: z.string().trim().min(3, 'İptal nedenini yazın.').max(500) }),
  run: async (ctx, i) => {
    const [m] = await ctx.tx.select().from(finMovements).where(eq(finMovements.id, i.id));
    if (!m || m.reversedAt) throw new AppError('INVALID_STATE', 'Hareket bulunamadı ya da zaten iptal edilmiş.');
    if (m.checkId) throw new AppError('INVALID_STATE', 'Çek hareketleri Çekler ekranından iade veya iptal edilir.');
    const where = m.transferGroup ? eq(finMovements.transferGroup, m.transferGroup) : eq(finMovements.id, m.id);
    await ctx.tx.update(finMovements).set({ reversedAt: new Date(), reverseReason: i.reason }).where(and(where, isNull(finMovements.reversedAt)));
    await ctx.audit({ entity: 'fin_movement', entityId: m.id, after: { reversed: true, reason: i.reason, transferGroup: m.transferGroup } });
    return { id: m.id };
  },
});

/** Carinin açılış (devir) bakiyesi. Artı: cari bize borçlu; eksi: biz borçluyuz. Sıfır girilirse kaldırılır. */
export const setOpening = defineAction({
  name: 'finance.setOpening',
  module: 'finance',
  roles: FIN,
  input: z.object({ partyId: z.string().uuid(), currency, amount: z.string().trim().min(1).max(30), side: z.enum(['debit', 'credit']), date: isoDate }),
  run: async (ctx, i) => {
    await party(ctx, i.partyId);
    let minor: bigint;
    try {
      minor = parseMoney(i.amount, i.currency).minor;
    } catch (e) {
      throw new AppError('VALIDATION', (e as Error).message, { amount: 'Örnek: 1.234,56' });
    }
    if (minor < 0n) minor = -minor;
    const amount = i.side === 'credit' ? -minor : minor;
    if (amount === 0n) {
      await ctx.tx.delete(finOpenings).where(and(eq(finOpenings.partyId, i.partyId), eq(finOpenings.currency, i.currency)));
    } else {
      await ctx.tx
        .insert(finOpenings)
        .values({ companyId: ctx.companyId, partyId: i.partyId, currency: i.currency, amountMinor: amount, date: i.date })
        .onConflictDoUpdate({ target: [finOpenings.companyId, finOpenings.partyId, finOpenings.currency], set: { amountMinor: amount, date: i.date, updatedAt: new Date() } });
    }
    await ctx.audit({ entity: 'party', entityId: i.partyId, after: { opening: amount.toString(), currency: i.currency, date: i.date } });
    return { partyId: i.partyId };
  },
});

// ── Çekler ─────────────────────────────────────────────────────────────────

const checkInput = z.object({
  partyId: z.string().uuid('Cari seçin.'),
  checkNo: z.string().trim().min(1, 'Çek numarasını yazın.').max(40),
  bank: z.string().trim().min(2, 'Bankayı yazın.').max(80),
  date: isoDate,
  due: isoDate,
  amount: z.string().trim().min(1, 'Tutarı yazın.').max(30),
  currency,
  note,
});

async function newCheck(ctx: ActionCtx, i: z.infer<typeof checkInput>, direction: 'received' | 'issued') {
  await party(ctx, i.partyId, direction === 'received' ? undefined : 'supplier');
  notFuture('date')(i.date);
  if (i.due < i.date) throw new AppError('VALIDATION', 'Vade alış tarihinden önce olamaz.', { due: 'Tarih veya sonrası.' });
  const amount = positive(i.amount, i.currency, 'amount');
  const [dup] = await ctx.tx
    .select({ id: finChecks.id, status: finChecks.status })
    .from(finChecks)
    .where(and(eq(finChecks.direction, direction), eq(finChecks.bank, i.bank), eq(finChecks.checkNo, i.checkNo)));
  if (dup && dup.status !== 'returned' && dup.status !== 'cancelled') throw new AppError('CONFLICT', 'Bu banka ve numarayla kayıtlı bir çek var.', { checkNo: 'Bu çek kayıtlı.' });
  const [c] = await ctx.tx
    .insert(finChecks)
    .values({ companyId: ctx.companyId, direction, partyId: i.partyId, checkNo: i.checkNo, bank: i.bank, date: i.date, due: i.due, amountMinor: amount, currency: i.currency, status: direction === 'received' ? 'portfolio' : 'issued', note: i.note })
    .returning({ id: finChecks.id });
  // Çek alındığında/verildiğinde cari kapanır; kasa/banka çek tahsil edilince/ödenince değişir.
  await ctx.tx.insert(finMovements).values({
    companyId: ctx.companyId, kind: 'check', direction: direction === 'received' ? 'in' : 'out', partyId: i.partyId, amountMinor: amount, currency: i.currency,
    date: i.date, note: `Çek ${i.bank} ${i.checkNo}${i.note ? ` · ${i.note}` : ''}`, checkId: c!.id, createdBy: ctx.user.userId,
  });
  await ctx.audit({ entity: 'fin_check', entityId: c!.id, after: { direction, partyId: i.partyId, amount: amount.toString(), due: i.due } });
  return { id: c!.id };
}

export const receiveCheck = defineAction({ name: 'finance.receiveCheck', module: 'finance', roles: FIN, input: checkInput, run: (ctx, i) => newCheck(ctx, i, 'received') });
export const issueCheck = defineAction({ name: 'finance.issueCheck', module: 'finance', roles: FIN, input: checkInput, run: (ctx, i) => newCheck(ctx, i, 'issued') });

async function loadCheck(ctx: ActionCtx, id: string, version: number, from: (typeof finChecks.$inferSelect)['status'][]) {
  const [c] = await ctx.tx.select().from(finChecks).where(eq(finChecks.id, id));
  if (!c) throw new AppError('NOT_FOUND', 'Çek bulunamadı.');
  if (c.version !== version) throw new AppError('CONFLICT', 'Çek başka biri tarafından değiştirildi. Sayfayı yenileyin.');
  if (!from.includes(c.status)) throw new AppError('INVALID_STATE', 'Çekin durumu bu işleme uygun değil.');
  return { ...c, currency: c.currency as Currency };
}

async function setCheck(ctx: ActionCtx, id: string, version: number, set: Partial<typeof finChecks.$inferInsert>) {
  const [row] = await ctx.tx.update(finChecks).set({ ...set, version: version + 1 }).where(and(eq(finChecks.id, id), eq(finChecks.version, version))).returning({ id: finChecks.id });
  if (!row) throw new AppError('CONFLICT', 'Çek başka biri tarafından değiştirildi. Sayfayı yenileyin.');
}

const checkRef = { id: z.string().uuid(), version: z.number().int() };

/** Portföydeki çek bankaya/kasaya tahsil edilir ya da verilen çek hesaptan ödenir. */
export const settleCheck = defineAction({
  name: 'finance.settleCheck',
  module: 'finance',
  roles: FIN,
  input: z.object({ ...checkRef, accountId: z.string().uuid('Hesap seçin.'), date: isoDate }),
  run: async (ctx, i) => {
    const c = await loadCheck(ctx, i.id, i.version, ['portfolio', 'issued']);
    const a = await account(ctx, i.accountId);
    if (a.currency !== c.currency) throw new AppError('VALIDATION', `Çek ${c.currency}; aynı para biriminde hesap seçin.`, { accountId: `${c.currency} hesabı seçin.` });
    notFuture('date')(i.date);
    const received = c.direction === 'received';
    await ctx.tx.insert(finMovements).values({
      companyId: ctx.companyId, kind: 'check', direction: received ? 'in' : 'out', accountId: a.id, amountMinor: c.amountMinor, currency: c.currency,
      date: i.date, note: `Çek ${received ? 'tahsilatı' : 'ödemesi'} ${c.bank} ${c.checkNo}`, checkId: c.id, createdBy: ctx.user.userId,
    });
    await setCheck(ctx, c.id, c.version, { status: received ? 'collected' : 'paid' });
    await ctx.audit({ entity: 'fin_check', entityId: c.id, after: { status: received ? 'collected' : 'paid', accountId: a.id } });
    return { id: c.id };
  },
});

/** Portföydeki çek tedarikçiye ciro edilir: tedarikçiye ödeme sayılır. */
export const endorseCheck = defineAction({
  name: 'finance.endorseCheck',
  module: 'finance',
  roles: FIN,
  input: z.object({ ...checkRef, partyId: z.string().uuid('Tedarikçi seçin.'), date: isoDate }),
  run: async (ctx, i) => {
    const c = await loadCheck(ctx, i.id, i.version, ['portfolio']);
    if (i.partyId === c.partyId) throw new AppError('VALIDATION', 'Çek, alındığı cariye ciro edilemez. İade için "İade / karşılıksız" kullanın.', { partyId: 'Başka bir cari seçin.' });
    await party(ctx, i.partyId, 'supplier');
    notFuture('date')(i.date);
    await ctx.tx.insert(finMovements).values({
      companyId: ctx.companyId, kind: 'check', direction: 'out', partyId: i.partyId, amountMinor: c.amountMinor, currency: c.currency,
      date: i.date, note: `Ciro edilen çek ${c.bank} ${c.checkNo}`, checkId: c.id, createdBy: ctx.user.userId,
    });
    await setCheck(ctx, c.id, c.version, { status: 'endorsed', endorsedPartyId: i.partyId });
    await ctx.audit({ entity: 'fin_check', entityId: c.id, after: { status: 'endorsed', partyId: i.partyId } });
    return { id: c.id };
  },
});

/** Alınan çek iade/karşılıksız ya da verilen çek geri alındı: cari kaydı iptal edilir, borç geri gelir. */
export const returnCheck = defineAction({
  name: 'finance.returnCheck',
  module: 'finance',
  roles: FIN,
  input: z.object({ ...checkRef, reason: z.string().trim().min(3, 'Nedeni yazın.').max(500) }),
  run: async (ctx, i) => {
    const c = await loadCheck(ctx, i.id, i.version, ['portfolio', 'issued']);
    await ctx.tx
      .update(finMovements)
      .set({ reversedAt: new Date(), reverseReason: i.reason })
      .where(and(eq(finMovements.checkId, c.id), eq(finMovements.partyId, c.partyId), isNull(finMovements.reversedAt)));
    const status = c.direction === 'received' ? 'returned' : 'cancelled';
    await setCheck(ctx, c.id, c.version, { status, note: c.note ? `${c.note} · ${i.reason}` : i.reason });
    await ctx.audit({ entity: 'fin_check', entityId: c.id, after: { status, reason: i.reason } });
    return { id: c.id };
  },
});
