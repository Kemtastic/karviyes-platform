import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction, type ActionCtx } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { parties } from '@/core/db/schema';
import { CURRENCIES, type Currency } from '@/core/money';
import { finAccounts, finAllocations, finChecks, finInvoices, finMovements, finOpenings } from '../db/schema';
import { aging, INVOICE_KIND_LABELS, openItems, statement, type Aging, type LedgerEntry, type OpenItem } from '../domain/ledger';
import { openOrdersOf } from '@/modules/orders/server/api';
import { FIN, lockedUntil } from './actions';

const s = (v: bigint) => v.toString();
const isoDate = z.string().date();

type Key = `${string}|${Currency}`;

/** Carilerin defter kayıtları (açılış, fatura, para hareketi) cari × para birimi başına. */
/** external: karşı tarafa giden ekstre (mutabakat) — personelin iç notları yazılmaz. */
/** Geçerli eşleştirmeler (iptal edilmemiş hareket, kayıtlı fatura): fatura id → eşleşen tutar. */
export async function allocations(ctx: ActionCtx): Promise<Map<string, bigint>> {
  const rows = await ctx.tx
    .select({ invoiceId: finAllocations.invoiceId, sum: sql<string>`sum(${finAllocations.amountMinor})` })
    .from(finAllocations)
    .innerJoin(finMovements, eq(finMovements.id, finAllocations.movementId))
    .innerJoin(finInvoices, eq(finInvoices.id, finAllocations.invoiceId))
    .where(and(isNull(finMovements.reversedAt), eq(finInvoices.status, 'recorded')))
    .groupBy(finAllocations.invoiceId);
  return new Map(rows.map((r) => [r.invoiceId, BigInt(r.sum)]));
}

export async function ledgerEntries(ctx: ActionCtx, partyId?: string, external = false): Promise<Map<Key, LedgerEntry[]>> {
  const [openings, invoices, moves] = await Promise.all([
    ctx.tx.select().from(finOpenings).where(partyId ? eq(finOpenings.partyId, partyId) : undefined),
    ctx.tx.select().from(finInvoices).where(and(eq(finInvoices.status, 'recorded'), partyId ? eq(finInvoices.partyId, partyId) : undefined)),
    ctx.tx
      .select()
      .from(finMovements)
      .where(and(isNull(finMovements.reversedAt), partyId ? eq(finMovements.partyId, partyId) : sql`${finMovements.partyId} is not null`)),
  ]);
  const map = new Map<Key, LedgerEntry[]>();
  const push = (p: string, c: string, e: LedgerEntry) => {
    const k = `${p}|${c as Currency}` as Key;
    map.set(k, [...(map.get(k) ?? []), e]);
  };
  for (const o of openings) push(o.partyId, o.currency, { id: `acilis-${o.currency}`, kind: 'opening', amount: o.amountMinor, date: o.date, due: null, text: 'Açılış bakiyesi' });
  for (const f of invoices)
    push(f.partyId, f.currency, { id: f.id, kind: f.kind, amount: f.totalMinor, date: f.date, due: f.due, text: `${INVOICE_KIND_LABELS[f.kind]} ${f.docNo}` });
  for (const m of moves) {
    const note = external ? '' : m.note;
    const label = m.kind === 'check' ? (external ? (m.note.split(' · ')[0] ?? 'Çek') : m.note) : m.kind === 'collection' ? `Tahsilat${note ? ` · ${note}` : ''}` : `Ödeme${note ? ` · ${note}` : ''}`;
    // Karşılıksız/geri dönen çekin doğurduğu borç dönüş gününden itibaren vadesi gelmiş sayılır.
    push(m.partyId!, m.currency, { id: m.id, kind: m.direction, amount: m.amountMinor, date: m.date, due: m.kind === 'check' && m.direction === 'out' ? m.date : null, text: label });
  }
  return map;
}

type AgingJson = Record<keyof Aging, string | number>;
const agingJson = (a: Aging): AgingJson => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === 'bigint' ? s(v) : v])) as AgingJson;
const itemJson = (i: OpenItem) => ({ ...i, total: s(i.total), open: s(i.open) });

