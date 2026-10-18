import type { LineStatus, OrderStatus } from '../db/schema';

export { LINE_STATUSES, type LineStatus } from '../db/schema';

// Siparişin durumu satırlarından türetilir; faturalanmış sipariş kesinleşmiştir.
export function deriveOrderStatus(current: OrderStatus, lines: LineStatus[]): OrderStatus {
  if (current === 'invoiced' || !lines.length) return current;
  if (lines.every((s) => s === 'cancelled')) return 'cancelled';
  if (lines.every((s) => s === 'done' || s === 'cancelled')) return 'ready_to_invoice';
  if (lines.some((s) => s === 'in_production' || s === 'done')) return 'in_production';
  return 'draft';
}

// Siparişin tutarı: iptal edilen satırların bedeli düşülür. Tamamı iptalse son tutar korunur
// (bakiye hesabı iptal edilen siparişi zaten sıfır sayar; listede ne iptal edildiği görünür).
export function orderTotalMinor(lines: { status: LineStatus; totalMinor: bigint }[]): bigint {
  const live = lines.filter((l) => l.status !== 'cancelled');
  return (live.length ? live : lines).reduce((sum, l) => sum + l.totalMinor, 0n);
}
