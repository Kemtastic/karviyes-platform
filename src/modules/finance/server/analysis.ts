import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { formatMoney, money } from '@/core/money';
import { finAccounts, finChecks, finInvoices, finMovements, finRecurring } from '../db/schema';
import { openItems } from '../domain/ledger';
import { addMonth, nextDue } from '../domain/recurring';
import { FIN } from './actions';
import { accountBalances, allocations, ledgerEntries } from './queries';

// Yönetim raporları (TL): gelir-gider (tahakkuk esaslı, KDV hariç) ve haftalık nakit akış tahmini.
// Döviz cinsinden faturalar ve hesaplar bu raporlara girmez; ekranda belirtilir.

const isoDate = z.string().date('Tarih GG.AA.YYYY biçiminde olmalı.');
const tl = (v: bigint) => formatMoney(money(v, 'TRY'));

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonth(m)) out.push(m);
  return out;
}

export const incomeExpense = defineAction({
  name: 'finance.incomeExpense',
  readOnlySafe: true,
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z
    .object({ from: isoDate, to: isoDate })
    .refine((i) => i.from <= i.to, { path: ['to'], message: 'Bitiş başlangıçtan önce olamaz.' })
    .refine((i) => (Number(i.to.slice(0, 4)) - Number(i.from.slice(0, 4))) * 12 + Number(i.to.slice(5, 7)) - Number(i.from.slice(5, 7)) < 36, { path: ['to'], message: 'Aralık en fazla 36 ay olabilir.' }),
  run: async (ctx, i) => {
    const [invoices, movements] = await Promise.all([
      ctx.tx
        .select({ kind: finInvoices.kind, date: finInvoices.date, base: finInvoices.baseMinor })
        .from(finInvoices)
        .where(and(eq(finInvoices.status, 'recorded'), eq(finInvoices.currency, 'TRY'), gte(finInvoices.date, i.from), lte(finInvoices.date, i.to))),
      ctx.tx
        .select({ kind: finMovements.kind, date: finMovements.date, amount: finMovements.amountMinor, vat: finMovements.vatMinor, category: finMovements.category })
        .from(finMovements)
        .where(and(inArray(finMovements.kind, ['expense', 'income']), isNull(finMovements.reversedAt), eq(finMovements.currency, 'TRY'), gte(finMovements.date, i.from), lte(finMovements.date, i.to))),
    ]);
    const z0 = () => ({ revenue: 0n, purchases: 0n, expenses: 0n, otherIncome: 0n });
    const by = new Map(monthsBetween(i.from, i.to).map((m) => [m, z0()]));
    const cats = new Map<string, bigint>();
    for (const v of invoices) {
      const m = by.get(v.date.slice(0, 7))!;
      if (v.kind === 'sales') m.revenue += v.base;
      else if (v.kind === 'sales_return') m.revenue -= v.base;
      else if (v.kind === 'purchase') m.purchases += v.base;
      else m.purchases -= v.base;
    }
    for (const v of movements) {
      const m = by.get(v.date.slice(0, 7))!;
      const net = v.amount - v.vat;
      if (v.kind === 'expense') {
        m.expenses += net;
        cats.set(v.category || 'Diğer', (cats.get(v.category || 'Diğer') ?? 0n) + net);
      } else m.otherIncome += net;
    }
    const total = z0();
    const months = [...by].map(([month, m]) => {
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += m[k];
      return { month, revenue: tl(m.revenue), purchases: tl(m.purchases), expenses: tl(m.expenses), otherIncome: tl(m.otherIncome), result: tl(m.revenue + m.otherIncome - m.purchases - m.expenses), positive: m.revenue + m.otherIncome >= m.purchases + m.expenses };
    });
    const catTotal = [...cats.values()].reduce((a, b) => a + b, 0n);
    return {
      months,
      total: { revenue: tl(total.revenue), purchases: tl(total.purchases), expenses: tl(total.expenses), otherIncome: tl(total.otherIncome), result: tl(total.revenue + total.otherIncome - total.purchases - total.expenses) },
      expenseByCategory: [...cats]
        .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
        .map(([category, amount]) => ({ category, amount: tl(amount), share: catTotal > 0n ? Math.round(Number((amount * 1000n) / catTotal) / 10) : 0 })),
    };
  },
});

