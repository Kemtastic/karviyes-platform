import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { feature } from '@/core/features';
import { markOrderInvoiced } from './api';
import { defineAction, type ActionCtx } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { parties, staff } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { CURRENCIES, money, moneyToJSON, parseMoney, type Currency } from '@/core/money';
import type { Role } from '@/core/modules/types';
import { plates } from '@/modules/production/db/schema';
import { getSector } from '@/sectors';
import { orderCounters, orderLines, orderPayments, orders } from '../db/schema';
import { packagingPlan } from '../domain/packaging';
import { computeOrderTotal, parseRate, parseUnitPrice } from '../domain/totals';

const OFFICE: Role[] = ['admin', 'sales', 'tracking'];
export const MAX_LINES = 20;

const lineFields = {
  product: z.record(z.unknown()),
  quantity: z.coerce.number().int().positive().max(10_000_000, 'Adet en çok 10.000.000 olabilir.').optional(),
  unitPrice: z.string().min(1),
  vatRate: z.string().min(1),
  packaging: z.object({ type: z.enum(['sack', 'box', 'none']), capacity: z.coerce.number().int().min(0) }),
  departmentNotes: z.record(z.string().max(1000)).default({}),
  plateId: z.string().uuid().nullable().optional(),
};
const lineInput = z.object(lineFields);
type LineInput = z.infer<typeof lineInput>;

// Sipariş başlığı ve ürün satırları. Tek ürünlü sipariş için satır alanları doğrudan da verilebilir (lines yerine).
const orderBase = z.object({
  partyId: z.string().uuid(),
  salespersonStaffId: z.string().uuid(),
  orderDate: z.string().date(),
  deliveryDate: z.string().date().nullable().optional(),
  currency: z.enum(CURRENCIES),
  fxRate: z.string().optional(),
  fxRateDate: z.string().date().optional(),
  fxSource: z.string().max(80).optional(),
  deposit: z.string().optional(),
  lines: z.array(lineInput).min(1, 'En az bir ürün girin.').max(MAX_LINES, `Bir siparişte en çok ${MAX_LINES} ürün olabilir.`).optional(),
  product: lineFields.product.optional(),
  quantity: lineFields.quantity,
  unitPrice: lineFields.unitPrice.optional(),
  vatRate: lineFields.vatRate.optional(),
  packaging: lineFields.packaging.optional(),
  departmentNotes: lineFields.departmentNotes.optional(),
  plateId: lineFields.plateId,
});
type OrderInput = z.infer<typeof orderBase>;

const requireLines = (i: OrderInput, ctx: z.RefinementCtx) => {
  if (!i.lines && !i.product) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'En az bir ürün girin.' });
};

// Tek ürünlü biçim tek satırlı siparişe çevrilir; alan hataları eski adlarıyla ("product.width") döner.
function linesOf(i: OrderInput): { lines: LineInput[]; single: boolean } {
  if (i.lines) return { lines: i.lines, single: false };
  return {
    single: true,
    lines: [{ product: i.product ?? {}, quantity: i.quantity, unitPrice: i.unitPrice ?? '', vatRate: i.vatRate ?? '', packaging: i.packaging ?? { type: 'none', capacity: 0 }, departmentNotes: i.departmentNotes ?? {}, plateId: i.plateId }],
  };
}

function prefixErrors(e: unknown, prefix: string): never {
  if (e instanceof AppError && e.fieldErrors && prefix) {
    throw new AppError(e.code, e.message, Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [`${prefix}${k}`, v])));
  }
  throw e;
}

