import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction, type ActionCtx } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { getDb, type Db } from '@/core/db/client';
import { companies, parties } from '@/core/db/schema';
import { withCompany } from '@/core/db/scope';
import { getEnv } from '@/core/env';
import { AppError } from '@/core/errors';
import { CURRENCIES, formatMoney, money, parseMoney, type Currency } from '@/core/money';
import { finReconciliations, type ReconciliationResponse, type ReconciliationSnapshot } from '../db/schema';
import { statement } from '../domain/ledger';
import { FIN } from './actions';
import { ledgerEntries } from './queries';

export const LINK_DAYS = 30;
const MAX_ROWS = 500;

const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');

/** Bağlantı: firma ~ kayıt ~ gizli anahtar. Firma kimliği RLS kapsamını kurmak için gerekir; gizli anahtar tahmin edilemez (256 bit). */
export function makeToken(companyId: string, id: string): { token: string; tokenHash: string } {
  const secret = randomBytes(32).toString('base64url');
  return { token: `${companyId}~${id}~${secret}`, tokenHash: hash(secret) };
}

export function parseToken(token: string): { companyId: string; id: string; secret: string } | null {
  const m = /^([0-9a-f-]{36})~([0-9a-f-]{36})~([A-Za-z0-9_-]{43})$/.exec(token);
  return m ? { companyId: m[1]!, id: m[2]!, secret: m[3]! } : null;
}

