import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction, type ActionCtx } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { parties, staff } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { CURRENCIES, moneyToJSON, parseMoney, type Currency } from '@/core/money';
import type { Role } from '@/core/modules/types';
import { getSector } from '@/sectors';
import { orderCounters, orderPayments, orders } from '../db/schema';
import { packagingPlan } from '../domain/packaging';
import { computeOrderTotal, parseRate, parseUnitPrice } from '../domain/totals';

const OFFICE: Role[] = ['admin', 'sales', 'tracking'];

const orderInput = z.object({
  partyId: z.string().uuid(),
  salespersonStaffId: z.string().uuid(),
  orderDate: z.string().date(),
  product: z.record(z.unknown()),
  quantity: z.coerce.number().int().positive().optional(),
  unitPrice: z.string().min(1),
  vatRate: z.string().min(1),
  currency: z.enum(CURRENCIES),
  fxRate: z.string().optional(),
  fxRateDate: z.string().date().optional(),
  fxSource: z.string().max(80).optional(),
  deposit: z.string().optional(),
  packaging: z.object({ type: z.enum(['sack', 'box', 'none']), capacity: z.coerce.number().int().min(0) }),
  departmentNotes: z.record(z.string().max(1000)).default({}),
});

type OrderInput = z.infer<typeof orderInput>;

const SECTOR_ID = 'bags';

// Sipariş alanlarını doğrular ve hesaplar; ürün hataları "product.<alan>" adıyla döner.
async function prepare(ctx: ActionCtx, i: OrderInput) {
  const sector = getSector(ctx.cfg.sector ?? SECTOR_ID);
  let product: Record<string, unknown>;
  try {
    product = sector.validateProduct(i.product);
  } catch (e) {
    if (e instanceof AppError && e.fieldErrors) {
      throw new AppError('VALIDATION', e.message, Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [`product.${k}`, v])));
    }
    throw e;
  }
  const [party] = await ctx.tx.select({ id: parties.id, kind: parties.kind }).from(parties).where(and(eq(parties.id, i.partyId), eq(parties.archived, false)));
  if (!party || party.kind === 'supplier') throw new AppError('VALIDATION', 'Müşteri seçin.', { partyId: 'Listeden bir müşteri seçin.' });
  const [seller] = await ctx.tx.select().from(staff).where(eq(staff.id, i.salespersonStaffId));
  if (!seller?.active || !seller.departments.includes('sales')) {
    throw new AppError('VALIDATION', 'Satış yapan kişiyi satış personelinden seçin.', { salespersonStaffId: 'Satış personelinden seçin.' });
  }
  const unitPrice = parseUnitPrice(i.unitPrice);
  const vatRate = parseRate(i.vatRate, 'vatRate', 'KDV oranı');
  if (Number(vatRate) > 100) throw new AppError('VALIDATION', 'KDV oranı 0–100 arasında olmalı.', { vatRate: 'KDV oranı 0–100 arasında olmalı.' });
  let fx: { fxRate: string | null; fxRateDate: string | null; fxSource: string | null } = { fxRate: null, fxRateDate: null, fxSource: null };
  if (i.currency !== 'TRY') {
    if (!i.fxRate || !i.fxRateDate) throw new AppError('VALIDATION', 'Dövizli siparişte kur ve kur tarihi zorunlu.', { fxRate: 'Kur zorunlu.', fxRateDate: 'Kur tarihi zorunlu.' });
    fx = { fxRate: parseRate(i.fxRate, 'fxRate', 'Kur'), fxRateDate: i.fxRateDate, fxSource: i.fxSource || 'TCMB döviz satış' };
  }
  const quantity = i.quantity ?? sector.targetQuantity(product);
  if (!quantity) throw new AppError('VALIDATION', 'Hedef adet hesaplanamadı; ölçüleri kontrol edin.', { quantity: 'Adet hesaplanamadı.' });
  let packaging;
  try {
    packaging = packagingPlan(i.packaging, quantity);
  } catch (e) {
    throw new AppError('VALIDATION', (e as Error).message, { 'packaging.capacity': (e as Error).message });
  }
  const departmentNotes = Object.fromEntries(Object.entries(i.departmentNotes).filter(([k, v]) => sector.stages.some((s) => s.id === k) && v.trim()));
  const total = computeOrderTotal(unitPrice, quantity, vatRate, i.currency);
  return { product, unitPrice, vatRate, quantity, packaging, departmentNotes, total, ...fx };
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

const conflict = () => new AppError('CONFLICT', 'Bu kayıt başka biri tarafından değiştirildi, sayfayı yenileyin.');