function prepareLine(ctx: ActionCtx, l: LineInput, currency: Currency) {
  const sector = getSector(ctx.cfg.sector);
  let product: Record<string, unknown>;
  try {
    product = sector.validateProduct(l.product);
  } catch (e) {
    prefixErrors(e, 'product.');
  }
  const unitPrice = parseUnitPrice(l.unitPrice);
  const vatRate = parseRate(l.vatRate, 'vatRate', 'KDV oranı');
  // Veritabanı KDV oranını 2 ondalıkla saklar; tutar da aynı oranla hesaplanmalı.
  if (/\.\d{3,}$/.test(vatRate)) throw new AppError('VALIDATION', 'KDV oranı en çok 2 ondalık olabilir.', { vatRate: 'KDV oranı en çok 2 ondalık olabilir.' });
  if (Number(vatRate) > 100) throw new AppError('VALIDATION', 'KDV oranı 0–100 arasında olmalı.', { vatRate: 'KDV oranı 0–100 arasında olmalı.' });
  const quantity = l.quantity ?? sector.targetQuantity(product);
  if (!quantity) throw new AppError('VALIDATION', 'Hedef adet hesaplanamadı; ölçüleri kontrol edin.', { quantity: 'Adet hesaplanamadı.' });
  let packaging;
  try {
    packaging = packagingPlan(l.packaging, quantity);
  } catch (e) {
    throw new AppError('VALIDATION', (e as Error).message, { 'packaging.capacity': (e as Error).message });
  }
  const departmentNotes = Object.fromEntries(Object.entries(l.departmentNotes).filter(([k, v]) => sector.stages.some((s) => s.id === k) && v.trim()));
  const total = computeOrderTotal(unitPrice, quantity, vatRate, currency);
  return { product, unitPrice, vatRate, quantity, packaging, departmentNotes, totalMinor: total.minor, plateId: l.plateId ?? null };
}

// Sipariş alanlarını doğrular ve hesaplar. Satır hataları çok satırlı biçimde "lines.<n>." önekiyle döner.
async function prepare(ctx: ActionCtx, i: OrderInput) {
  const { lines, single } = linesOf(i);
  const prepared = lines.map((l, n) => {
    try {
      return prepareLine(ctx, l, i.currency);
    } catch (e) {
      prefixErrors(e, single ? '' : `lines.${n}.`);
    }
  });
  const [party] = await ctx.tx.select({ id: parties.id, kind: parties.kind }).from(parties).where(and(eq(parties.id, i.partyId), eq(parties.archived, false)));
  if (!party || party.kind === 'supplier') throw new AppError('VALIDATION', 'Müşteri seçin.', { partyId: 'Listeden bir müşteri seçin.' });
  const [seller] = await ctx.tx.select().from(staff).where(eq(staff.id, i.salespersonStaffId));
  if (!seller?.active || !seller.departments.includes('sales')) {
    throw new AppError('VALIDATION', 'Satış yapan kişiyi satış personelinden seçin.', { salespersonStaffId: 'Satış personelinden seçin.' });
  }
  let fx: { fxRate: string | null; fxRateDate: string | null; fxSource: string | null } = { fxRate: null, fxRateDate: null, fxSource: null };
  if (i.currency !== 'TRY') {
    if (!i.fxRate || !i.fxRateDate) throw new AppError('VALIDATION', 'Dövizli siparişte kur ve kur tarihi zorunlu.', { fxRate: 'Kur zorunlu.', fxRateDate: 'Kur tarihi zorunlu.' });
    if (!(Number(parseRate(i.fxRate, 'fxRate', 'Kur')) > 0)) throw new AppError('VALIDATION', 'Kur sıfırdan büyük olmalı.', { fxRate: 'Kur sıfırdan büyük olmalı.' });
    fx = { fxRate: parseRate(i.fxRate, 'fxRate', 'Kur'), fxRateDate: i.fxRateDate, fxSource: i.fxSource || 'TCMB döviz satış' };
  }
  // Klişe/poze yalnızca siparişin müşterisine ait, arşivlenmemiş kayıtlardan seçilebilir (okuma: üretim modülü tablosu).
  const plateIds = [...new Set(lines.map((l) => l.plateId).filter((x): x is string => Boolean(x)))];
  const ownPlates = plateIds.length ? await ctx.tx.select({ id: plates.id, partyId: plates.partyId, archived: plates.archived }).from(plates).where(inArray(plates.id, plateIds)) : [];
  lines.forEach((l, n) => {
    if (!l.plateId) return;
    const p = ownPlates.find((x) => x.id === l.plateId);
    if (!p || p.archived || p.partyId !== i.partyId) {
      throw new AppError('VALIDATION', 'Klişeyi bu müşterinin klişelerinden seçin.', { [`${single ? '' : `lines.${n}.`}plateId`]: 'Bu müşterinin klişelerinden seçin.' });
    }
  });
  const totalMinor = prepared.reduce((s, l) => s + l.totalMinor, 0n);
  return { lines: prepared, totalMinor, quantity: prepared.reduce((s, l) => s + l.quantity, 0), ...fx };
}