/** Cari bakiyeleri: her cari × para birimi için bakiye, alacak ve borç yaşlandırması. */
export const partyBalances = defineAction({
  name: 'finance.partyBalances',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ today: isoDate.optional() }),
  run: async (ctx, i) => {
    const today = i.today ?? istanbulToday();
    const [map, alloc] = await Promise.all([ledgerEntries(ctx), allocations(ctx)]);
    const ids = [...new Set([...map.keys()].map((k) => k.split('|')[0]!))];
    const names = ids.length ? await ctx.tx.select({ id: parties.id, name: parties.name, kind: parties.kind, phone: parties.phone }).from(parties).where(inArray(parties.id, ids)) : [];
    const nameOf = new Map(names.map((n) => [n.id, n]));
    return [...map.entries()]
      .map(([k, entries]) => {
        const [partyId, cur] = k.split('|') as [string, Currency];
        const balance = statement(entries).balance;
        const p = nameOf.get(partyId);
        return {
          partyId, partyName: p?.name ?? '', kind: p?.kind ?? 'customer', phone: p?.phone ?? '', currency: cur, balance: s(balance),
          receivable: agingJson(aging(openItems(entries, today, 'receivable', alloc))),
          payable: agingJson(aging(openItems(entries, today, 'payable', alloc))),
          lastDate: entries.reduce((m, e) => (e.date > m ? e.date : m), ''),
        };
      })
      .filter((r) => r.balance !== '0' || r.lastDate)
      .sort((a, b) => a.partyName.localeCompare(b.partyName, 'tr') || a.currency.localeCompare(b.currency));
  },
});

/** Cari ekstresi (para birimi başına) ve açık kalemler. */
export const partyLedger = defineAction({
  name: 'finance.partyLedger',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ partyId: z.string().uuid(), from: isoDate.optional(), today: isoDate.optional() }),
  run: async (ctx, i) => {
    const today = i.today ?? istanbulToday();
    const [map, alloc] = await Promise.all([ledgerEntries(ctx, i.partyId), allocations(ctx)]);
    const [openings] = await Promise.all([ctx.tx.select().from(finOpenings).where(eq(finOpenings.partyId, i.partyId))]);
    return {
      openings: openings.map((o) => ({ currency: o.currency as Currency, amount: s(o.amountMinor), date: o.date })),
      currencies: [...map.entries()].map(([k, entries]) => {
        const cur = k.split('|')[1] as Currency;
        const st = statement(entries, i.from);
        return {
          currency: cur,
          carried: s(st.carried),
          balance: s(st.balance),
          rows: st.rows.map((r) => ({ id: r.id, date: r.date, due: r.due, kind: r.kind, text: r.text, debit: s(r.debit), credit: s(r.credit), balance: s(r.balance) })),
          receivable: openItems(entries, today, 'receivable', alloc).map(itemJson),
          payable: openItems(entries, today, 'payable', alloc).map(itemJson),
        };
      }),
    };
  },
});

export async function accountBalances(ctx: ActionCtx) {
  const rows = await ctx.tx
    .select({ accountId: finMovements.accountId, direction: finMovements.direction, total: sql<string>`sum(${finMovements.amountMinor})` })
    .from(finMovements)
    .where(and(isNull(finMovements.reversedAt), sql`${finMovements.accountId} is not null`))
    .groupBy(finMovements.accountId, finMovements.direction);
  const map = new Map<string, bigint>();
  for (const r of rows) map.set(r.accountId!, (map.get(r.accountId!) ?? 0n) + (r.direction === 'in' ? 1n : -1n) * BigInt(r.total));
  return map;
}

export const accountsList = defineAction({
  name: 'finance.accounts',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ includeArchived: z.boolean().default(false) }),
  run: async (ctx, i) => {
    const [accounts, moves] = await Promise.all([
      ctx.tx.select().from(finAccounts).where(i.includeArchived ? undefined : eq(finAccounts.archived, false)).orderBy(asc(finAccounts.kind), asc(finAccounts.name)),
      accountBalances(ctx),
    ]);
    return accounts.map((a) => ({
      id: a.id, kind: a.kind, name: a.name, currency: a.currency as Currency, bank: a.bank, iban: a.iban, archived: a.archived, version: a.version,
      opening: s(a.openingMinor), openingDate: a.openingDate, balance: s(a.openingMinor + (moves.get(a.id) ?? 0n)),
    }));
  },
});

