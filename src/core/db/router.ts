import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { connectDb, type Db } from './client';
import { companies } from './schema';

// Firmaya ayrı veritabanı: kimlik (kullanıcı, oturum) ve firma listesi ana veritabanında, firmanın iş verisi kendi veritabanında.
// Bağlantı adresi ana veritabanında AES-256-GCM ile şifreli durur; anahtar PLATFORM_SECRET türevidir. Firma kimliği ek doğrulama
// verisi (AAD) olarak şifreye bağlanır: bir firmanın şifreli adresi başka firmanın satırına taşınırsa açılmaz.

function key(): Buffer {
  const secret = process.env.PLATFORM_SECRET;
  if (!secret || secret.length < 32) throw new Error('PLATFORM_SECRET (en az 32 karakter) tanımlı değil; ayrı veritabanı kullanılamaz.');
  return Buffer.from(hkdfSync('sha256', secret, 'karviyes', 'firma-veritabani-adresi', 32));
}

export function encryptUrl(url: string, companyId: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  c.setAAD(Buffer.from(companyId));
  const body = Buffer.concat([c.update(url, 'utf8'), c.final()]);
  return ['v2', iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function decryptUrl(enc: string, companyId: string): string {
  const [v, iv, tag, body] = enc.split('.');
  if (v !== 'v2' || !iv || !tag || !body) throw new Error('Şifreli veritabanı adresi bozuk.');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(companyId));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
}

const TTL_MS = 60_000;
const routes = new Map<string, { url: string | null; at: number }>();

/** Firmanın veri veritabanı: kendi veritabanı tanımlıysa o, değilse ana veritabanı. Adres bir dakika önbellekte. */
export async function dataDbFor(companyId: string, main: Db, now = Date.now()): Promise<Db> {
  let hit = routes.get(companyId);
  if (!hit || now - hit.at >= TTL_MS) {
    const [row] = await main.select({ enc: companies.dataUrlEnc }).from(companies).where(eq(companies.id, companyId));
    hit = { url: row?.enc ? decryptUrl(row.enc, companyId) : null, at: now };
    routes.set(companyId, hit);
  }
  return hit.url ? connectDb(hit.url) : main;
}

/** Testler ve taşıma sonrası için yönlendirme önbelleğini boşaltır. */
export function clearDataRoutes(companyId?: string) {
  if (companyId) routes.delete(companyId);
  else routes.clear();
}
