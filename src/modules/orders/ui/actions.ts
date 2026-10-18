'use server';
import { searchParties } from '@/core/parties/service';
import { lastOrderLines } from '@/modules/orders/server/queries';
import { addPayment, cancelOrder, correctPayment, createOrder, markInvoiced, updateOrder } from '@/modules/orders/server/actions';

export async function lastOrderLinesAction(input: unknown) {
  return lastOrderLines(input);
}
export async function createOrderAction(input: unknown) {
  return createOrder(input);
}
export async function updateOrderAction(input: unknown) {
  return updateOrder(input);
}
export async function cancelOrderAction(input: unknown) {
  return cancelOrder(input);
}
export async function addPaymentAction(input: unknown) {
  return addPayment(input);
}
export async function correctPaymentAction(input: unknown) {
  return correctPayment(input);
}
export async function markInvoicedAction(input: unknown) {
  return markInvoiced(input);
}
export async function searchCustomersAction(input: { q: string }) {
  const r = await searchParties({ q: input.q, kind: 'customer', limit: 20 });
  return r.ok ? { ok: true as const, data: r.data.map((p) => ({ id: p.id, name: p.name, city: p.city })) } : r;
}
