import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction, type ActionCtx } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { parties } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { CURRENCIES, formatMoney, parseMoney, type Currency } from '@/core/money';
import { requireModule } from '@/core/modules/registry';
import type { Role } from '@/core/modules/types';
import { invoiceBreakdown, markOrderInvoiced, recordOrderPayment, revertOrderInvoiced, reverseOrderPayment } from '@/modules/orders/server/api';
import { finAccounts, finAllocations, finChecks, finInvoices, finMovements, finOpenings, finSettings } from '../db/schema';
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

/** Dönem kilidi: kilit tarihine (dahil) kadar kayıt, iptal ve iade yapılamaz. */
export async function lockedUntil(ctx: ActionCtx): Promise<string | null> {
  const [s] = await ctx.tx.select({ lockedUntil: finSettings.lockedUntil }).from(finSettings).where(eq(finSettings.companyId, ctx.companyId));
  return s?.lockedUntil ?? null;
}

async function assertOpen(ctx: ActionCtx, date: string, field = 'date') {
  const lock = await lockedUntil(ctx);
  if (lock && date <= lock) {
    const d = lock.split('-').reverse().join('.');
    throw new AppError('INVALID_STATE', `${d} tarihine kadarki dönem kilitli (KDV beyanı verilmiş). Kilitli döneme kayıt, iptal ya da iade yapılamaz.`, { [field]: `${d} sonrası bir tarih seçin.` });
  }
}

/** Kasa eksiye düşemez (bankada eksi bakiye kredili mevduatla mümkün olduğu için yalnız kasa denetlenir). */
async function assertCashCovers(ctx: ActionCtx, a: { id: string; kind: string; openingMinor: bigint; name: string; currency: Currency }, out: bigint, field = 'accountId') {
  if (a.kind !== 'cash') return;
  const [r] = await ctx.tx
    .select({ net: sql<string>`coalesce(sum(case when ${finMovements.direction} = 'in' then ${finMovements.amountMinor} else -${finMovements.amountMinor} end), 0)` })
    .from(finMovements)
    .where(and(eq(finMovements.accountId, a.id), isNull(finMovements.reversedAt)));
  const balance = a.openingMinor + BigInt(r?.net ?? '0');
  if (balance - out < 0n) throw new AppError('VALIDATION', `${a.name} bakiyesi yetersiz (kasa eksiye düşemez).`, { [field]: 'Kasa bakiyesi yetmiyor.' });
}

/**
 * Tahsilatı/ödemeyi seçilen faturalara sırayla dağıtır (her faturanın eşleşmemiş kalanı kadar).
 * Fatura aynı cariye ve para birimine ait, kayıtlı ve uygun türde olmalı.
 */
async function allocate(ctx: ActionCtx, i: { movementId: string; partyId: string; currency: Currency; amount: bigint; invoiceIds: string[]; kinds: ('sales' | 'purchase')[] }) {
  const invoices = await ctx.tx.select().from(finInvoices).where(inArray(finInvoices.id, i.invoiceIds));
  const used = await ctx.tx
    .select({ invoiceId: finAllocations.invoiceId, sum: sql<string>`sum(${finAllocations.amountMinor})` })
    .from(finAllocations)
    .innerJoin(finMovements, eq(finMovements.id, finAllocations.movementId))
    .where(and(inArray(finAllocations.invoiceId, i.invoiceIds), isNull(finMovements.reversedAt)))
    .groupBy(finAllocations.invoiceId);
  const usedOf = new Map(used.map((u) => [u.invoiceId, BigInt(u.sum)]));
  let left = i.amount;
  for (const id of [...new Set(i.invoiceIds)]) {
    const f = invoices.find((x) => x.id === id);
    if (!f || f.status !== 'recorded' || f.partyId !== i.partyId || f.currency !== i.currency || !(i.kinds as string[]).includes(f.kind)) {
      throw new AppError('VALIDATION', 'Eşleştirilen fatura bu cariye, para birimine ya da işleme uygun değil.', { invoiceIds: 'Listeden fatura seçin.' });
    }
    const open = f.totalMinor - (usedOf.get(id) ?? 0n);
    const take = left < open ? left : open;
    if (take <= 0n) continue;
    await ctx.tx.insert(finAllocations).values({ companyId: ctx.companyId, movementId: i.movementId, invoiceId: id, amountMinor: take });
    left -= take;
    if (left === 0n) break;
  }
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
/** e-Faturadaki KDV, hesaplanandan satır başına en çok bu kadar farklı girilebilir (kuruş yuvarlama farkları). */
const VAT_TOLERANCE = 100n;

/** Dövizli faturada kur zorunlu (TL karşılığı: KDV ve Ba-Bs için); TL faturada kur saklanmaz. */
function fxOf(i: { currency: Currency; fxRate?: string; fxRateDate?: string; date: string }): { fxRate: string | null; fxRateDate: string | null } {
  if (i.currency === 'TRY') return { fxRate: null, fxRateDate: null };
  const text = (i.fxRate ?? '').replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(text) || !(Number(text) > 0)) throw new AppError('VALIDATION', 'Dövizli faturada kur zorunlu (TL karşılığı için).', { fxRate: 'Kuru girin ya da TCMB\'den getirin.' });
  return { fxRate: text, fxRateDate: i.fxRateDate ?? i.date };
}