function sameHash(secret: string, stored: string | null): boolean {
  if (!stored) return false;
  const a = Buffer.from(hash(secret), 'hex');
  const b = Buffer.from(stored, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function publicLink(token: string): string {
  let base = 'http://localhost:3000';
  try {
    base = getEnv().BETTER_AUTH_URL;
  } catch {
    // Ortam doğrulanamıyorsa (testler) yerel adres.
  }
  return `${base.replace(/\/$/, '')}/mutabakat/${token}`;
}

async function nextNo(ctx: ActionCtx, asOf: string): Promise<string> {
  const prefix = `MUT-${asOf.replace(/-/g, '')}-`;
  const [row] = await ctx.tx
    .select({ n: sql<number>`count(*)` })
    .from(finReconciliations)
    .where(sql`${finReconciliations.no} like ${prefix + '%'}`);
  return `${prefix}${String(Number(row?.n ?? 0) + 1).padStart(3, '0')}`;
}

/** Mutabakat taslağı: seçilen tarihteki bakiye ve ekstre dondurulur. */
export const createReconciliation = defineAction({
  name: 'finance.createReconciliation',
  module: 'finance',
  roles: FIN,
  input: z.object({
    partyId: z.string().uuid('Cari seçin.'),
    currency: z.enum(CURRENCIES),
    asOf: z.string().date(),
    email: z.string().trim().email('Geçerli bir e-posta yazın.').or(z.literal('')).default(''),
    contactName: z.string().trim().max(120).default(''),
    message: z.string().trim().max(1000).default(''),
  }),
  run: async (ctx, i) => {
    if (i.asOf > istanbulToday()) throw new AppError('VALIDATION', 'Mutabakat tarihi bugünden sonra olamaz.', { asOf: 'Bugün veya önceki bir tarih seçin.' });
    const [p] = await ctx.tx.select({ name: parties.name, taxId: parties.taxId, archived: parties.archived }).from(parties).where(eq(parties.id, i.partyId));
    if (!p || p.archived) throw new AppError('VALIDATION', 'Listeden aktif bir cari seçin.', { partyId: 'Listeden aktif bir cari seçin.' });
    const [c] = await ctx.tx.select({ name: companies.name }).from(companies).where(eq(companies.id, ctx.companyId));
    const entries = ((await ledgerEntries(ctx, i.partyId)).get(`${i.partyId}|${i.currency}`) ?? []).filter((e) => e.date <= i.asOf);
    const st = statement(entries);
    const rows = st.rows.map((r) => ({ date: r.date, text: r.text, debit: r.debit.toString(), credit: r.credit.toString(), balance: r.balance.toString() }));
    const snapshot: ReconciliationSnapshot = { company: c?.name ?? '', partyName: p.name, taxId: p.taxId, rows: rows.slice(-MAX_ROWS), truncated: rows.length > MAX_ROWS };
    const [row] = await ctx.tx
      .insert(finReconciliations)
      .values({
        companyId: ctx.companyId, no: await nextNo(ctx, i.asOf), partyId: i.partyId, currency: i.currency, asOf: i.asOf, balanceMinor: st.balance, snapshot,
        email: i.email, contactName: i.contactName, message: i.message, createdBy: ctx.user.userId,
      })
      .returning({ id: finReconciliations.id, no: finReconciliations.no });
    await ctx.audit({ entity: 'fin_reconciliation', entityId: row!.id, after: { partyId: i.partyId, asOf: i.asOf, currency: i.currency, balance: st.balance.toString() } });
    return { id: row!.id, no: row!.no, balance: st.balance.toString() };
  },
});

async function load(ctx: ActionCtx, id: string, version: number) {
  const [r] = await ctx.tx.select().from(finReconciliations).where(eq(finReconciliations.id, id));
  if (!r) throw new AppError('NOT_FOUND', 'Mutabakat bulunamadı.');
  if (r.version !== version) throw new AppError('CONFLICT', 'Mutabakat başka biri tarafından değiştirildi. Sayfayı yenileyin.');
  return r;
}

/**
 * Karşı taraf için yeni bağlantı üretir (eskisi geçersiz olur) ve e-posta adresi varsa gönderir.
 * Bağlantı yalnızca bu yanıtta bir kez döner; sistemde özeti saklanır.
 */
export const issueReconciliationLink = defineAction({
  name: 'finance.issueReconciliationLink',
  module: 'finance',
  roles: FIN,
  input: z.object({ id: z.string().uuid(), version: z.number().int(), send: z.boolean().default(true) }),
  run: async (ctx, i) => {
    const r = await load(ctx, i.id, i.version);
    if (r.status !== 'draft' && r.status !== 'pending') throw new AppError('INVALID_STATE', 'Cevaplanmış ya da iptal edilmiş mutabakat yeniden gönderilemez.');
    const { token, tokenHash } = makeToken(ctx.companyId, r.id);
    const expires = new Date(Date.now() + LINK_DAYS * 86_400_000);
    const link = publicLink(token);
    let mailed = false;
    if (i.send && r.email) {
      if (r.sentAt && Date.now() - r.sentAt.getTime() < 60 * 60 * 1000) throw new AppError('RATE_LIMITED', 'Bu mutabakat son bir saat içinde gönderildi. Bağlantıyı kopyalayıp iletebilirsiniz.');
      const { sendMail } = await import('@/core/mail');
      const balance = formatMoney(money(r.balanceMinor, r.currency as Currency));
      const text = [
        `Sayın ${r.contactName || r.snapshot.partyName},`,
        '',
        `${r.snapshot.company} kayıtlarına göre ${r.asOf.split('-').reverse().join('.')} tarihi itibarıyla cari hesap bakiyeniz ${balance} (${Number(r.balanceMinor) >= 0 ? 'firmamıza borçlu' : 'firmamızdan alacaklı'}) görünmektedir.`,
        r.message ? `\n${r.message}\n` : '',
        'Ekstreyi görmek ve mutabık olup olmadığınızı bildirmek için aşağıdaki bağlantıyı kullanın (30 gün geçerlidir):',
        link,
        '',
        'Cevap verilmemesi mutabakat sayılmaz.',
      ].join('\n');
      // Gönderilemezse bağlantı yine verilir; ekranda kopyalanıp iletilir.
      mailed = await sendMail(r.email, `${r.snapshot.company} · Cari hesap mutabakatı ${r.no}`, text).then(() => true, () => false);
    }
    await ctx.tx
      .update(finReconciliations)
      .set({ tokenHash, tokenExpiresAt: expires, status: 'pending', ...(mailed ? { sentAt: new Date() } : {}), version: r.version + 1 })
      .where(and(eq(finReconciliations.id, r.id), eq(finReconciliations.version, r.version)));
    await ctx.audit({ entity: 'fin_reconciliation', entityId: r.id, after: { status: 'pending', mailed, expires: expires.toISOString() } });
    return { link, mailed, expiresAt: expires.toISOString() };
  },
});

export const cancelReconciliation = defineAction({
  name: 'finance.cancelReconciliation',
  module: 'finance',
  roles: FIN,
  input: z.object({ id: z.string().uuid(), version: z.number().int(), reason: z.string().trim().min(3, 'Nedeni yazın.').max(500) }),
  run: async (ctx, i) => {
    const r = await load(ctx, i.id, i.version);
    if (r.status !== 'draft' && r.status !== 'pending') throw new AppError('INVALID_STATE', 'Cevaplanmış mutabakat iptal edilemez.');
    await ctx.tx.update(finReconciliations).set({ status: 'cancelled', cancelReason: i.reason, tokenHash: null, version: r.version + 1 }).where(eq(finReconciliations.id, r.id));
    await ctx.audit({ entity: 'fin_reconciliation', entityId: r.id, after: { status: 'cancelled', reason: i.reason } });
    return { id: r.id };
  },
});

const answer = z.object({
  status: z.enum(['agreed', 'disputed']),
  name: z.string().trim().min(2, 'Adınızı yazın.').max(120),
  title: z.string().trim().max(120).default(''),
  note: z.string().trim().max(2000).default(''),
  counterBalance: z.string().trim().max(30).default(''),
});

function checkAnswer(a: z.infer<typeof answer>, currency: Currency): { counter: string | null } {
  if (a.status === 'disputed' && a.note.length < 3) throw new AppError('VALIDATION', 'Mutabık olmadığınız konuyu kısaca yazın.', { note: 'Farkın nedenini yazın.' });
  if (a.status === 'agreed' || !a.counterBalance) return { counter: null };
  try {
    return { counter: parseMoney(a.counterBalance, currency).minor.toString() };
  } catch {
    throw new AppError('VALIDATION', 'Bakiye anlaşılamadı. Örnek: 1.234,56', { counterBalance: 'Örnek: 1.234,56' });
  }
}

/** Karşı tarafın cevabı sistem dışından (telefon, kaşeli yazı) geldiyse kaydedilir. */
export const recordReconciliationAnswer = defineAction({
  name: 'finance.recordReconciliationAnswer',
  module: 'finance',
  roles: FIN,
  input: answer.extend({ id: z.string().uuid(), version: z.number().int() }),
  run: async (ctx, i) => {
    const r = await load(ctx, i.id, i.version);
    if (r.status !== 'draft' && r.status !== 'pending') throw new AppError('INVALID_STATE', 'Bu mutabakat zaten cevaplanmış ya da iptal edilmiş.');
    const { counter } = checkAnswer(i, r.currency as Currency);
    const response: ReconciliationResponse = { name: i.name, title: i.title, note: i.note, counterBalance: counter, at: new Date().toISOString(), external: true };
    await ctx.tx.update(finReconciliations).set({ status: i.status, response, respondedAt: new Date(), tokenHash: null, version: r.version + 1 }).where(eq(finReconciliations.id, r.id));
    await ctx.audit({ entity: 'fin_reconciliation', entityId: r.id, after: { status: i.status, external: true } });
    return { id: r.id };
  },
});

export const reconciliationsList = defineAction({
  name: 'finance.reconciliations',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ partyId: z.string().uuid().optional() }),
  run: async (ctx, i) => {
    const rows = await ctx.tx
      .select()
      .from(finReconciliations)
      .where(i.partyId ? eq(finReconciliations.partyId, i.partyId) : undefined)
      .orderBy(desc(finReconciliations.createdAt))
      .limit(500);
    return rows.map((r) => ({
      id: r.id, no: r.no, partyId: r.partyId, partyName: r.snapshot.partyName, currency: r.currency as Currency, asOf: r.asOf, balance: r.balanceMinor.toString(),
      email: r.email, status: r.status, sentAt: r.sentAt?.toISOString() ?? null, respondedAt: r.respondedAt?.toISOString() ?? null, version: r.version,
    }));
  },
});

