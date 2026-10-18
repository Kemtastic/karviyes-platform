import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { parties, staff } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { CURRENCIES, money, moneyToJSON, type Currency } from '@/core/money';
import { DEPARTMENT_ROLES, type Role } from '@/core/modules/types';
import { getSector } from '@/sectors';
import { ORDER_STATUSES, orderPayments, orders } from '../db/schema';
import { orderBalance, receivableTotal } from '../domain/totals';

const OFFICE: Role[] = ['admin', 'sales', 'tracking'];

export { ORDER_STATUS_LABELS } from '../ui/status-labels';

export const listOrders = defineAction({
  name: 'orders.list',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({ status: z.enum(ORDER_STATUSES).optional(), partyId: z.string().uuid().optional() }),
  run: async (ctx, i) => {
    const rows = await ctx.tx
      .select({ o: orders, partyName: parties.name })
      .from(orders)
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .where(and(i.status ? eq(orders.status, i.status) : undefined, i.partyId ? eq(orders.partyId, i.partyId) : undefined))
      .orderBy(desc(orders.orderDate), desc(orders.no))
      .limit(500);
    const ids = rows.map((r) => r.o.id);
    const pays = ids.length ? await ctx.tx.select().from(orderPayments).where(inArray(orderPayments.orderId, ids)) : [];
    const sector = getSector(ctx.cfg.sector);
    return rows.map(({ o, partyName }) => {
      const total = money(o.totalMinor, o.currency as Currency);
      const own = pays.filter((p) => p.orderId === o.id).map((p) => ({ kind: p.kind, amountMinor: p.amountMinor, currency: p.currency as Currency }));
      return {
        id: o.id, no: o.no, orderDate: o.orderDate, partyName, status: o.status, quantity: o.quantity,
        product: sector.describe(o.product), total: moneyToJSON(total), balance: moneyToJSON(orderBalance(receivableTotal(o.status, total), own)), version: o.version,
      };
    });
  },
});

export const orderForOffice = defineAction({
  name: 'orders.office',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({ id: z.string().uuid() }),
  run: async (ctx, i) => {
    const [row] = await ctx.tx.select({ o: orders, party: parties }).from(orders).innerJoin(parties, eq(parties.id, orders.partyId)).where(eq(orders.id, i.id));
    if (!row) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı.');
    const { o, party } = row;
    const pays = await ctx.tx.select().from(orderPayments).where(eq(orderPayments.orderId, o.id)).orderBy(asc(orderPayments.createdAt));
    const [seller] = o.salespersonStaffId ? await ctx.tx.select({ name: staff.name }).from(staff).where(eq(staff.id, o.salespersonStaffId)) : [];
    const total = money(o.totalMinor, o.currency as Currency);
    const balance = orderBalance(receivableTotal(o.status, total), pays.map((p) => ({ kind: p.kind, amountMinor: p.amountMinor, currency: p.currency as Currency })));
    return {
      id: o.id, no: o.no, version: o.version, status: o.status, orderDate: o.orderDate,
      party: { id: party.id, name: party.name, phone: party.phone, city: party.city },
      salesperson: seller?.name ?? null, salespersonStaffId: o.salespersonStaffId,
      product: o.product, productText: getSector(ctx.cfg.sector).describe(o.product), quantity: o.quantity,
      unitPrice: o.unitPrice, vatRate: o.vatRate, currency: o.currency, fxRate: o.fxRate, fxRateDate: o.fxRateDate, fxSource: o.fxSource,
      total: moneyToJSON(total), balance: moneyToJSON(balance), packaging: o.packaging, departmentNotes: o.departmentNotes,
      invoiceMark: o.invoiceMark, producedQty: o.producedQty, shippedQty: o.shippedQty, cancelReason: o.cancelReason,
      payments: pays.map((p) => ({ id: p.id, kind: p.kind, amount: moneyToJSON(money(p.amountMinor, p.currency as Currency)), paidAt: p.paidAt, note: p.note, correctsPaymentId: p.correctsPaymentId })),
    };
  },
});

// Bölüm ekranları için: fiyat, tutar, ödeme ve bakiye içermez.
export const orderForWorkshop = defineAction({
  name: 'orders.workshop',
  module: 'orders',
  roles: [...OFFICE, ...DEPARTMENT_ROLES],
  rateLimit: false,
  input: z.object({ id: z.string().uuid() }),
  run: async (ctx, i) => {
    const [row] = await ctx.tx
      .select({ id: orders.id, no: orders.no, orderDate: orders.orderDate, product: orders.product, quantity: orders.quantity, packaging: orders.packaging, departmentNotes: orders.departmentNotes, status: orders.status, partyName: parties.name })
      .from(orders)
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .where(eq(orders.id, i.id));
    if (!row) throw new AppError('NOT_FOUND', 'Sipariş bulunamadı.');
    return row;
  },
});

