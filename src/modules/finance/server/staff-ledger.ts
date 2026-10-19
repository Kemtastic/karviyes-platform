import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { staff } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { formatMoney, money, parseMoney } from '@/core/money';
import { finMovements, finStaffEntries, STAFF_ENTRY_KINDS } from '../db/schema';
import { assertOpen, FIN, writeExpense } from './actions';

// Personel carisi (yalnız yönetici ve muhasebe): bakiye artı = personele borçluyuz, eksi = personel bize borçlu (fazla avans).
// Maaş verisi kişisel veridir (KVKK); bu yüzden satış ve üretim rolleri göremez.

export const STAFF_ENTRY_LABELS: Record<(typeof STAFF_ENTRY_KINDS)[number], string> = {
  accrual: 'Tahakkuk (maaş, prim)', advance: 'Avans', payment: 'Maaş ödemesi', deduction: 'Kesinti',
};
const SIGN: Record<(typeof STAFF_ENTRY_KINDS)[number], 1n | -1n> = { accrual: 1n, advance: -1n, payment: -1n, deduction: -1n };
const fm = (v: bigint) => formatMoney(money(v, 'TRY'));

export const recordStaffEntry = defineAction({
  name: 'finance.recordStaffEntry',
  module: 'finance',
  roles: FIN,
  input: z.object({
    staffId: z.string().uuid('Personel seçin.'),
    kind: z.enum(STAFF_ENTRY_KINDS),
    amount: z.string().trim().min(1, 'Tutarı yazın.').max(30),
    date: z.string().date('Tarih GG.AA.YYYY biçiminde olmalı.'),
    period: z.union([z.literal(''), z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Dönem YYYY-AA olmalı.')]).optional(),
    accountId: z.union([z.literal(''), z.string().uuid()]).optional(),
    note: z.string().trim().max(300).default(''),
  }),
  run: async (ctx, i) => {
    const [s] = await ctx.tx.select().from(staff).where(eq(staff.id, i.staffId));
    if (!s) throw new AppError('VALIDATION', 'Personel bulunamadı.', { staffId: 'Listeden seçin.' });
    let amount: bigint;
    try {
      amount = parseMoney(i.amount, 'TRY').minor;
    } catch {
      throw new AppError('VALIDATION', 'Tutar geçersiz.', { amount: 'Tutarı 1.234,56 biçiminde yazın.' });
    }
    if (amount <= 0n) throw new AppError('VALIDATION', 'Tutar sıfırdan büyük olmalı.', { amount: 'Sıfırdan büyük olmalı.' });
    if (i.kind === 'accrual' && !i.period) throw new AppError('VALIDATION', 'Tahakkukun ait olduğu ayı seçin.', { period: 'Dönem seçin.' });
    const paysOut = i.kind === 'advance' || i.kind === 'payment';
    if (paysOut && !i.accountId) throw new AppError('VALIDATION', 'Ödemenin çıktığı kasa ya da bankayı seçin.', { accountId: 'Hesap seçin.' });
    const movement = paysOut
      ? await writeExpense(ctx, { direction: 'out', accountId: i.accountId!, amountMinor: amount, vatRate: 0, category: 'Personel', date: i.date, note: `${s.name} · ${STAFF_ENTRY_LABELS[i.kind]}${i.note ? ` · ${i.note}` : ''}` })
      : null;
    const [row] = await ctx.tx
      .insert(finStaffEntries)
      .values({ companyId: ctx.companyId, staffId: s.id, kind: i.kind, amountMinor: amount, date: i.date, period: i.period || null, movementId: movement?.id ?? null, note: i.note, createdBy: ctx.user.userId })
      .returning({ id: finStaffEntries.id });
    await ctx.audit({ entity: 'fin_staff_entry', entityId: row!.id, after: { staffId: s.id, kind: i.kind, amount: amount.toString(), date: i.date, period: i.period || null, movementId: movement?.id ?? null } });
    return { id: row!.id, movementId: movement?.id ?? null };
  },
});

/** Personel kaydını iptal eder; ödeme/avanssa kasa hareketi de iptal edilir (dönem kilidi denetlenir). */
export const reverseStaffEntry = defineAction({
  name: 'finance.reverseStaffEntry',
  module: 'finance',
  roles: FIN,
  input: z.object({ id: z.string().uuid(), reason: z.string().trim().min(3, 'İptal nedenini yazın.').max(300) }),
  run: async (ctx, i) => {
    const [e] = await ctx.tx.select().from(finStaffEntries).where(eq(finStaffEntries.id, i.id)).for('update');
    if (!e || e.reversedAt) throw new AppError('INVALID_STATE', 'Kayıt bulunamadı ya da zaten iptal edilmiş.');
    await assertOpen(ctx, e.date, 'reason');
    await ctx.tx.update(finStaffEntries).set({ reversedAt: new Date() }).where(eq(finStaffEntries.id, e.id));
    if (e.movementId) await ctx.tx.update(finMovements).set({ reversedAt: new Date(), reverseReason: i.reason }).where(and(eq(finMovements.id, e.movementId), isNull(finMovements.reversedAt)));
    await ctx.audit({ entity: 'fin_staff_entry', entityId: e.id, after: { reversed: true, reason: i.reason, movementId: e.movementId } });
    return { id: e.id };
  },
});

export const staffLedger = defineAction({
  name: 'finance.staffLedger',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ staffId: z.string().uuid() }),
  run: async (ctx, i) => {
    const [s] = await ctx.tx.select().from(staff).where(eq(staff.id, i.staffId));
    if (!s) throw new AppError('NOT_FOUND', 'Personel bulunamadı.');
    const entries = await ctx.tx.select().from(finStaffEntries).where(eq(finStaffEntries.staffId, i.staffId)).orderBy(asc(finStaffEntries.date), asc(finStaffEntries.createdAt));
    let bal = 0n;
    const rows = entries.map((e) => {
      if (!e.reversedAt) bal += SIGN[e.kind] * e.amountMinor;
      return { id: e.id, date: e.date, kind: e.kind, label: STAFF_ENTRY_LABELS[e.kind], period: e.period, note: e.note, amount: fm(e.amountMinor), reversed: Boolean(e.reversedAt), balance: fm(bal) };
    });
    return { staffId: s.id, name: s.name, rows, balance: fm(bal), owed: bal > 0n };
  },
});

export const staffBalances = defineAction({
  name: 'finance.staffBalances',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) => {
    const people = await ctx.tx.select({ id: staff.id, name: staff.name, active: staff.active }).from(staff).orderBy(asc(staff.name));
    const entries = await ctx.tx.select({ staffId: finStaffEntries.staffId, kind: finStaffEntries.kind, amount: finStaffEntries.amountMinor }).from(finStaffEntries).where(isNull(finStaffEntries.reversedAt));
    const by = new Map<string, bigint>();
    for (const e of entries) by.set(e.staffId, (by.get(e.staffId) ?? 0n) + SIGN[e.kind] * e.amount);
    return people.map((p) => {
      const b = by.get(p.id) ?? 0n;
      return { staffId: p.id, name: p.name, active: p.active, balance: fm(b), owed: b > 0n, advanceOver: b < 0n };
    });
  },
});
