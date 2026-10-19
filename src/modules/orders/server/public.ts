// Sipariş modülünün diğer modüllere (üretim) açık yüzü. Başka modül sipariş tablolarına doğrudan yazmaz.
// Üretim satır bazında çalışır: her satırın bir işi vardır; siparişin durumu, tutarı ve adetleri satırlardan türetilir.
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '@/core/db/client';
import { parties } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { orderLines, orders, type LineStatus } from '../db/schema';
import { deriveOrderStatus, orderTotalMinor } from '../domain/lines';

const lineView = {
  lineId: orderLines.id,
  lineNo: orderLines.lineNo,
  lineStatus: orderLines.status,
  product: orderLines.product,
  quantity: orderLines.quantity,
  packaging: orderLines.packaging,
  departmentNotes: orderLines.departmentNotes,
  orderId: orders.id,
  no: orders.no,
  status: orders.status,
  orderDate: orders.orderDate,
  partyName: parties.name,
};

export async function getLineForProduction(tx: Tx, lineId: string) {
  const [row] = await tx.select(lineView).from(orderLines).innerJoin(orders, eq(orders.id, orderLines.orderId)).innerJoin(parties, eq(parties.id, orders.partyId)).where(eq(orderLines.id, lineId));
  if (!row) throw new AppError('NOT_FOUND', 'Sipariş satırı bulunamadı.');
  return row;
}

// Üretime alınmamış (açık) satırlar.
export async function openLinesForProduction(tx: Tx, orderId: string) {
  // Sipariş önce kilitlenir: eşzamanlı düzenleme ile kilit sırası hep sipariş → satır olsun.
  const [o] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).for('update');
  if (!o) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı.');
  if (o.status !== 'draft' && o.status !== 'in_production') throw new AppError('INVALID_STATE', 'Sipariş bu işlem için uygun durumda değil.');
  return tx.select(lineView).from(orderLines).innerJoin(orders, eq(orders.id, orderLines.orderId)).innerJoin(parties, eq(parties.id, orders.partyId)).where(and(eq(orderLines.orderId, orderId), eq(orderLines.status, 'open'))).orderBy(asc(orderLines.lineNo));
}

// Sipariş satırı kilitlenir; durum, tutar ve adetler satırlardan yeniden hesaplanır.
async function recomputeOrder(tx: Tx, orderId: string, cancelReason?: string) {
  const [o] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).for('update');
  if (!o) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı.');
  const lines = await tx.select({ status: orderLines.status, totalMinor: orderLines.totalMinor, producedQty: orderLines.producedQty, shippedQty: orderLines.shippedQty }).from(orderLines).where(eq(orderLines.orderId, orderId));
  const status = deriveOrderStatus(o.status, lines.map((l) => l.status));
  await tx
    .update(orders)
    .set({
      status,
      // Son satır iptal edilip sipariş iptale düşerse neden siparişe de yazılır.
      ...(status === 'cancelled' && o.status !== 'cancelled' && cancelReason ? { cancelReason } : {}),
      totalMinor: orderTotalMinor(lines),
      producedQty: lines.reduce((s, l) => s + l.producedQty, 0),
      shippedQty: lines.reduce((s, l) => s + l.shippedQty, 0),
      version: sql`${orders.version} + 1`,
    })
    .where(eq(orders.id, orderId));
}

async function lineTransition(tx: Tx, lineId: string, from: LineStatus[], to: LineStatus, extra: Partial<typeof orderLines.$inferInsert> = {}) {
  // Okuma ile yazma arasında durum değişmiş olabilir: güncelleme yalnızca beklenen durumdaysa uygulanır.
  const updated = await tx
    .update(orderLines)
    .set({ status: to, ...extra })
    .where(and(eq(orderLines.id, lineId), inArray(orderLines.status, from)))
    .returning({ orderId: orderLines.orderId });
  if (!updated.length) throw new AppError('INVALID_STATE', 'Sipariş satırı bu işlem için uygun durumda değil.');
  await recomputeOrder(tx, updated[0]!.orderId, extra.cancelReason ?? undefined);
}

export const markLineInProduction = (tx: Tx, lineId: string) => lineTransition(tx, lineId, ['open'], 'in_production');

export const markLineDone = (tx: Tx, lineId: string) => lineTransition(tx, lineId, ['in_production'], 'done');

/** Satırın siparişi faturalanmışsa üretim tarafında adet/onay değişikliği yapılamaz. */
export async function assertLineNotInvoiced(tx: Tx, lineId: string): Promise<void> {
  const [row] = await tx.select({ status: orders.status }).from(orderLines).innerJoin(orders, eq(orders.id, orderLines.orderId)).where(eq(orderLines.id, lineId));
  if (row?.status === 'invoiced') throw new AppError('INVALID_STATE', 'Siparişin faturası kesilmiş; önce fatura işaretini geri alın.');
}

/** Onayı geri alınan iş: satır yeniden üretimde, sipariş "faturaya hazır"dan çıkar. */
export const reopenLine = (tx: Tx, lineId: string) => lineTransition(tx, lineId, ['done'], 'in_production');

export const cancelLine = (tx: Tx, lineId: string, reason: string) => lineTransition(tx, lineId, ['open', 'in_production'], 'cancelled', { cancelReason: reason });

// Üretilen ve sevk edilen adetler (mutlak değer olarak) satıra, toplamları siparişe yansıtılır.
export async function onLineProgress(tx: Tx, p: { lineId: string; producedQty?: number; shippedQty?: number }) {
  const set: Partial<typeof orderLines.$inferInsert> = {};
  if (p.producedQty !== undefined) set.producedQty = p.producedQty;
  if (p.shippedQty !== undefined) set.shippedQty = p.shippedQty;
  if (!Object.keys(set).length) return;
  const [row] = await tx.update(orderLines).set(set).where(eq(orderLines.id, p.lineId)).returning({ orderId: orderLines.orderId });
  if (!row) throw new AppError('NOT_FOUND', 'Sipariş satırı bulunamadı.');
  await recomputeOrder(tx, row.orderId);
}