export const listSalesStaff = defineAction({
  name: 'orders.salesStaff',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) => (await ctx.tx.select({ id: staff.id, name: staff.name, departments: staff.departments, active: staff.active }).from(staff)).filter((s) => s.active && s.departments.includes('sales')),
});

type AccountTotal = { currency: Currency; total: bigint; paid: bigint };

function accountTotalsJSON(map: Map<Currency, AccountTotal>) {
  return CURRENCIES.filter((c) => map.has(c)).map((c) => {
    const a = map.get(c)!;
    return { currency: c, total: moneyToJSON(money(a.total, c)), paid: moneyToJSON(money(a.paid, c)), balance: moneyToJSON(money(a.total - a.paid, c)) };
  });
}

// Müşterinin sipariş bazlı cari hesabı (fatura bazlı değil): siparişler ve para birimi başına toplamlar.
export const customerAccount = defineAction({
  name: 'orders.customerAccount',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({ partyId: z.string().uuid() }),
  run: async (ctx, i) => {
    const rows = await ctx.tx.select().from(orders).where(eq(orders.partyId, i.partyId)).orderBy(desc(orders.orderDate), desc(orders.no)).limit(1000);
    const ids = rows.map((o) => o.id);
    const pays = ids.length ? await ctx.tx.select().from(orderPayments).where(inArray(orderPayments.orderId, ids)) : [];
    const totals = new Map<Currency, AccountTotal>();
    const list = rows.map((o) => {
      const currency = o.currency as Currency;
      const total = receivableTotal(o.status, money(o.totalMinor, currency));
      const paid = pays.filter((p) => p.orderId === o.id).reduce((sum, p) => sum + p.amountMinor, 0n);
      const acc = totals.get(currency) ?? { currency, total: 0n, paid: 0n };
      acc.total += total.minor;
      acc.paid += paid;
      totals.set(currency, acc);
      return {
        id: o.id, no: o.no, orderDate: o.orderDate, status: o.status, quantity: o.quantity,
        total: moneyToJSON(money(o.totalMinor, currency)), paid: moneyToJSON(money(paid, currency)), balance: moneyToJSON(money(total.minor - paid, currency)),
      };
    });
    return { orders: list, totals: accountTotalsJSON(totals) };
  },
});

// Açık alacaklar: bakiyesi sıfırdan büyük müşteriler, para birimi başına (TL önce), büyükten küçüğe.
export const receivables = defineAction({
  name: 'orders.receivables',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) => {
    const totals = await ctx.tx
      .select({ partyId: orders.partyId, currency: orders.currency, total: sql<string>`coalesce(sum(case when ${orders.status} <> 'cancelled' then ${orders.totalMinor} else 0 end), 0)::text`, count: sql<number>`count(*)::int` })
      .from(orders)
      .groupBy(orders.partyId, orders.currency);
    const paid = await ctx.tx
      .select({ partyId: orders.partyId, currency: orderPayments.currency, paid: sql<string>`coalesce(sum(${orderPayments.amountMinor}), 0)::text` })
      .from(orderPayments)
      .innerJoin(orders, eq(orders.id, orderPayments.orderId))
      .groupBy(orders.partyId, orderPayments.currency);
    const paidOf = new Map(paid.map((p) => [`${p.partyId}:${p.currency}`, BigInt(p.paid)]));
    const open = totals
      .map((t) => ({ ...t, balance: BigInt(t.total) - (paidOf.get(`${t.partyId}:${t.currency}`) ?? 0n) }))
      .filter((t) => t.balance > 0n);
    const names = open.length ? await ctx.tx.select({ id: parties.id, name: parties.name, phone: parties.phone }).from(parties).where(inArray(parties.id, [...new Set(open.map((t) => t.partyId))])) : [];
    const nameOf = new Map(names.map((n) => [n.id, n]));
    return open
      .sort((a, b) => CURRENCIES.indexOf(a.currency as Currency) - CURRENCIES.indexOf(b.currency as Currency) || (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0))
      .map((t) => ({ partyId: t.partyId, partyName: nameOf.get(t.partyId)?.name ?? '', phone: nameOf.get(t.partyId)?.phone ?? '', currency: t.currency as Currency, orderCount: t.count, balance: moneyToJSON(money(t.balance, t.currency as Currency)) }));
  },
});