/** Kasa/banka ekstresi: açılıştan itibaren yürüyen bakiye. */
export const accountStatement = defineAction({
  name: 'finance.accountStatement',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ id: z.string().uuid(), from: isoDate.optional() }),
  run: async (ctx, i) => {
    const [a] = await ctx.tx.select().from(finAccounts).where(eq(finAccounts.id, i.id));
    if (!a) return null;
    const moves = await ctx.tx
      .select({ m: finMovements, partyName: parties.name })
      .from(finMovements)
      .leftJoin(parties, eq(parties.id, finMovements.partyId))
      .where(eq(finMovements.accountId, i.id))
      .orderBy(asc(finMovements.date), asc(finMovements.createdAt));
    let balance = a.openingMinor;
    let carried = a.openingMinor;
    const rows = [];
    for (const { m, partyName } of moves) {
      const delta = m.reversedAt ? 0n : (m.direction === 'in' ? 1n : -1n) * m.amountMinor;
      balance += delta;
      if (i.from && m.date < i.from) {
        carried = balance;
        continue;
      }
      rows.push({
        id: m.id, date: m.date, kind: m.kind, direction: m.direction, partyId: m.partyId, partyName, category: m.category, note: m.note,
        amount: s(m.amountMinor), balance: s(balance), reversed: Boolean(m.reversedAt), reverseReason: m.reverseReason, transfer: Boolean(m.transferGroup), check: Boolean(m.checkId),
      });
    }
    return { account: { id: a.id, name: a.name, kind: a.kind, currency: a.currency as Currency, bank: a.bank, iban: a.iban, opening: s(a.openingMinor), openingDate: a.openingDate }, carried: s(carried), balance: s(balance), rows: rows.reverse() };
  },
});

export const invoicesList = defineAction({
  name: 'finance.invoices',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ kind: z.enum(['sales', 'purchase', 'sales_return', 'purchase_return']).optional(), from: isoDate.optional(), to: isoDate.optional(), status: z.enum(['recorded', 'cancelled']).optional() }),
  run: async (ctx, i) => {
    const rows = await ctx.tx
      .select({ f: finInvoices, partyName: parties.name })
      .from(finInvoices)
      .innerJoin(parties, eq(parties.id, finInvoices.partyId))
      .where(and(i.kind ? eq(finInvoices.kind, i.kind) : undefined, i.from ? gte(finInvoices.date, i.from) : undefined, i.to ? lte(finInvoices.date, i.to) : undefined, i.status ? eq(finInvoices.status, i.status) : undefined))
      .orderBy(desc(finInvoices.date), desc(finInvoices.createdAt))
      .limit(1000);
    return rows.map(({ f, partyName }) => ({
      id: f.id, kind: f.kind, partyId: f.partyId, partyName, docNo: f.docNo, date: f.date, due: f.due, currency: f.currency as Currency,
      base: s(f.baseMinor), vat: s(f.vatMinor), withholding: s(f.withholdingMinor), total: s(f.totalMinor), rates: f.rates, fxRate: f.fxRate, fxRateDate: f.fxRateDate, note: f.note, status: f.status, cancelNote: f.cancelNote,
    }));
  },
});

