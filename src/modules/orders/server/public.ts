// Sipariş modülünün diğer modüllere (üretim) açık yüzü. Başka modül sipariş tablolarına doğrudan yazmaz.
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '@/core/db/client';
import { parties } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { orders } from '../db/schema';

export async function getOrderForProduction(tx: Tx, id: string) {
  const [row] = await tx
    .select({ id: orders.id, no: orders.no, status: orders.status, product: orders.product, quantity: orders.quantity, packaging: orders.packaging, departmentNotes: orders.departmentNotes, partyName: parties.name, orderDate: orders.orderDate })
    .from(orders)
    .innerJoin(parties, eq(parties.id, orders.partyId))
    .where(eq(orders.id, id));
  if (!row) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı.');
  return row;
}

async function transition(tx: Tx, id: string, from: (typeof orders.$inferSelect)['status'][], to: (typeof orders.$inferSelect)['status'], extra: Partial<typeof orders.$inferInsert> = {}) {
  const [o] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, id));
  if (!o) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı.');
  if (!from.includes(o.status)) throw new AppError('INVALID_STATE', 'Sipariş bu işlem için uygun durumda değil.');
  // Okuma ile yazma arasında durum değişmiş olabilir: güncelleme yalnızca beklenen durumdaysa uygulanır.
  const updated = await tx
    .update(orders)
    .set({ status: to, version: sql`${orders.version} + 1`, ...extra })
    .where(and(eq(orders.id, id), inArray(orders.status, from)))
    .returning({ id: orders.id });
  if (!updated.length) throw new AppError('INVALID_STATE', 'Sipariş bu işlem için uygun durumda değil.');
}

export const markInProduction = (tx: Tx, id: string) => transition(tx, id, ['draft'], 'in_production');

export const markReadyToInvoice = (tx: Tx, id: string) => transition(tx, id, ['in_production'], 'ready_to_invoice');

export const cancelFromProduction = (tx: Tx, id: string, reason: string) => transition(tx, id, ['draft', 'in_production'], 'cancelled', { cancelReason: reason });

// Üretilen ve sevk edilen adetler (mutlak değer olarak) siparişe yansıtılır.
export async function onProductionProgress(tx: Tx, p: { orderId: string; producedQty?: number; shippedQty?: number }) {
  const set: Partial<typeof orders.$inferInsert> = {};
  if (p.producedQty !== undefined) set.producedQty = p.producedQty;
  if (p.shippedQty !== undefined) set.shippedQty = p.shippedQty;
  if (!Object.keys(set).length) return;
  await tx.update(orders).set({ ...set, version: sql`${orders.version} + 1` }).where(and(eq(orders.id, p.orderId)));
}