/**
 * Haftalık nakit akış tahmini (TL): bugünkü kasa+banka ile başlar; vadeli açık alacak/borçlar, portföydeki ve verilen çekler,
 * işlenmemiş tekrarlayan kayıtlar haftasına yazılır. Vadesi geçmiş (tahsil/ödeme bekleyen) kalemler ilk haftaya konur.
 */
export const cashForecast = defineAction({
  name: 'finance.cashForecast',
  readOnlySafe: true,
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ today: isoDate.optional(), weeks: z.number().int().min(4).max(26).default(13) }),
  run: async (ctx, i) => {
    const today = i.today ?? istanbulToday();
    const t0 = new Date(`${today}T00:00:00Z`);
    t0.setUTCDate(t0.getUTCDate() - ((t0.getUTCDay() + 6) % 7));
    const startMs = t0.getTime();
    const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
    const weekOf = (iso: string) => Math.max(0, Math.floor((day(iso) - startMs) / (7 * 86_400_000)));
    const ins = Array.from({ length: i.weeks }, () => 0n);
    const outs = Array.from({ length: i.weeks }, () => 0n);
    let overdueIn = 0n;
    let overdueOut = 0n;
    const add = (iso: string, amount: bigint, dir: 'in' | 'out') => {
      const w = weekOf(iso);
      if (w >= i.weeks) return;
      (dir === 'in' ? ins : outs)[w]! += amount;
      if (iso < today && dir === 'in') overdueIn += amount;
      if (iso < today && dir === 'out') overdueOut += amount;
    };

    const [map, alloc, accounts, balances, checks, recurring] = await Promise.all([
      ledgerEntries(ctx),
      allocations(ctx),
      ctx.tx.select().from(finAccounts).where(and(eq(finAccounts.archived, false), eq(finAccounts.currency, 'TRY'))),
      accountBalances(ctx),
      ctx.tx.select().from(finChecks).where(and(inArray(finChecks.status, ['portfolio', 'issued']), eq(finChecks.currency, 'TRY'))),
      ctx.tx.select().from(finRecurring).where(eq(finRecurring.active, true)),
    ]);
    let start = 0n;
    for (const a of accounts) start += a.openingMinor + (balances.get(a.id) ?? 0n);
    for (const [k, entries] of map) {
      if (!k.endsWith('|TRY')) continue;
      for (const it of openItems(entries, today, 'receivable', alloc)) add(it.due ?? it.date, it.open, 'in');
      for (const it of openItems(entries, today, 'payable', alloc)) add(it.due ?? it.date, it.open, 'out');
    }
    for (const c of checks) add(c.due, c.amountMinor, c.direction === 'received' ? 'in' : 'out');
    const tryAccounts = new Set(accounts.map((a) => a.id));
    for (const r of recurring) {
      if (!tryAccounts.has(r.accountId)) continue;
      let next = nextDue(r, today);
      while (next && weekOf(next.date) < i.weeks) {
        add(next.date, r.amountMinor, r.direction);
        next = nextDue({ ...r, lastPostedMonth: next.month }, today);
      }
    }
    let bal = start;
    const weeks = ins.map((inflow, w) => {
      const from = new Date(startMs + w * 7 * 86_400_000).toISOString().slice(0, 10);
      bal += inflow - outs[w]!;
      return { from, inflow: tl(inflow), outflow: tl(outs[w]!), balance: tl(bal), negative: bal < 0n, raw: bal };
    });
    const lowest = weeks.reduce((a, b) => (b.raw < a.raw ? b : a), weeks[0]!);
    return {
      today, start: tl(start), overdueIn: tl(overdueIn), overdueOut: tl(overdueOut),
      weeks: weeks.map((w) => ({ from: w.from, inflow: w.inflow, outflow: w.outflow, balance: w.balance, negative: w.negative })),
      lowest: { from: lowest.from, balance: lowest.balance, negative: lowest.negative },
    };
  },
});