type Prepared = Awaited<ReturnType<typeof prepare>>;

async function insertLines(ctx: ActionCtx, orderId: string, p: Prepared) {
  await ctx.tx.insert(orderLines).values(
    p.lines.map((l, n) => ({
      companyId: ctx.companyId, orderId, lineNo: n + 1, product: l.product, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate,
      totalMinor: l.totalMinor, packaging: l.packaging, departmentNotes: l.departmentNotes, plateId: l.plateId,
    })),
  );
}

async function nextOrderNo(ctx: ActionCtx, orderDate: string): Promise<string> {
  const year = Number(orderDate.slice(0, 4));
  const [row] = await ctx.tx
    .insert(orderCounters)
    .values({ companyId: ctx.companyId, year, next: 2 })
    .onConflictDoUpdate({ target: [orderCounters.companyId, orderCounters.year], set: { next: sql`${orderCounters.next} + 1` } })
    .returning({ next: orderCounters.next });
  return `S-${year}-${String(row!.next - 1).padStart(6, '0')}`;
}

async function loadOrder(ctx: ActionCtx, id: string) {
  const [o] = await ctx.tx.select().from(orders).where(eq(orders.id, id));
  if (!o) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı.');
  return o;
}

function deliveryOf(i: { orderDate: string; deliveryDate?: string | null }): string | null {
  if (!i.deliveryDate) return null;
  if (i.deliveryDate < i.orderDate) throw new AppError('VALIDATION', 'Teslim tarihi sipariş tarihinden önce olamaz.', { deliveryDate: 'Sipariş tarihi veya sonrası.' });
  return i.deliveryDate;
}

// Teslim tarihi üretim sürerken de değişebilir (müşteriyle yeni tarih konuşulduğunda).
export const setDeliveryDate = defineAction({
  name: 'orders.setDeliveryDate',
  module: 'orders',
  roles: OFFICE,
  input: z.object({ id: z.string().uuid(), version: z.number().int(), deliveryDate: z.string().date().nullable() }),
  run: async (ctx, i) => {
    const o = await loadOrder(ctx, i.id);
    if (o.status === 'cancelled') throw new AppError('INVALID_STATE', 'İptal edilmiş siparişin teslim tarihi değiştirilemez.');
    const deliveryDate = deliveryOf({ orderDate: o.orderDate, deliveryDate: i.deliveryDate });
    const updated = await ctx.tx.update(orders).set({ deliveryDate, version: o.version + 1 }).where(and(eq(orders.id, o.id), eq(orders.version, i.version))).returning({ id: orders.id });
    if (!updated.length) throw conflict();
    await ctx.audit({ entity: 'order', entityId: o.id, before: { deliveryDate: o.deliveryDate }, after: { deliveryDate } });
    return { id: o.id };
  },
});

const conflict = () => new AppError('CONFLICT', 'Bu kayıt başka biri tarafından değiştirildi, sayfayı yenileyin.');

export const createOrder = defineAction({
  name: 'orders.create',
  module: 'orders',
  roles: OFFICE,
  input: orderBase.superRefine(requireLines),
  run: async (ctx, i) => {
    if (feature(ctx.cfg, 'orders.requireDeliveryDate') && !i.deliveryDate) throw new AppError('VALIDATION', 'Teslim tarihini girin.', { deliveryDate: 'Teslim tarihi zorunlu.' });
    const p = await prepare(ctx, i);
    const deposit = i.deposit?.trim() ? parseMoney(i.deposit, i.currency) : null;
    if (deposit && deposit.minor < 0n) throw new AppError('VALIDATION', 'Peşinat negatif olamaz.', { deposit: 'Peşinat negatif olamaz.' });
    const no = await nextOrderNo(ctx, i.orderDate);
    const [row] = await ctx.tx
      .insert(orders)
      .values({
        companyId: ctx.companyId, no, partyId: i.partyId, salespersonStaffId: i.salespersonStaffId, orderDate: i.orderDate, deliveryDate: deliveryOf(i),
        currency: i.currency, fxRate: p.fxRate, fxRateDate: p.fxRateDate, fxSource: p.fxSource, totalMinor: p.totalMinor, createdBy: ctx.user.userId,
      })
      .returning({ id: orders.id });
    await insertLines(ctx, row!.id, p);
    if (deposit && deposit.minor > 0n) {
      await ctx.tx.insert(orderPayments).values({ companyId: ctx.companyId, orderId: row!.id, kind: 'deposit', amountMinor: deposit.minor, currency: i.currency, paidAt: i.orderDate, note: 'Peşinat', createdBy: ctx.user.userId });
    }
    await ctx.audit({ entity: 'order', entityId: row!.id, after: { no, lines: p.lines.length, quantity: p.quantity, total: moneyToJSON(money(p.totalMinor, i.currency)) } });
    return { id: row!.id, no };
  },
});

