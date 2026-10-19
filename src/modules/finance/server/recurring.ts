import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction, type ActionCtx } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { AppError } from '@/core/errors';
import { formatMoney, money, parseMoney, type Currency } from '@/core/money';
import { finAccounts, finRecurring } from '../db/schema';
import { nextDue } from '../domain/recurring';
import { FIN, writeExpense } from './actions';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ay YYYY-AA biçiminde olmalı.');

async function accountOf(ctx: ActionCtx, id: string) {
  const [a] = await ctx.tx.select().from(finAccounts).where(eq(finAccounts.id, id));
  if (!a || a.archived) throw new AppError('VALIDATION', 'Aktif bir kasa ya da banka hesabı seçin.', { accountId: 'Hesap seçin.' });
  return a;
}

async function recurringOf(ctx: ActionCtx, id: string) {
  const [r] = await ctx.tx.select().from(finRecurring).where(eq(finRecurring.id, id)).for('update');
  if (!r) throw new AppError('NOT_FOUND', 'Tekrarlayan kayıt bulunamadı.');
  return r;
}

export const createRecurring = defineAction({
  name: 'finance.createRecurring',
  module: 'finance',
  roles: FIN,
  input: z
    .object({
      name: z.string().trim().min(2, 'Adını yazın.').max(80),
      direction: z.enum(['out', 'in']).default('out'),
      accountId: z.string().uuid('Hesap seçin.'),
      amount: z.string().trim().min(1, 'Tutarı yazın.').max(30),
      vatRate: z.coerce.number().min(0).max(100).default(0),
      category: z.string().trim().min(1, 'Kategori seçin.').max(60),
      dayOfMonth: z.coerce.number().int().min(1, 'Gün 1–28 arasında olmalı.').max(28, 'Gün 1–28 arasında olmalı (her ayda olan gün).'),
      startMonth: month,
      endMonth: z.union([z.literal(''), z.null(), month]).optional().transform((v) => v || null),
    })
    .refine((i) => !i.endMonth || i.endMonth >= i.startMonth, { path: ['endMonth'], message: 'Bitiş ayı başlangıçtan önce olamaz.' }),
  run: async (ctx, i) => {
    const a = await accountOf(ctx, i.accountId);
    let amount: bigint;
    try {
      amount = parseMoney(i.amount, a.currency as Currency).minor;
    } catch {
      throw new AppError('VALIDATION', 'Tutar geçersiz.', { amount: 'Tutarı 1.234,56 biçiminde yazın.' });
    }
    if (amount <= 0n) throw new AppError('VALIDATION', 'Tutar sıfırdan büyük olmalı.', { amount: 'Sıfırdan büyük olmalı.' });
    const [row] = await ctx.tx
      .insert(finRecurring)
      .values({ companyId: ctx.companyId, name: i.name, direction: i.direction, accountId: a.id, amountMinor: amount, vatRate: String(i.vatRate), category: i.category, dayOfMonth: i.dayOfMonth, startMonth: i.startMonth, endMonth: i.endMonth, createdBy: ctx.user.userId })
      .returning({ id: finRecurring.id });
    await ctx.audit({ entity: 'fin_recurring', entityId: row!.id, after: { ...i, amount: amount.toString() } });
    return { id: row!.id };
  },
});

export const setRecurringActive = defineAction({
  name: 'finance.setRecurringActive',
  module: 'finance',
  roles: FIN,
  input: z.object({ id: z.string().uuid(), version: z.number().int(), active: z.boolean() }),
  run: async (ctx, i) => {
    const r = await recurringOf(ctx, i.id);
    if (r.version !== i.version) throw new AppError('CONFLICT', 'Kayıt başka biri tarafından değiştirildi; sayfayı yenileyin.');
    await ctx.tx.update(finRecurring).set({ active: i.active, version: r.version + 1 }).where(eq(finRecurring.id, i.id));
    await ctx.audit({ entity: 'fin_recurring', entityId: i.id, before: { active: r.active }, after: { active: i.active } });
    return { active: i.active };
  },
});

/** Sıradaki ayı işler: o ayın seçilen gününe masraf/gelir hareketi yazılır, son işlenen ay ilerler. Ay atlanamaz, tekrar işlenemez. */
export const postRecurring = defineAction({
  name: 'finance.postRecurring',
  module: 'finance',
  roles: FIN,
  input: z.object({ id: z.string().uuid(), month, version: z.number().int(), today: z.string().date().optional() }),
  run: async (ctx, i) => {
    const r = await recurringOf(ctx, i.id);
    if (r.version !== i.version) throw new AppError('CONFLICT', 'Kayıt başka biri tarafından değiştirildi; sayfayı yenileyin.');
    if (r.lastPostedMonth && i.month <= r.lastPostedMonth) throw new AppError('CONFLICT', `${i.month} zaten işlendi.`);
    const next = nextDue(r, i.today ?? istanbulToday());
    if (!next) throw new AppError('VALIDATION', 'Bu kaydın işlenecek ayı yok (pasif ya da bitiş ayı geçti).');
    if (i.month !== next.month) throw new AppError('VALIDATION', `Sıradaki ay ${next.month}; aylar sırayla işlenir.`);
    if (!next.due) throw new AppError('VALIDATION', `${next.date} tarihinin vadesi henüz gelmedi.`);
    const m = await writeExpense(ctx, {
      direction: r.direction, accountId: r.accountId, amountMinor: r.amountMinor, vatRate: Number(r.vatRate), category: r.category, date: next.date,
      note: `${r.name} · ${i.month} (tekrarlayan kayıt)`,
    });
    await ctx.tx.update(finRecurring).set({ lastPostedMonth: i.month, version: r.version + 1 }).where(eq(finRecurring.id, r.id));
    await ctx.audit({ entity: 'fin_recurring', entityId: r.id, after: { posted: i.month, movementId: m.id } });
    return { movementId: m.id, date: next.date };
  },
});

export const recurringList = defineAction({
  name: 'finance.recurringList',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ today: z.string().date().optional() }),
  run: async (ctx, i) => {
    const today = i.today ?? istanbulToday();
    const rows = await ctx.tx
      .select({ r: finRecurring, accountName: finAccounts.name, currency: finAccounts.currency })
      .from(finRecurring)
      .innerJoin(finAccounts, eq(finAccounts.id, finRecurring.accountId))
      .orderBy(asc(finRecurring.dayOfMonth), asc(finRecurring.name));
    return rows.map(({ r, accountName, currency }) => ({
      id: r.id, name: r.name, direction: r.direction, accountName, category: r.category, dayOfMonth: r.dayOfMonth, vatRate: String(Number(r.vatRate)),
      amount: formatMoney(money(r.amountMinor, currency as Currency)), startMonth: r.startMonth, endMonth: r.endMonth, lastPostedMonth: r.lastPostedMonth,
      active: r.active, version: r.version, next: nextDue(r, today),
    }));
  },
});