export const createOrder = defineAction({
  name: 'orders.create',
  module: 'orders',
  roles: OFFICE,
  input: orderInput,
  run: async (ctx, i) => {
    const p = await prepare(ctx, i);
    const deposit = i.deposit?.trim() ? parseMoney(i.deposit, i.currency) : null;
    if (deposit && deposit.minor < 0n) throw new AppError('VALIDATION', 'Peşinat negatif olamaz.', { deposit: 'Peşinat negatif olamaz.' });
    const no = await nextOrderNo(ctx, i.orderDate);
    const [row] = await ctx.tx
      .insert(orders)
      .values({
        companyId: ctx.companyId,
        no,
        partyId: i.partyId,
        salespersonStaffId: i.salespersonStaffId,
        orderDate: i.orderDate,
        product: p.product,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        vatRate: p.vatRate,
        currency: i.currency,
        fxRate: p.fxRate,
        fxRateDate: p.fxRateDate,
        fxSource: p.fxSource,
        totalMinor: p.total.minor,
        packaging: p.packaging,
        departmentNotes: p.departmentNotes,
        createdBy: ctx.user.userId,
      })
      .returning({ id: orders.id });
    if (deposit && deposit.minor > 0n) {
      await ctx.tx.insert(orderPayments).values({ companyId: ctx.companyId, orderId: row!.id, kind: 'deposit', amountMinor: deposit.minor, currency: i.currency, paidAt: i.orderDate, note: 'Peşinat', createdBy: ctx.user.userId });
    }
    await ctx.audit({ entity: 'order', entityId: row!.id, after: { no, quantity: p.quantity, total: moneyToJSON(p.total) } });
    return { id: row!.id, no };
  },
});

export const updateOrder = defineAction({
  name: 'orders.update',
  module: 'orders',
  roles: OFFICE,
  input: orderInput.extend({ id: z.string().uuid(), version: z.number().int() }),
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
        partyId: i.partyId,
        salespersonStaffId: i.salespersonStaffId,
        orderDate: i.orderDate,
        product: p.product,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        vatRate: p.vatRate,
        currency: i.currency,
        fxRate: p.fxRate,
        fxRateDate: p.fxRateDate,
        fxSource: p.fxSource,
        totalMinor: p.total.minor,
        packaging: p.packaging,
        departmentNotes: p.departmentNotes,
        version: before.version + 1,
      })
      .where(and(eq(orders.id, i.id), eq(orders.version, i.version)))
      .returning({ id: orders.id });
    if (!updated.length) throw conflict();
    await ctx.audit({ entity: 'order', entityId: i.id, before: { quantity: before.quantity, unitPrice: before.unitPrice, total: before.totalMinor.toString() }, after: { quantity: p.quantity, unitPrice: p.unitPrice, total: p.total.minor.toString() } });
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
    await ctx.audit({ entity: 'order', entityId: i.id, before: { status: o.status }, after: { status: 'cancelled', reason: i.reason } });
    return { id: i.id };
  },
});

export const addPayment = defineAction({
  name: 'orders.addPayment',
  module: 'orders',
  roles: OFFICE,
  input: z.object({ orderId: z.string().uuid(), amount: z.string().min(1), paidAt: z.string().date().default(istanbulToday()), note: z.string().max(300).default('') }),
  run: async (ctx, i) => {
    const o = await loadOrder(ctx, i.orderId);
    if (o.status === 'cancelled') throw new AppError('INVALID_STATE', 'İptal edilmiş siparişe ödeme eklenemez.');
    const amount = parseMoney(i.amount, o.currency as Currency);
    if (amount.minor <= 0n) throw new AppError('VALIDATION', 'Tutar sıfırdan büyük olmalı.', { amount: 'Tutar sıfırdan büyük olmalı.' });
    const [row] = await ctx.tx
      .insert(orderPayments)
      .values({ companyId: ctx.companyId, orderId: o.id, kind: 'payment', amountMinor: amount.minor, currency: o.currency, paidAt: i.paidAt, note: i.note, createdBy: ctx.user.userId })
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
    const [orig] = await ctx.tx.select().from(orderPayments).where(eq(orderPayments.id, i.paymentId));
    if (!orig || orig.kind === 'correction') throw new AppError('NOT_FOUND', 'Ödeme bulunamadı.');
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
  run: async (ctx, i) => {
    const o = await loadOrder(ctx, i.id);
    if (o.status !== 'ready_to_invoice') throw new AppError('INVALID_STATE', 'Yalnızca faturaya hazır sipariş işaretlenebilir.');
    const mark = { no: i.invoiceNo, date: i.invoiceDate, by: ctx.user.userId, at: new Date().toISOString() };
    const updated = await ctx.tx
      .update(orders)
      .set({ status: 'invoiced', invoiceMark: mark, version: o.version + 1 })
      .where(and(eq(orders.id, i.id), eq(orders.version, i.version)))
      .returning({ id: orders.id });
    if (!updated.length) throw conflict();
    await ctx.audit({ entity: 'order', entityId: i.id, before: { status: o.status }, after: { status: 'invoiced', invoice: mark } });
    return { id: i.id };
  },
});
