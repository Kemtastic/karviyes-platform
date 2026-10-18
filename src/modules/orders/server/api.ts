import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { ActionCtx } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { AppError } from '@/core/errors';
import { applyRate, money, moneyToJSON, mulPrice, type Currency } from '@/core/money';
import { orderLines, orderPayments, orders } from '../db/schema';
import { receivableTotal } from '../domain/totals';

// Sipariş modülünün diğer modüllere açık yüzü: çağıran eylem yetkiyi denetlemiş olmalıdır; aynı işlemin (tx) içinde çalışır.

/** Carinin bakiyesi kalan (iptal edilmemiş) siparişleri. */
export async function openOrdersOf(ctx: ActionCtx, partyId: string) {
  const rows = await ctx.tx.select().from(orders).where(and(eq(orders.partyId, partyId), ne(orders.status, 'cancelled'))).orderBy(desc(orders.orderDate)).limit(200);
  const pays = rows.length ? await ctx.tx.select().from(orderPayments).where(inArray(orderPayments.orderId, rows.map((o) => o.id))) : [];
  return rows
    .map((o) => {
      const currency = o.currency as Currency;
      const paid = pays.filter((p) => p.orderId === o.id).reduce((s, p) => s + p.amountMinor, 0n);
      const balance = receivableTotal(o.status, money(o.totalMinor, currency)).minor - paid;
      return { id: o.id, no: o.no, orderDate: o.orderDate, currency, balance };
    })
    .filter((o) => o.balance > 0n)
    .map((o) => ({ ...o, balance: moneyToJSON(money(o.balance, o.currency)) }));
}

/** Siparişe tahsilat işler (ön muhasebe tahsilatıyla birlikte). Sipariş carisi ve para birimi tutmalı. */
export async function recordOrderPayment(ctx: ActionCtx, i: { orderId: string; partyId: string; amountMinor: bigint; currency: Currency; paidAt?: string; note: string }) {
  const [o] = await ctx.tx.select().from(orders).where(eq(orders.id, i.orderId));
  if (!o || o.partyId !== i.partyId) throw new AppError('VALIDATION', 'Sipariş bu cariye ait değil.', { orderId: 'Bu carinin siparişini seçin.' });
  if (o.status === 'cancelled') throw new AppError('INVALID_STATE', 'İptal edilmiş siparişe ödeme eklenemez.');
  if (o.currency !== i.currency) throw new AppError('VALIDATION', `Sipariş ${o.currency}; aynı para biriminde hesap seçin.`, { orderId: `Sipariş ${o.currency}.` });
  const [row] = await ctx.tx
    .insert(orderPayments)
    .values({ companyId: ctx.companyId, orderId: o.id, kind: 'payment', amountMinor: i.amountMinor, currency: o.currency, paidAt: i.paidAt ?? istanbulToday(), note: i.note, createdBy: ctx.user.userId })
    .returning({ id: orderPayments.id });
  await ctx.audit({ entity: 'order_payment', entityId: row!.id, after: { orderId: o.id, amount: moneyToJSON(money(i.amountMinor, o.currency as Currency)), via: 'finance' } });
  return { id: row!.id, no: o.no };
}

/** Ön muhasebede iptal edilen tahsilatın sipariş tarafı: ödeme silinmez, kalan tutarı sıfırlayan düzeltme eklenir. */
export async function reverseOrderPayment(ctx: ActionCtx, paymentId: string, reason: string) {
  const [orig] = await ctx.tx.select().from(orderPayments).where(eq(orderPayments.id, paymentId)).for('update');
  if (!orig) return;
  const corrections = await ctx.tx.select().from(orderPayments).where(eq(orderPayments.correctsPaymentId, orig.id));
  const current = corrections.reduce((s, c) => s + c.amountMinor, orig.amountMinor);
  if (current === 0n) return;
  await ctx.tx.insert(orderPayments).values({
    companyId: ctx.companyId, orderId: orig.orderId, kind: 'correction', amountMinor: -current, currency: orig.currency, paidAt: istanbulToday(), note: `Ön muhasebede iptal: ${reason}`, correctsPaymentId: orig.id, createdBy: ctx.user.userId,
  });
  await ctx.audit({ entity: 'order_payment', entityId: orig.id, before: { amount: current.toString() }, after: { amount: '0', via: 'finance' } });
}

/** Faturalanacak tutar: iptal edilmemiş satırların KDV hariç toplamı ve KDV'si (sipariş toplamıyla aynı yuvarlama). */
export async function invoiceBreakdown(ctx: ActionCtx, orderId: string) {
  const [o] = await ctx.tx.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı.');
  const lines = await ctx.tx.select().from(orderLines).where(and(eq(orderLines.orderId, orderId), ne(orderLines.status, 'cancelled')));
  let base = 0n;
  let vat = 0n;
  for (const l of lines) {
    const net = mulPrice(l.unitPrice, l.quantity);
    base += net;
    vat += applyRate(net, l.vatRate);
  }
  return { order: o, currency: o.currency as Currency, base, vat };
}

/** Siparişi "fatura kesildi" yapar (yalnızca faturaya hazır sipariş). */
export async function markOrderInvoiced(ctx: ActionCtx, i: { orderId: string; version: number; invoiceNo: string; invoiceDate: string }) {
  const [o] = await ctx.tx.select().from(orders).where(eq(orders.id, i.orderId));
  if (!o) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı.');
  if (o.status !== 'ready_to_invoice') throw new AppError('INVALID_STATE', 'Yalnızca faturaya hazır sipariş işaretlenebilir.');
  const mark = { no: i.invoiceNo, date: i.invoiceDate, by: ctx.user.userId, at: new Date().toISOString() };
  const updated = await ctx.tx
    .update(orders)
    .set({ status: 'invoiced', invoiceMark: mark, version: o.version + 1 })
    .where(and(eq(orders.id, i.orderId), eq(orders.version, i.version)))
    .returning({ id: orders.id });
  if (!updated.length) throw new AppError('CONFLICT', 'Bu kayıt başka biri tarafından değiştirildi, sayfayı yenileyin.');
  await ctx.audit({ entity: 'order', entityId: i.orderId, before: { status: o.status }, after: { status: 'invoiced', invoice: mark } });
  return { id: i.orderId };
}
