'use server';
import { searchParties } from '@/core/parties/service';
import * as a from '@/modules/finance/server/actions';
import * as rec from '@/modules/finance/server/reconciliation';

export async function createAccountAction(input: unknown) { return a.createAccount(input); }
export async function archiveAccountAction(input: unknown) { return a.archiveAccount(input); }
export async function recordInvoiceAction(input: unknown) { return a.recordInvoice(input); }
export async function cancelInvoiceAction(input: unknown) { return a.cancelInvoice(input); }
export async function recordPaymentAction(input: unknown) { return a.recordPayment(input); }
export async function recordExpenseAction(input: unknown) { return a.recordExpense(input); }
export async function transferAction(input: unknown) { return a.transfer(input); }
export async function reverseMovementAction(input: unknown) { return a.reverseMovement(input); }
export async function setOpeningAction(input: unknown) { return a.setOpening(input); }
export async function receiveCheckAction(input: unknown) { return a.receiveCheck(input); }
export async function issueCheckAction(input: unknown) { return a.issueCheck(input); }
export async function settleCheckAction(input: unknown) { return a.settleCheck(input); }
export async function endorseCheckAction(input: unknown) { return a.endorseCheck(input); }
export async function returnCheckAction(input: unknown) { return a.returnCheck(input); }

// Cari seçici: yalnızca ad ve tür döner.
export async function findPartiesAction(input: { q: string; kind?: 'customer' | 'supplier' }) {
  const r = await searchParties({ q: input.q, kind: input.kind, limit: 20 });
  return r.ok ? r.data.map((p) => ({ id: p.id, name: p.name, kind: p.kind })) : [];
}

export async function createReconciliationAction(input: unknown) { return rec.createReconciliation(input); }
export async function issueReconciliationLinkAction(input: unknown) { return rec.issueReconciliationLink(input); }
export async function cancelReconciliationAction(input: unknown) { return rec.cancelReconciliation(input); }
export async function recordReconciliationAnswerAction(input: unknown) { return rec.recordReconciliationAnswer(input); }
export async function partyOpenOrdersAction(input: { partyId: string }) {
  const r = await (await import('@/modules/finance/server/queries')).partyOpenOrders(input);
  return r.ok ? r.data : [];
}
export async function recordOrderInvoiceAction(input: unknown) { return a.recordOrderInvoice(input); }
export async function setPeriodLockAction(input: unknown) { return a.setPeriodLock(input); }

/** Ödeme penceresi için carinin açık faturaları (açılış kalemleri hariç). */
export async function partyOpenInvoicesAction(input: { partyId: string; side: 'receivable' | 'payable' }) {
  const r = await (await import('@/modules/finance/server/queries')).partyLedger({ partyId: input.partyId });
  if (!r.ok) return [];
  return r.data.currencies.flatMap((c) =>
    (input.side === 'receivable' ? c.receivable : c.payable)
      .filter((x) => /^[0-9a-f-]{36}$/.test(x.id))
      .map((x) => ({ id: x.id, text: x.text, open: x.open, due: x.due, currency: c.currency })),
  );
}

// TCMB kuru: veritabanı işlemi dışında (dış istek); yalnız ön muhasebe rolleri.
export async function financeTcmbRateAction(input: { currency: string; date: string }) {
  const [{ getCurrentUser }, { getInstallConfig }, { isModuleEnabled }, { mustEnrollTwoFactor }, { cachedTcmbRate }] = await Promise.all([
    import('@/core/auth/session'), import('@/core/install-config'), import('@/core/modules/registry'), import('@/core/auth/policy'), import('@/core/fx/tcmb'),
  ]);
  const user = await getCurrentUser();
  const cfg = getInstallConfig();
  if (!user || !user.roles.some((r) => r === 'admin' || r === 'accounting') || mustEnrollTwoFactor(user, cfg) || !isModuleEnabled('finance', cfg)) return { ok: false as const, message: 'Bu işlem için yetkiniz yok.' };
  if ((input.currency !== 'USD' && input.currency !== 'EUR') || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false as const, message: 'Döviz ve tarih seçin.' };
  try {
    return { ok: true as const, data: await cachedTcmbRate(input.currency, input.date) };
  } catch (e) {
    return { ok: false as const, message: (e as Error).message };
  }
}
