import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, timingSafeEqual, verify } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { loadCompanyConfig } from '@/core/company/config';
import type { Db } from '@/core/db/client';
import { dataDbFor } from '@/core/db/router';
import { companies, companySettings } from '@/core/db/schema';
import { withCompany, writeAudit } from '@/core/db/scope';
import { AppError } from '@/core/errors';
import { definePlatformAction } from './action';

// Müşterinin kendi sunucusu (VPS): firmanın modülleri, sektörü, 2FA rolleri, özellik anahtarları ve durumu merkezde yönetilir.
// Merkez paketi Ed25519 ile imzalar; kurulum yalnız merkezin açık anahtarıyla doğrulanan, kendi firmasına ait ve süresi dolmamış
// paketi uygular. Merkeze ulaşılamazsa veritabanındaki son uygulanan ayarla çalışmaya devam eder.

const VALID_DAYS = 7;

const payloadSchema = z.object({
  slug: z.string(),
  modules: z.array(z.string()).min(1),
  sector: z.string(),
  twoFactorRoles: z.array(z.string()),
  features: z.record(z.string(), z.boolean()),
  status: z.enum(['active', 'suspended']),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type CentralBundle = { v: 1; payload: z.infer<typeof payloadSchema>; signature: string };

// İmzalanan metin anahtar sırasından bağımsız olmalı: nesne anahtarları sıralanarak yazılır.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function signBundle(payload: CentralBundle['payload'], privateKeyB64: string): CentralBundle {
  const key = createPrivateKey({ key: Buffer.from(privateKeyB64, 'base64'), format: 'der', type: 'pkcs8' });
  return { v: 1, payload, signature: sign(null, Buffer.from(canonical(payload)), key).toString('base64') };
}

export function verifyBundle(bundle: unknown, publicKeyB64: string, slug: string, now = new Date()): CentralBundle['payload'] {
  const b = bundle as Partial<CentralBundle> | null;
  if (!b || b.v !== 1 || typeof b.signature !== 'string') throw new Error('Ayar paketi biçimi geçersiz.');
  const key = createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' });
  if (!verify(null, Buffer.from(canonical(b.payload)), key, Buffer.from(b.signature, 'base64'))) throw new Error('Ayar paketinin imzası doğrulanamadı.');
  const p = payloadSchema.parse(b.payload);
  if (p.slug !== slug) throw new Error('Ayar paketi bu firmaya ait değil.');
  if (Date.parse(p.expiresAt) <= now.getTime()) throw new Error('Ayar paketinin süresi dolmuş.');
  return p;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Firmanın kurulum anahtarını üretir (bir kez gösterilir); öncekini geçersiz kılar. */
export const issueInstallToken = definePlatformAction({
  name: 'platform.issueInstallToken',
  input: z.object({ companyId: z.string().uuid() }),
  run: async (ctx, i) => {
    const token = randomBytes(32).toString('base64url');
    const [c] = await ctx.db.update(companies).set({ installTokenHash: hash(token) }).where(eq(companies.id, i.companyId)).returning({ slug: companies.slug });
    if (!c) throw new AppError('NOT_FOUND', 'Firma bulunamadı.');
    await ctx.log({ targetCompanyId: i.companyId, detail: { rotated: true } });
    return { token, slug: c.slug };
  },
});

/** Merkez tarafı: kurulum anahtarı doğruysa firmanın güncel ayarı imzalı paket olarak; değilse null. */
export async function centralBundleFor(db: Db, slug: string, token: string, privateKeyB64: string, now = new Date()): Promise<CentralBundle | null> {
  const [c] = await db.select({ id: companies.id, slug: companies.slug, tokenHash: companies.installTokenHash }).from(companies).where(eq(companies.slug, slug));
  if (!c?.tokenHash || !token) return null;
  const given = Buffer.from(hash(token), 'hex');
  const stored = Buffer.from(c.tokenHash, 'hex');
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return null;
  const data = await dataDbFor(c.id, db);
  const cfg = await loadCompanyConfig(data, c.id);
  const [st] = await withCompany(c.id, (tx) => tx.select({ status: companySettings.status }).from(companySettings).where(eq(companySettings.companyId, c.id)), data);
  return signBundle(
    {
      slug: c.slug, modules: [...cfg.modules], sector: cfg.sector, twoFactorRoles: [...cfg.security.twoFactorRequiredRoles], features: cfg.features,
      status: st?.status ?? 'active', issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + VALID_DAYS * 86_400_000).toISOString(),
    },
    privateKeyB64,
  );
}

/** Kurulum tarafı: doğrulanmış paketi firmanın ayarına yazar (merkez paneldeki ayarla aynı tablo). */
export async function applyCentralBundle(db: Db, companyId: string, p: CentralBundle['payload']): Promise<void> {
  await withCompany(
    companyId,
    async (tx) => {
      // Eski paket yeniden oynatılamaz: yalnız son uygulanandan daha yeni düzenlenmiş paket geçer.
      const [cur] = await tx.select({ issuedAt: companySettings.centralIssuedAt }).from(companySettings).where(eq(companySettings.companyId, companyId)).for('update');
      if (cur?.issuedAt && Date.parse(p.issuedAt) <= cur.issuedAt.getTime()) throw new Error('Ayar paketi son uygulanandan eski.');
      const values = { modules: p.modules, sector: p.sector, twoFactorRoles: p.twoFactorRoles, features: p.features, status: p.status, centralIssuedAt: new Date(p.issuedAt), updatedAt: new Date(), updatedBy: 'merkez' };
      await tx.insert(companySettings).values({ companyId, ...values }).onConflictDoUpdate({ target: companySettings.companyId, set: values });
      await writeAudit(tx, { companyId, actorUserId: null, action: 'platform.centralSync', entity: 'company', entityId: companyId, after: { modules: p.modules, sector: p.sector, status: p.status, issuedAt: p.issuedAt } });
    },
    db,
  );
}

export type CentralEnv = { url: string; token: string; publicKey: string; slug: string };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Merkezden ayarı çeker, doğrular, uygular. Hata olursa hiçbir şey değişmez; son uygulanan ayar geçerli kalır. */
export async function syncFromCentral(db: Db, companyId: string, env: CentralEnv, fetcher: Fetcher = fetch, now = new Date()): Promise<{ applied: boolean; reason?: string }> {
  let body: unknown;
  try {
    const res = await fetcher(env.url, { headers: { authorization: `Bearer ${env.token}` }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    if (!res.ok) return { applied: false, reason: `Merkez ${res.status} döndü; son ayar geçerli.` };
    body = await res.json();
  } catch (e) {
    return { applied: false, reason: `Merkeze ulaşılamadı (${(e as Error).message}); son ayar geçerli.` };
  }
  try {
    const p = verifyBundle(body, env.publicKey, env.slug, now);
    await applyCentralBundle(db, companyId, p);
    return { applied: true };
  } catch (e) {
    return { applied: false, reason: `${(e as Error).message} Son ayar geçerli.` };
  }
}