export const updateOrder = defineAction({
  name: 'orders.update',
  module: 'orders',
  roles: OFFICE,
  input: orderBase.extend({ id: z.string().uuid(), version: z.number().int() }).superRefine(requireLines),
  run: async (ctx, i) => {
    const before = await loadOrder(ctx, i.id);
    if (before.status !== 'draft') throw new AppError('INVALID_STATE', 'Üretime alınmış sipariş değiştirilemez.');
    if (i.currency !== before.currency) {
      const [paid] = await ctx.tx.select({ id: orderPayments.id }).from(orderPayments).where(eq(orderPayments.orderId, i.id)).limit(1);
      if (paid) throw new AppError('INVALID_STATE', 'Tahsilatı olan siparişin para birimi değiştirilemez.');
    }
    const p = await prepare(ctx, i);
    const updated = await ctx.tx
      .update(orders)
      .set({
        partyId: i.partyId, salespersonStaffId: i.salespersonStaffId, orderDate: i.orderDate, deliveryDate: deliveryOf(i), currency: i.currency,
        fxRate: p.fxRate, fxRateDate: p.fxRateDate, fxSource: p.fxSource, totalMinor: p.totalMinor, version: before.version + 1,
      })
      .where(and(eq(orders.id, i.id), eq(orders.version, i.version), eq(orders.status, 'draft')))
      .returning({ id: orders.id });
    if (!updated.length) throw conflict();
    // Taslakta hiçbir satırın işi yoktur: satırlar yeniden yazılır.
    const beforeLines = await ctx.tx.select().from(orderLines).where(eq(orderLines.orderId, i.id)).orderBy(asc(orderLines.lineNo));
    if (beforeLines.some((l) => l.status !== 'open')) throw new AppError('INVALID_STATE', 'Üretime alınmış satırı olan sipariş değiştirilemez.');
    await ctx.tx.delete(orderLines).where(eq(orderLines.orderId, i.id));
    await insertLines(ctx, i.id, p);
    await ctx.audit({
      entity: 'order', entityId: i.id,
      before: { lines: beforeLines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })), total: before.totalMinor.toString() },
      after: { lines: p.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })), total: p.totalMinor.toString() },
    });
    return { id: i.id };
  },
});

export const cancelOrder = defineAction({
  name: 'orders.cancel',
  module: 'orders',
  roles: OFFICE,
  input: z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(500), version: z.number().int() }),
  run: async (ctx, i) => {
    const o = await loadOrder(ctx, i.id);
    if (o.status !== 'draft') throw new AppError('INVALID_STATE', 'Üretimdeki sipariş üretim panosundan iptal edilir.');
    const updated = await ctx.tx
      .update(orders)
      .set({ status: 'cancelled', cancelReason: i.reason, version: o.version + 1 })
      .where(and(eq(orders.id, i.id), eq(orders.version, i.version)))
      .returning({ id: orders.id });
    if (!updated.length) throw conflict();
    await ctx.tx.update(orderLines).set({ status: 'cancelled', cancelReason: i.reason }).where(eq(orderLines.orderId, i.id));
    await ctx.audit({ entity: 'order', entityId: i.id, before: { status: o.status }, after: { status: 'cancelled', reason: i.reason } });
    return { id: i.id };
  },
});

