import { eq, isNotNull } from 'drizzle-orm';
import type { Db } from '@/core/db/client';
import { companies } from '@/core/db/schema';

/** "Plastik.Kemalayan.com:443" → "plastik.kemalayan.com". */
export function normalizeHost(raw: string | null | undefined): string {
  return (raw ?? '').split(',')[0]!.trim().toLowerCase().replace(/:\d+$/, '');
}

const TTL_MS = 60_000;
const byHost = new Map<string, { id: string | null; at: number }>();
let fallback: { slug: string; id: string } | undefined;

/**
 * İsteğin firması: adres bir firmaya kayıtlıysa o firma, değilse kurulumun firması (tek firmalı kurulum ve geliştirme).
 * Adres eşlemesi bir dakika önbellekte tutulur (merkez panelde yeni firma eklendiğinde en geç bir dakikada görünür).
 */
export async function companyIdForHost(db: Db, host: string, fallbackSlug: string, now = Date.now()): Promise<string> {
  const h = normalizeHost(host);
  if (h) {
    const hit = byHost.get(h);
    let id = hit && now - hit.at < TTL_MS ? hit.id : undefined;
    if (id === undefined) {
      const [row] = await db.select({ id: companies.id }).from(companies).where(eq(companies.host, h));
      id = row?.id ?? null;
      byHost.set(h, { id, at: now });
    }
    if (id) return id;
  }
  if (fallback?.slug !== fallbackSlug) {
    const [row] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, fallbackSlug));
    if (!row) throw new Error('Firma bulunamadı; önce "pnpm kurulum" çalıştırın.');
    fallback = { slug: fallbackSlug, id: row.id };
  }
  return fallback.id;
}

/** Firma adresleri (kimlik doğrulamada güvenilir köken). */
export async function companyOrigins(db: Db): Promise<string[]> {
  const rows = await db.select({ host: companies.host }).from(companies).where(isNotNull(companies.host));
  return rows.map((r) => `https://${r.host}`);
}

/** Testler için önbelleği boşaltır. */
export function clearTenantCache() {
  byHost.clear();
  fallback = undefined;
}