export const reconciliationDetail = defineAction({
  name: 'finance.reconciliationDetail',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ id: z.string().uuid() }),
  run: async (ctx, i) => {
    const [r] = await ctx.tx.select().from(finReconciliations).where(eq(finReconciliations.id, i.id));
    if (!r) throw new AppError('NOT_FOUND', 'Mutabakat bulunamadı.');
    return {
      id: r.id, no: r.no, version: r.version, partyId: r.partyId, currency: r.currency as Currency, asOf: r.asOf, balance: r.balanceMinor.toString(), snapshot: r.snapshot,
      email: r.email, contactName: r.contactName, message: r.message, status: r.status, sentAt: r.sentAt?.toISOString() ?? null,
      linkActive: Boolean(r.tokenHash && r.tokenExpiresAt && r.tokenExpiresAt > new Date()), tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null,
      response: r.response, respondedAt: r.respondedAt?.toISOString() ?? null, cancelReason: r.cancelReason, createdAt: r.createdAt.toISOString(),
    };
  },
});

// ── Karşı taraf (oturumsuz) ────────────────────────────────────────────────

export type PublicReconciliation = {
  no: string; company: string; partyName: string; currency: Currency; asOf: string; balance: string; message: string; contactName: string;
  rows: ReconciliationSnapshot['rows']; truncated: boolean; status: string; response: ReconciliationResponse | null;
};

