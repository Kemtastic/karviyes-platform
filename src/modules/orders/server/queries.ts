import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { parties, staff } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { money, moneyToJSON, type Currency } from '@/core/money';
import { DEPARTMENT_ROLES, type Role } from '@/core/modules/types';
import { getSector } from '@/sectors';
import { ORDER_STATUSES, orderPayments, orders } from '../db/schema';
import { orderBalance } from '../domain/totals';

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
        product: sector.describe(o.product), total: moneyToJSON(total), balance: moneyToJSON(orderBalance(total, own)), version: o.version,
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
    const balance = orderBalance(total, pays.map((p) => ({ kind: p.kind, amountMinor: p.amountMinor, currency: p.currency as Currency })));
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