export const movementsList = defineAction({
  name: 'finance.movements',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ kind: z.enum(['collection', 'payment', 'expense', 'income', 'transfer', 'check']).optional(), from: isoDate.optional(), to: isoDate.optional() }),
  run: async (ctx, i) => {
    const rows = await ctx.tx
      .select({ m: finMovements, partyName: parties.name, accountName: finAccounts.name })
      .from(finMovements)
      .leftJoin(parties, eq(parties.id, finMovements.partyId))
      .leftJoin(finAccounts, eq(finAccounts.id, finMovements.accountId))
      .where(and(i.kind ? eq(finMovements.kind, i.kind) : undefined, i.from ? gte(finMovements.date, i.from) : undefined, i.to ? lte(finMovements.date, i.to) : undefined))
      .orderBy(desc(finMovements.date), desc(finMovements.createdAt))
      .limit(1000);
    return rows.map(({ m, partyName, accountName }) => ({
      id: m.id, kind: m.kind, direction: m.direction, partyId: m.partyId, partyName, accountName, amount: s(m.amountMinor), vat: s(m.vatMinor), currency: m.currency as Currency,
      date: m.date, category: m.category, note: m.note, reversed: Boolean(m.reversedAt), reverseReason: m.reverseReason, check: Boolean(m.checkId), transfer: Boolean(m.transferGroup),
    }));
  },
});

export const checksList = defineAction({
  name: 'finance.checks',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ status: z.enum(['open', 'closed', 'all']).default('open') }),
  run: async (ctx, i) => {
    const open = ['portfolio', 'issued'] as const;
    const rows = await ctx.tx
      .select({ c: finChecks, partyName: parties.name })
      .from(finChecks)
      .innerJoin(parties, eq(parties.id, finChecks.partyId))
      .where(i.status === 'open' ? inArray(finChecks.status, [...open]) : i.status === 'closed' ? sql`${finChecks.status} not in ('portfolio', 'issued')` : undefined)
      .orderBy(asc(finChecks.due))
      .limit(1000);
    const endorsedIds = rows.map((r) => r.c.endorsedPartyId).filter((x): x is string => Boolean(x));
    const endorsed = endorsedIds.length ? await ctx.tx.select({ id: parties.id, name: parties.name }).from(parties).where(inArray(parties.id, endorsedIds)) : [];
    const nameOf = new Map(endorsed.map((p) => [p.id, p.name]));
    return rows.map(({ c, partyName }) => ({
      id: c.id, version: c.version, direction: c.direction, partyId: c.partyId, partyName, checkNo: c.checkNo, bank: c.bank, date: c.date, due: c.due,
      amount: s(c.amountMinor), currency: c.currency as Currency, status: c.status, note: c.note, endorsedTo: c.endorsedPartyId ? (nameOf.get(c.endorsedPartyId) ?? '') : null,
    }));
  },
});

