import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { connectDb, type Db } from './client';
import { companies } from './schema';

// Firmaya ayrı veritabanı: kimlik (kullanıcı, oturum) ve firma listesi ana veritabanında, firmanın iş verisi kendi veritabanında.
// Bağlantı adresi ana veritabanında AES-256-GCM ile şifreli durur; anahtar PLATFORM_SECRET (yoksa BETTER_AUTH_SECRET) türevidir.

// Şifreleme ilk anahtarla yapılır; açarken ikisi de denenir (PLATFORM_SECRET sonradan eklenirse eski adresler açılmaya devam eder).
function keys(): Buffer[] {
  const secrets = [process.env.PLATFORM_SECRET, process.env.BETTER_AUTH_SECRET].filter((s): s is string => Boolean(s && s.length >= 32));
  if (!secrets.length) throw new Error('PLATFORM_SECRET (en az 32 karakter) tanımlı değil.');
  return secrets.map((secret) => Buffer.from(hkdfSync('sha256', secret, 'karviyes', 'firma-veritabani-adresi', 32)));
}

export function encryptUrl(url: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keys()[0]!, iv);
  const body = Buffer.concat([c.update(url, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function decryptUrl(enc: string): string {
  const [v, iv, tag, body] = enc.split('.');
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('Şifreli veritabanı adresi bozuk.');
  for (const k of keys()) {
    try {
      const d = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url'));
      d.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
    } catch {
      // sonraki anahtar
    }
  }
  throw new Error('Veritabanı adresi bu anahtarlarla açılamadı.');
}

const TTL_MS = 60_000;
const routes = new Map<string, { url: string | null; at: number }>();

/** Firmanın veri veritabanı: kendi veritabanı tanımlıysa o, değilse ana veritabanı. Adres bir dakika önbellekte. */
export async function dataDbFor(companyId: string, main: Db, now = Date.now()): Promise<Db> {
  let hit = routes.get(companyId);
  if (!hit || now - hit.at >= TTL_MS) {
    const [row] = await main.select({ enc: companies.dataUrlEnc }).from(companies).where(eq(companies.id, companyId));
    hit = { url: row?.enc ? decryptUrl(row.enc) : null, at: now };
    routes.set(companyId, hit);
  }
  return hit.url ? connectDb(hit.url) : main;
}

/** Testler ve taşıma sonrası için yönlendirme önbelleğini boşaltır. */
export function clearDataRoutes(companyId?: string) {
  if (companyId) routes.delete(companyId);
  else routes.clear();
}