export const addPayment = defineAction({
  name: 'orders.addPayment',
  module: 'orders',
  roles: OFFICE,
  input: z.object({ orderId: z.string().uuid(), amount: z.string().min(1), paidAt: z.string().date().optional(), note: z.string().max(300).default('') }),
  run: async (ctx, i) => {
    const o = await loadOrder(ctx, i.orderId);
    if (o.status === 'cancelled') throw new AppError('INVALID_STATE', 'İptal edilmiş siparişe ödeme eklenemez.');
    const amount = parseMoney(i.amount, o.currency as Currency);
    if (amount.minor <= 0n) throw new AppError('VALIDATION', 'Tutar sıfırdan büyük olmalı.', { amount: 'Tutar sıfırdan büyük olmalı.' });
    const [row] = await ctx.tx
      .insert(orderPayments)
      .values({ companyId: ctx.companyId, orderId: o.id, kind: 'payment', amountMinor: amount.minor, currency: o.currency, paidAt: i.paidAt ?? istanbulToday(), note: i.note, createdBy: ctx.user.userId })
      .returning({ id: orderPayments.id });
    await ctx.audit({ entity: 'order_payment', entityId: row!.id, after: { orderId: o.id, amount: moneyToJSON(amount) } });
    return { id: row!.id };
  },
});

// Düzeltme: orijinal ödeme silinmez; fark kadar ters kayıt eklenir.
export const correctPayment = defineAction({
  name: 'orders.correctPayment',
  module: 'orders',
  roles: OFFICE,
  input: z.object({ paymentId: z.string().uuid(), amount: z.string().min(1), note: z.string().trim().min(3).max(300) }),
  run: async (ctx, i) => {
    // Asıl ödeme satırı kilitlenir: aynı ödemeye eşzamanlı iki düzeltme sırayla hesaplanır.
    const [orig] = await ctx.tx.select().from(orderPayments).where(eq(orderPayments.id, i.paymentId)).for('update');
    if (!orig || orig.kind === 'correction') throw new AppError('NOT_FOUND', 'Ödeme bulunamadı.');
    if (orig.source === 'finance') throw new AppError('INVALID_STATE', 'Bu tahsilat ön muhasebeden girildi; düzeltme için ön muhasebede hareketi iptal edip yeniden girin.');
    const o = await loadOrder(ctx, orig.orderId);
    if (o.status === 'cancelled') throw new AppError('INVALID_STATE', 'İptal edilmiş siparişin ödemesi düzeltilemez.');
    const corrections = await ctx.tx.select().from(orderPayments).where(eq(orderPayments.correctsPaymentId, orig.id));
    const current = corrections.reduce((s, c) => s + c.amountMinor, orig.amountMinor);
    const target = parseMoney(i.amount, o.currency as Currency).minor;
    if (target < 0n) throw new AppError('VALIDATION', 'Tutar negatif olamaz.', { amount: 'Tutar negatif olamaz.' });
    if (target === current) throw new AppError('VALIDATION', 'Yeni tutar mevcut tutarla aynı.', { amount: 'Yeni tutar mevcut tutarla aynı.' });
    const [row] = await ctx.tx
      .insert(orderPayments)
      .values({ companyId: ctx.companyId, orderId: o.id, kind: 'correction', amountMinor: target - current, currency: o.currency, paidAt: istanbulToday(), note: i.note, correctsPaymentId: orig.id, createdBy: ctx.user.userId })
      .returning({ id: orderPayments.id });
    await ctx.audit({ entity: 'order_payment', entityId: orig.id, before: { amount: current.toString() }, after: { amount: target.toString(), note: i.note } });
    return { id: row!.id };
  },
});

export const markInvoiced = defineAction({
  name: 'orders.markInvoiced',
  module: 'orders',
  roles: ['admin', 'tracking'],
  input: z.object({ id: z.string().uuid(), invoiceNo: z.string().trim().min(1).max(40), invoiceDate: z.string().date(), version: z.number().int() }),
  run: (ctx, i) => markOrderInvoiced(ctx, { orderId: i.id, version: i.version, invoiceNo: i.invoiceNo, invoiceDate: i.invoiceDate }),
});
