'use server';
import { answerReconciliation } from '@/modules/finance/server/reconciliation';

// Oturumsuz uç: yetki, bağlantıdaki gizli anahtarla sağlanır; cevap yalnızca bir kez yazılır.
export async function answerReconciliationAction(token: string, input: unknown) {
  if (typeof token !== 'string' || token.length > 200) return { ok: false as const, message: 'Bağlantı geçersiz.' };
  return answerReconciliation(token, input);
}
