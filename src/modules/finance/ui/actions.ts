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