/** Oran satırlarından fatura toplamı: her oranın KDV'si ayrı yuvarlanır; tevkifat toplam KDV üzerinden. */
function invoiceFromLines(lines: { base: string; vatRate: number; vat?: string }[], cur: Currency, withholdingTenths: number) {
  if (!lines.length) throw new AppError('VALIDATION', 'Matrahı yazın.', { base: 'Matrahı yazın.' });
  let base = 0n;
  let vat = 0n;
  const rates: { rate: string; base: string; vat: string }[] = [];
  lines.forEach((l, idx) => {
    const field = lines.length > 1 ? `lines.${idx}.base` : 'base';
    const b = positive(l.base, cur, field);
    let v = invoiceTotals(b, l.vatRate).vat;
    if (l.vat) {
      let given: bigint;
      try {
        given = parseMoney(l.vat, cur).minor;
      } catch (e) {
        throw new AppError('VALIDATION', (e as Error).message, { [`lines.${idx}.vat`]: 'Örnek: 1.234,56' });
      }
      const diff = given > v ? given - v : v - given;
      if (given < 0n || diff > VAT_TOLERANCE) throw new AppError('VALIDATION', `KDV hesaplanandan çok farklı (hesaplanan ${formatMoney({ minor: v, currency: cur })}).`, { [`lines.${idx}.vat`]: 'Matrah ve oranı kontrol edin.' });
      v = given;
    }
    base += b;
    vat += v;
    const rate = String(l.vatRate);
    const same = rates.find((r) => r.rate === rate);
    if (same) {
      same.base = (BigInt(same.base) + b).toString();
      same.vat = (BigInt(same.vat) + v).toString();
    } else rates.push({ rate, base: b.toString(), vat: v.toString() });
  });
  const withholding = (vat * BigInt(withholdingTenths) + 5n) / 10n;
  return { base, vat, withholding, total: base + vat - withholding, rates };
}