/** Muhasebe özeti: para birimi başına alacak, borç, gecikmiş tutarlar, kasa/banka, çekler; önümüzdeki 30 günün ödeme takvimi. */
export const financeOverview = defineAction({
  name: 'finance.overview',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ today: isoDate.optional() }),
  run: async (ctx, i) => {
    const today = i.today ?? istanbulToday();
    const horizon = new Date(`${today}T12:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + 30);
    const until = horizon.toISOString().slice(0, 10);
    const [map, accounts, balances, checks, alloc] = await Promise.all([
      ledgerEntries(ctx),
      ctx.tx.select().from(finAccounts).where(eq(finAccounts.archived, false)),
      accountBalances(ctx),
      ctx.tx.select({ c: finChecks, partyName: parties.name }).from(finChecks).innerJoin(parties, eq(parties.id, finChecks.partyId)).where(inArray(finChecks.status, ['portfolio', 'issued'])),
      allocations(ctx),
    ]);
    const z0 = () => ({ receivable: 0n, overdueReceivable: 0n, payable: 0n, overduePayable: 0n, cash: 0n, bank: 0n, checksIn: 0n, checksOut: 0n });
    const per = new Map<Currency, ReturnType<typeof z0>>();
    const get = (c: Currency) => per.get(c) ?? (per.set(c, z0()), per.get(c)!);
    const ids = [...new Set([...map.keys()].map((k) => k.split('|')[0]!))];
    const names = ids.length ? await ctx.tx.select({ id: parties.id, name: parties.name }).from(parties).where(inArray(parties.id, ids)) : [];
    const nameOf = new Map(names.map((n) => [n.id, n.name]));
    type Event = { date: string; kind: 'receivable' | 'payable' | 'check_in' | 'check_out'; partyId: string; partyName: string; text: string; amount: string; currency: Currency; overdue: boolean };
    const events: Event[] = [];
    for (const [k, entries] of map) {
      const [partyId, cur] = k.split('|') as [string, Currency];
      const t = get(cur);
      for (const side of ['receivable', 'payable'] as const) {
        const items = openItems(entries, today, side, alloc);
        const a = aging(items);
        if (side === 'receivable') { t.receivable += a.total; t.overdueReceivable += a.overdue; } else { t.payable += a.total; t.overduePayable += a.overdue; }
        for (const it of items) {
          if (it.due && it.due <= until) events.push({ date: it.due, kind: side, partyId, partyName: nameOf.get(partyId) ?? '', text: it.text, amount: s(it.open), currency: cur, overdue: it.due < today });
        }
      }
    }
    for (const a of accounts) {
      const t = get(a.currency as Currency);
      const b = a.openingMinor + (balances.get(a.id) ?? 0n);
      if (a.kind === 'cash') t.cash += b; else t.bank += b;
    }
    for (const { c, partyName } of checks) {
      const t = get(c.currency as Currency);
      if (c.direction === 'received') t.checksIn += c.amountMinor; else t.checksOut += c.amountMinor;
      if (c.due <= until) events.push({ date: c.due, kind: c.direction === 'received' ? 'check_in' : 'check_out', partyId: c.partyId, partyName, text: `Çek ${c.bank} ${c.checkNo}`, amount: s(c.amountMinor), currency: c.currency as Currency, overdue: c.due < today });
    }
    const totals = CURRENCIES.filter((c) => per.has(c)).map((c) => ({ currency: c, ...Object.fromEntries(Object.entries(per.get(c)!).map(([k, v]) => [k, s(v)])) })) as ({ currency: Currency } & Record<keyof ReturnType<typeof z0>, string>)[];
    return { today, until, totals, calendar: events.sort((a, b) => a.date.localeCompare(b.date) || a.partyName.localeCompare(b.partyName, 'tr')).slice(0, 200), accounts: accounts.length };
  },
});

/** Seçim kutuları için açık hesaplar. */
export const accountOptions = defineAction({
  name: 'finance.accountOptions',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) => ctx.tx.select({ id: finAccounts.id, name: finAccounts.name, kind: finAccounts.kind, currency: finAccounts.currency }).from(finAccounts).where(eq(finAccounts.archived, false)).orderBy(asc(finAccounts.name)),
});

/** Tahsilat penceresi için carinin bakiyesi kalan siparişleri (sipariş modülü açıksa). */
export const partyOpenOrders = defineAction({
  name: 'finance.partyOpenOrders',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ partyId: z.string().uuid() }),
  run: async (ctx, i) => (ctx.cfg.modules.includes('orders') ? openOrdersOf(ctx, i.partyId) : []),
});

/**
 * Aylık KDV özeti (bilgi amaçlı; beyan mali müşavirce hazırlanır). KDV tam tutarıyla, tevkifat ayrı gösterilir:
 * - hesaplanan: satış faturası KDV'si − satış iadesi KDV'si (tevkifatlı satışta tevkif edilen kısım alıcının 2 No'lu beyanındadır)
 * - indirilecek: alış faturası KDV'si − alış iadesi KDV'si + belgeli masraf KDV'si
 * - sorumlu sıfatıyla (2 No'lu): tevkifatlı alışlarda tevkif edilen KDV
 */
export const vatSummary = defineAction({
  name: 'finance.vatSummary',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }),
  run: async (ctx, i) => {
    const from = `${i.month}-01`;
    const end = new Date(`${from}T12:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    const to = end.toISOString().slice(0, 10);
    const [inv, exp, rateRows] = await Promise.all([
      ctx.tx
        .select({ kind: finInvoices.kind, currency: finInvoices.currency, base: sql<string>`sum(${finInvoices.baseMinor})`, vat: sql<string>`sum(${finInvoices.vatMinor})`, wh: sql<string>`sum(${finInvoices.withholdingMinor})`, n: sql<number>`count(*)` })
        .from(finInvoices)
        .where(and(eq(finInvoices.status, 'recorded'), gte(finInvoices.date, from), lte(finInvoices.date, to)))
        .groupBy(finInvoices.kind, finInvoices.currency),
      ctx.tx
        .select({ currency: finMovements.currency, vat: sql<string>`sum(${finMovements.vatMinor})` })
        .from(finMovements)
        .where(and(eq(finMovements.kind, 'expense'), isNull(finMovements.reversedAt), gte(finMovements.date, from), lte(finMovements.date, to)))
        .groupBy(finMovements.currency),
      ctx.tx
        .select({ kind: finInvoices.kind, currency: finInvoices.currency, rates: finInvoices.rates, base: finInvoices.baseMinor, vat: finInvoices.vatMinor })
        .from(finInvoices)
        .where(and(eq(finInvoices.status, 'recorded'), gte(finInvoices.date, from), lte(finInvoices.date, to))),
    ]);
    // Oran kırılımı (eski kayıtlarda kırılım yoksa oran KDV/matrahtan çıkarılır).
    const byRate = new Map<string, { side: 'sales' | 'purchase'; currency: Currency; rate: string; base: bigint; vat: bigint }>();
    for (const r of rateRows) {
      const side = r.kind.startsWith('sales') ? 'sales' : 'purchase';
      const sign = r.kind.endsWith('_return') ? -1n : 1n;
      const parts = r.rates.length ? r.rates : [{ rate: r.base > 0n ? String(Math.round(Number((r.vat * 10000n) / r.base)) / 100) : '0', base: r.base.toString(), vat: r.vat.toString() }];
      for (const p of parts) {
        const key = `${r.currency}|${side}|${p.rate}`;
        const g = byRate.get(key) ?? { side, currency: r.currency as Currency, rate: p.rate, base: 0n, vat: 0n };
        g.base += sign * BigInt(p.base);
        g.vat += sign * BigInt(p.vat);
        byRate.set(key, g);
      }
    }
    const z0 = () => ({ salesBase: 0n, salesVat: 0n, salesWithholding: 0n, purchaseBase: 0n, purchaseVat: 0n, purchaseWithholding: 0n, expenseVat: 0n, invoices: 0 });
    const per = new Map<Currency, ReturnType<typeof z0>>();
    const get = (c: Currency) => per.get(c) ?? (per.set(c, z0()), per.get(c)!);
    for (const r of inv) {
      const t = get(r.currency as Currency);
      const sign = r.kind.endsWith('_return') ? -1n : 1n;
      t.invoices += Number(r.n);
      if (r.kind.startsWith('sales')) { t.salesBase += sign * BigInt(r.base); t.salesVat += sign * BigInt(r.vat); t.salesWithholding += sign * BigInt(r.wh); }
      else { t.purchaseBase += sign * BigInt(r.base); t.purchaseVat += sign * BigInt(r.vat); t.purchaseWithholding += sign * BigInt(r.wh); }
    }
    for (const r of exp) get(r.currency as Currency).expenseVat += BigInt(r.vat);
    return {
      month: i.month, from, to,
      rows: CURRENCIES.filter((c) => per.has(c)).map((c) => {
        const t = per.get(c)!;
        const deductible = t.purchaseVat + t.expenseVat;
        return {
          currency: c, invoices: t.invoices,
          salesBase: s(t.salesBase), output: s(t.salesVat), salesWithholding: s(t.salesWithholding),
          purchaseBase: s(t.purchaseBase), purchaseVat: s(t.purchaseVat), expenseVat: s(t.expenseVat), deductible: s(deductible), responsible: s(t.purchaseWithholding),
          difference: s(t.salesVat - deductible),
          byRate: [...byRate.values()]
            .filter((g) => g.currency === c)
            .sort((a, b) => a.side.localeCompare(b.side) || Number(b.rate) - Number(a.rate))
            .map((g) => ({ side: g.side, rate: g.rate, base: s(g.base), vat: s(g.vat) })),
        };
      }),
    };
  },
});

export const periodLock = defineAction({
  name: 'finance.periodLock',
  module: 'finance',
  roles: FIN,
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) => ({ lockedUntil: await lockedUntil(ctx) }),
});
