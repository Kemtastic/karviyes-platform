'use server';
import { headers } from 'next/headers';
import { publicRateLimited } from '@/core/rate-limit';
import { answerReconciliation } from '@/modules/finance/server/reconciliation';

// Oturumsuz uç: yetki, bağlantıdaki gizli anahtarla sağlanır; cevap yalnızca bir kez yazılır.
export async function answerReconciliationAction(token: string, input: unknown) {
  if (typeof token !== 'string' || token.length > 200) return { ok: false as const, message: 'Bağlantı geçersiz.' };
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || h.get('x-real-ip') || 'bilinmiyor';
  if (await publicRateLimited(`mutabakat:${ip}`)) return { ok: false as const, message: 'Çok fazla deneme. Bir dakika sonra tekrar deneyin.' };
  return answerReconciliation(token, input, undefined, { ip, userAgent: h.get('user-agent') ?? undefined });
}