export const recordInvoice = defineAction({
  name: 'finance.recordInvoice',
  module: 'finance',
  roles: FIN,
  input: z.object({
    kind: z.enum(['sales', 'purchase', 'sales_return', 'purchase_return']),
    partyId: z.string().uuid('Cari seçin.'),
    docNo: z.string().trim().min(1, 'Fatura numarasını yazın.').max(40),
    date: isoDate,
    due: isoDate.nullable().default(null),
    currency,
    // Tek oranlı fatura için base + vatRate; karışık oranlı için lines (her oran ayrı satır).
    base: z.string().trim().max(30).optional(),
    vatRate: z.coerce.number().min(0).max(100).optional(),
    lines: z.array(z.object({ base: z.string().trim().min(1, 'Matrahı yazın.').max(30), vatRate: z.coerce.number().min(0).max(100), vat: z.string().trim().max(30).optional() })).min(1).max(6).optional(),
    withholding: z.coerce.number().int().min(0).max(10).default(0),
    fxRate: z.string().trim().max(20).optional(),
    fxRateDate: isoDate.optional(),
    note,
  }),
  run: async (ctx, i) => {
    await party(ctx, i.partyId, i.kind === 'sales' || i.kind === 'sales_return' ? 'customer' : 'supplier');
    const fx = fxOf(i);
    notFuture('date')(i.date);
    await assertOpen(ctx, i.date);
    if (i.due && i.due < i.date) throw new AppError('VALIDATION', 'Vade fatura tarihinden önce olamaz.', { due: 'Fatura tarihi veya sonrası.' });
    const t = invoiceFromLines(i.lines ?? (i.base ? [{ base: i.base, vatRate: i.vatRate ?? 0 }] : []), i.currency, i.withholding);
    const [dup] = await ctx.tx
      .select({ id: finInvoices.id })
      .from(finInvoices)
      .where(and(eq(finInvoices.kind, i.kind), eq(finInvoices.partyId, i.partyId), eq(finInvoices.docNo, i.docNo), eq(finInvoices.status, 'recorded')));
    if (dup) throw new AppError('CONFLICT', 'Bu cari için aynı numaralı fatura zaten kayıtlı.', { docNo: 'Bu numara kayıtlı.' });
    const [row] = await ctx.tx
      .insert(finInvoices)
      .values({
        companyId: ctx.companyId, kind: i.kind, partyId: i.partyId, docNo: i.docNo, date: i.date, due: i.due, currency: i.currency,
        baseMinor: t.base, vatMinor: t.vat, withholdingMinor: t.withholding, totalMinor: t.total, rates: t.rates, ...fx, note: i.note, createdBy: ctx.user.userId,
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
    const [inv] = await ctx.tx.select({ date: finInvoices.date, orderId: finInvoices.orderId }).from(finInvoices).where(eq(finInvoices.id, i.id));
    if (inv) await assertOpen(ctx, inv.date, 'reason');
    const [row] = await ctx.tx
      .update(finInvoices)
      .set({ status: 'cancelled', cancelNote: i.reason })
      .where(and(eq(finInvoices.id, i.id), eq(finInvoices.status, 'recorded')))
      .returning({ id: finInvoices.id });
    if (!row) throw new AppError('INVALID_STATE', 'Fatura kaydı bulunamadı ya da zaten iptal edilmiş.');
    // Siparişten işlenen fatura iptal edilirse sipariş yeniden faturalanabilir olur.
    if (inv?.orderId) await revertOrderInvoiced(ctx, inv.orderId, i.reason);
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
  input: z.object({ kind: z.enum(['collection', 'payment']), partyId: z.string().uuid('Cari seçin.'), accountId: z.string().uuid('Hesap seçin.'), amount: z.string().trim().min(1, 'Tutarı yazın.').max(30), date: isoDate, note, orderId: z.string().uuid().nullable().default(null), invoiceIds: z.array(z.string().uuid()).max(20).default([]) }),
  run: async (ctx, i) => {
    await party(ctx, i.partyId);
    const a = await account(ctx, i.accountId);
    notFuture('date')(i.date);
    await assertOpen(ctx, i.date);
    const amount = positive(i.amount, a.currency, 'amount');
    if (i.kind === 'payment') await assertCashCovers(ctx, a, amount);
    const [row] = await ctx.tx
      .insert(finMovements)
      .values({ companyId: ctx.companyId, kind: i.kind, direction: i.kind === 'collection' ? 'in' : 'out', partyId: i.partyId, accountId: a.id, amountMinor: amount, currency: a.currency, date: i.date, note: i.note, createdBy: ctx.user.userId })
      .returning({ id: finMovements.id });
    if (i.invoiceIds.length) await allocate(ctx, { movementId: row!.id, partyId: i.partyId, currency: a.currency, amount, invoiceIds: i.invoiceIds, kinds: i.kind === 'collection' ? ['sales'] : ['purchase'] });
    // Tahsilat bir siparişe aitse sipariş bakiyesine de işlenir (aynı işlem içinde; biri olmazsa ikisi de olmaz).
    let order: string | null = null;
    if (i.orderId) {
      if (i.kind !== 'collection') throw new AppError('VALIDATION', 'Yalnızca tahsilat siparişe bağlanır.', { orderId: 'Tahsilatta kullanılır.' });
      requireModule('orders', ctx.cfg);
      const op = await recordOrderPayment(ctx, { orderId: i.orderId, partyId: i.partyId, amountMinor: amount, currency: a.currency, paidAt: i.date, note: i.note || 'Ön muhasebe tahsilatı' });
      await ctx.tx.update(finMovements).set({ orderPaymentId: op.id }).where(eq(finMovements.id, row!.id));
      order = op.no;
    }
    await ctx.audit({ entity: 'fin_movement', entityId: row!.id, after: { kind: i.kind, partyId: i.partyId, accountId: a.id, amount: amount.toString(), currency: a.currency, order } });
    return { id: row!.id, order };
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
    return writeExpense(ctx, { ...i, amountMinor: positive(i.amount, a.currency, 'amount') });
  },
});

/** Masraf/gelir hareketi (elle giriş ve tekrarlayan kayıt aynı denetimlerden geçer): tarih, dönem kilidi, kasa yeterliliği, KDV ayrımı. */
export async function writeExpense(ctx: ActionCtx, i: { direction: 'in' | 'out'; accountId: string; amountMinor: bigint; vatRate: number; category: string; date: string; note: string }) {
  const a = await account(ctx, i.accountId);
  notFuture('date')(i.date);
  await assertOpen(ctx, i.date);
  const amount = i.amountMinor;
  if (i.direction === 'out') await assertCashCovers(ctx, a, amount);
  // KDV dahil tutardan KDV: tutar × oran / (100 + oran), kuruşa yuvarlanır.
  const rate = BigInt(Math.round(i.vatRate * 100));
  const vat = rate > 0n ? (amount * rate * 2n + (10000n + rate)) / ((10000n + rate) * 2n) : 0n;
  const [row] = await ctx.tx
    .insert(finMovements)
    .values({ companyId: ctx.companyId, kind: i.direction === 'out' ? 'expense' : 'income', direction: i.direction, accountId: a.id, amountMinor: amount, vatMinor: vat, currency: a.currency, date: i.date, category: i.category, note: i.note, createdBy: ctx.user.userId })
    .returning({ id: finMovements.id });
  await ctx.audit({ entity: 'fin_movement', entityId: row!.id, after: { kind: i.direction === 'out' ? 'expense' : 'income', accountId: a.id, amount: amount.toString(), category: i.category } });
  return { id: row!.id, vat: vat.toString() };
}

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
    await assertOpen(ctx, i.date);
    const amount = positive(i.amount, from.currency, 'amount');
    await assertCashCovers(ctx, from, amount, 'fromAccountId');
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
    await assertOpen(ctx, m.date, 'reason');
    const where = m.transferGroup ? eq(finMovements.transferGroup, m.transferGroup) : eq(finMovements.id, m.id);
    await ctx.tx.update(finMovements).set({ reversedAt: new Date(), reverseReason: i.reason }).where(and(where, isNull(finMovements.reversedAt)));
    if (m.orderPaymentId) await reverseOrderPayment(ctx, m.orderPaymentId, i.reason);
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
    await assertOpen(ctx, i.date);
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
  await assertOpen(ctx, i.date);
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
    await assertOpen(ctx, i.date);
    const received = c.direction === 'received';
    if (!received) await assertCashCovers(ctx, a, c.amountMinor);
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
    await assertOpen(ctx, i.date);
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
/**
 * Alınan çek iade/karşılıksız (portföyde ya da ciro edildikten sonra geri döndü) ya da verilen çek geri alındı.
 * Kayıt silinmez: carilere görünür ters hareket yazılır (ekstrede "çek alındı" ve "karşılıksız" satırları birlikte durur).
 */
export const returnCheck = defineAction({
  name: 'finance.returnCheck',
  module: 'finance',
  roles: FIN,
  input: z.object({ ...checkRef, reason: z.string().trim().min(3, 'Nedeni yazın.').max(500) }),
  run: async (ctx, i) => {
    const c = await loadCheck(ctx, i.id, i.version, ['portfolio', 'issued', 'endorsed']);
    const date = istanbulToday();
    await assertOpen(ctx, date, 'reason');
    const back = (partyId: string, direction: 'in' | 'out', text: string) =>
      ctx.tx.insert(finMovements).values({
        companyId: ctx.companyId, kind: 'check', direction, partyId, amountMinor: c.amountMinor, currency: c.currency, date,
        note: `${text} ${c.bank} ${c.checkNo} · ${i.reason}`, checkId: c.id, createdBy: ctx.user.userId,
      });
    if (c.direction === 'received') {
      // Müşterinin borcu geri gelir.
      await back(c.partyId, 'out', 'Karşılıksız / iade çek');
      // Ciro edildiyse tedarikçi çeki bize geri verdi: tedarikçiye ödeme sayılmaz, borcumuz geri gelir.
      if (c.status === 'endorsed' && c.endorsedPartyId) await back(c.endorsedPartyId, 'in', 'Ciro edilen çek geri döndü');
    } else {
      await back(c.partyId, 'in', 'Verilen çek geri alındı');
    }
    const status = c.direction === 'received' ? 'returned' : 'cancelled';
    await setCheck(ctx, c.id, c.version, { status, note: c.note ? `${c.note} · ${i.reason}` : i.reason });
    await ctx.audit({ entity: 'fin_check', entityId: c.id, after: { status, reason: i.reason, from: c.status } });
    return { id: c.id };
  },
});

/** Dönem kilidi: KDV beyanından sonra o tarihe kadarki kayıtlar kilitlenir. Kilidi geri almak yalnızca yöneticidir. */
export const setPeriodLock = defineAction({
  name: 'finance.setPeriodLock',
  module: 'finance',
  roles: FIN,
  input: z.object({ lockedUntil: isoDate.nullable() }),
  run: async (ctx, i) => {
    const current = await lockedUntil(ctx);
    if (i.lockedUntil && i.lockedUntil >= istanbulToday()) throw new AppError('VALIDATION', 'Bugün ve sonrası kilitlenemez.', { lockedUntil: 'Geçmiş bir tarih seçin.' });
    const loosening = current && (!i.lockedUntil || i.lockedUntil < current);
    if (loosening && !ctx.user.roles.includes('admin')) throw new AppError('FORBIDDEN', 'Kilitli dönemi yalnızca yönetici açabilir.');
    await ctx.tx
      .insert(finSettings)
      .values({ companyId: ctx.companyId, lockedUntil: i.lockedUntil, updatedBy: ctx.user.userId })
      .onConflictDoUpdate({ target: finSettings.companyId, set: { lockedUntil: i.lockedUntil, updatedAt: new Date(), updatedBy: ctx.user.userId } });
    await ctx.audit({ entity: 'fin_settings', entityId: ctx.companyId, before: { lockedUntil: current }, after: { lockedUntil: i.lockedUntil } });
    return { lockedUntil: i.lockedUntil };
  },
});

/**
 * Siparişin faturası kesildiğinde (e-Fatura/e-Arşiv tarafında) sipariş "fatura kesildi" yapılır ve aynı fatura
 * cariye satış faturası olarak işlenir. Tutarlar sipariş satırlarından hesaplanır; ikisi aynı işlemdedir.
 */
export const recordOrderInvoice = defineAction({
  name: 'finance.recordOrderInvoice',
  module: 'finance',
  roles: ['admin', 'tracking', 'accounting'],
  input: z.object({ orderId: z.string().uuid(), version: z.number().int(), docNo: z.string().trim().min(1, 'Fatura numarasını yazın.').max(40), date: isoDate, due: isoDate.nullable().default(null) }),
  run: async (ctx, i) => {
    requireModule('orders', ctx.cfg);
    notFuture('date')(i.date);
    await assertOpen(ctx, i.date);
    if (i.due && i.due < i.date) throw new AppError('VALIDATION', 'Vade fatura tarihinden önce olamaz.', { due: 'Fatura tarihi veya sonrası.' });
    const b = await invoiceBreakdown(ctx, i.orderId);
    if (b.base <= 0n) throw new AppError('INVALID_STATE', 'Faturalanacak tutar yok.');
    await markOrderInvoiced(ctx, { orderId: i.orderId, version: i.version, invoiceNo: i.docNo, invoiceDate: i.date });
    const [dup] = await ctx.tx
      .select({ id: finInvoices.id })
      .from(finInvoices)
      .where(and(eq(finInvoices.kind, 'sales'), eq(finInvoices.partyId, b.order.partyId), eq(finInvoices.docNo, i.docNo), eq(finInvoices.status, 'recorded')));
    if (dup) throw new AppError('CONFLICT', 'Bu cari için aynı numaralı fatura zaten kayıtlı.', { docNo: 'Bu numara kayıtlı.' });
    const [row] = await ctx.tx
      .insert(finInvoices)
      .values({
        companyId: ctx.companyId, kind: 'sales', partyId: b.order.partyId, docNo: i.docNo, date: i.date, due: i.due, currency: b.currency,
        baseMinor: b.base, vatMinor: b.vat, totalMinor: b.base + b.vat, rates: b.rates, note: `Sipariş ${b.order.no}`, orderId: i.orderId, createdBy: ctx.user.userId,
      })
      .returning({ id: finInvoices.id });
    await ctx.audit({ entity: 'fin_invoice', entityId: row!.id, after: { kind: 'sales', orderId: i.orderId, docNo: i.docNo, total: (b.base + b.vat).toString() } });
    return { id: row!.id, total: (b.base + b.vat).toString() };
  },
});
