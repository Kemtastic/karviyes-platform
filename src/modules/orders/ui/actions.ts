'use server';
import { z } from 'zod';
import { toFailure, type ActionResult } from '@/core/action';
import { mustEnrollTwoFactor } from '@/core/auth/policy';
import { getCurrentUser } from '@/core/auth/session';
import { getInstallConfig } from '@/core/install-config';
import { isModuleEnabled } from '@/core/modules/registry';
import { cachedTcmbRate } from '@/core/fx/tcmb';
import { listPlates } from '@/modules/production/server/plates';
import { searchParties } from '@/core/parties/service';
import { lastOrderLines } from '@/modules/orders/server/queries';
import { addPayment, cancelOrder, correctPayment, createOrder, markInvoiced, setDeliveryDate, updateOrder } from '@/modules/orders/server/actions';

export async function setDeliveryDateAction(input: unknown) {
  return setDeliveryDate(input);
}

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

// Kur sorgusu veritabanı işlemi dışında yapılır (dış istek bağlantıyı tutmasın); yalnızca ofis rolleri.
export async function tcmbRateAction(input: { currency: string; date: string }): Promise<ActionResult<{ rate: string; rateDate: string; source: string }>> {
  const user = await getCurrentUser();
  if (!user || !user.roles.some((r) => r === 'admin' || r === 'sales' || r === 'tracking')) return { ok: false, code: 'FORBIDDEN', message: 'Bu işlem için yetkiniz yok.' };
  // defineAction dışında olduğu için 2FA ve modül denetimi burada da yapılır.
  const cfg = getInstallConfig();
  if (mustEnrollTwoFactor(user, cfg)) return { ok: false, code: 'FORBIDDEN', message: 'Önce iki adımlı doğrulamayı kurun.' };
  if (!isModuleEnabled('orders', cfg)) return { ok: false, code: 'MODULE_DISABLED', message: 'Bu modül bu kurulumda açık değil.' };
  const parsed = z.object({ currency: z.enum(['USD', 'EUR']), date: z.string().date() }).safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: 'Döviz ve tarih seçin.' };
  try {
    return { ok: true, data: await cachedTcmbRate(parsed.data.currency, parsed.data.date) };
  } catch (e) {
    return toFailure(e, 'orders.tcmbRate');
  }
}

// Satırda seçilecek klişe/poze listesi; üretim modülü kapalıysa boş.
export async function customerPlatesAction(input: { partyId: string }) {
  const r = await listPlates({ partyId: input.partyId });
  return r.ok ? r.data.map((p) => ({ id: p.id, name: p.name, colours: p.colours })) : [];
}