async function byToken(token: string, db: Db) {
  const t = parseToken(token);
  if (!t) return null;
  const [r] = await withCompany(t.companyId, (tx) => tx.select().from(finReconciliations).where(eq(finReconciliations.id, t.id)), db);
  if (!r) return null;
  // İptal edilen ya da sistem dışı cevaplanan kayıtta özet silinir; bağlantı da geçersiz olur.
  if (!sameHash(t.secret, r.tokenHash) || !r.tokenExpiresAt || r.tokenExpiresAt < new Date()) return null;
  return { t, r };
}

export async function publicReconciliation(token: string, db?: Db): Promise<PublicReconciliation | null> {
  const found = await byToken(token, db ?? (await getDb()));
  if (!found) return null;
  const { r } = found;
  return {
    no: r.no, company: r.snapshot.company, partyName: r.snapshot.partyName, currency: r.currency as Currency, asOf: r.asOf, balance: r.balanceMinor.toString(),
    message: r.message, contactName: r.contactName, rows: r.snapshot.rows, truncated: r.snapshot.truncated, status: r.status, response: r.response ?? null,
  };
}

/** Karşı tarafın cevabı: bir kez verilir, sonra kesinleşir. Sessizlik mutabakat sayılmaz. */
export async function answerReconciliation(token: string, raw: unknown, db?: Db): Promise<{ ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> }> {
  const database = db ?? (await getDb());
  const found = await byToken(token, database);
  if (!found) return { ok: false, message: 'Bağlantı geçersiz ya da süresi dolmuş.' };
  const { t, r } = found;
  if (r.status !== 'pending') return { ok: false, message: 'Bu mutabakat zaten cevaplanmış ya da iptal edilmiş.' };
  const parsed = answer.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((x) => [x.path.join('.'), x.message]));
    return { ok: false, message: 'Lütfen işaretli alanları düzeltin.', fieldErrors };
  }
  let counter: string | null;
  try {
    counter = checkAnswer(parsed.data, r.currency as Currency).counter;
  } catch (e) {
    const err = e as AppError;
    return { ok: false, message: err.message, fieldErrors: err.fieldErrors };
  }
  const a = parsed.data;
  const response: ReconciliationResponse = { name: a.name, title: a.title, note: a.note, counterBalance: counter, at: new Date().toISOString(), external: false };
  const done = await withCompany(
    t.companyId,
    async (tx) => {
      // Aynı anda iki cevap gelirse yalnızca ilki yazılır.
      const rows = await tx
        .update(finReconciliations)
        .set({ status: a.status, response, respondedAt: new Date(), version: r.version + 1 })
        .where(and(eq(finReconciliations.id, r.id), eq(finReconciliations.status, 'pending'), eq(finReconciliations.version, r.version)))
        .returning({ id: finReconciliations.id });
      if (rows.length) {
        const { writeAudit } = await import('@/core/db/scope');
        await writeAudit(tx, { companyId: t.companyId, actorUserId: null, actorStaffId: null, action: 'finance.reconciliationAnswered', entity: 'fin_reconciliation', entityId: r.id, after: { status: a.status, name: a.name } });
      }
      return rows.length > 0;
    },
    database,
  );
  return done ? { ok: true } : { ok: false, message: 'Bu mutabakat zaten cevaplanmış.' };
}
