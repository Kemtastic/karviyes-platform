import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { parties, staff } from '@/core/db/schema';
import { CURRENCIES, money, moneyToJSON, mulPrice, type Currency } from '@/core/money';
import type { Role } from '@/core/modules/types';
import { getSector } from '@/sectors';
import { orderLines, orders } from '../db/schema';

const OFFICE: Role[] = ['admin', 'sales', 'tracking'];
export const REPORT_GROUPS = ['salesperson', 'customer', 'month', 'product'] as const;

type Acc = { key: string; label: string; currency: Currency; orderIds: Set<string>; quantity: number; net: bigint; total: bigint; priceQty: number; lastDate: string; lastUnitPrice: string };

// Sipariş satırlarından satış raporu (iptal edilen sipariş ve satırlar hariç). Fatura bazlı değildir.
// KDV hariç tutar satır bazında birim fiyat × adet (kuruşa yuvarlanmış); KDV = satır tutarı − KDV hariç.
export const salesReport = defineAction({
  name: 'orders.salesReport',
  module: 'orders',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({ from: z.string().date(), to: z.string().date(), groupBy: z.enum(REPORT_GROUPS) }),
  run: async (ctx, i) => {
    const sector = getSector(ctx.cfg.sector);
    const rows = await ctx.tx
      .select({ line: orderLines, orderId: orders.id, orderDate: orders.orderDate, currency: orders.currency, partyId: parties.id, partyName: parties.name, staffId: orders.salespersonStaffId })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .where(and(gte(orders.orderDate, i.from), lte(orders.orderDate, i.to), ne(orders.status, 'cancelled'), ne(orderLines.status, 'cancelled')));
    const staffIds = [...new Set(rows.map((r) => r.staffId).filter((x): x is string => Boolean(x)))];
    const names = staffIds.length ? new Map((await ctx.tx.select({ id: staff.id, name: staff.name }).from(staff).where(inArray(staff.id, staffIds))).map((s) => [s.id, s.name])) : new Map<string, string>();
    const groups = new Map<string, Acc>();
    for (const r of rows) {
      const currency = r.currency as Currency;
      let key: string;
      let label: string;
      if (i.groupBy === 'salesperson') [key, label] = [r.staffId ?? '-', r.staffId ? (names.get(r.staffId) ?? '?') : 'Atanmamış'];
      else if (i.groupBy === 'customer') [key, label] = [r.partyId, r.partyName];
      else if (i.groupBy === 'month') [key, label] = [r.orderDate.slice(0, 7), r.orderDate.slice(0, 7)];
      else {
        const p = sector.validateProduct(r.line.product);
        label = sector.analysisKey?.(p) ?? sector.describe(p);
        key = label;
      }
      const id = `${key}|${currency}`;
      const g = groups.get(id) ?? { key, label, currency, orderIds: new Set(), quantity: 0, net: 0n, total: 0n, priceQty: 0, lastDate: '', lastUnitPrice: '' };
      g.orderIds.add(r.orderId);
      g.quantity += r.line.quantity;
      g.net += mulPrice(r.line.unitPrice, r.line.quantity);
      g.total += r.line.totalMinor;
      g.priceQty += Number(r.line.unitPrice) * r.line.quantity;
      if (r.orderDate >= g.lastDate) [g.lastDate, g.lastUnitPrice] = [r.orderDate, r.line.unitPrice];
      groups.set(id, g);
    }
    const out = [...groups.values()].sort(
      (a, b) => CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency) || (i.groupBy === 'month' ? a.label.localeCompare(b.label) : b.total > a.total ? 1 : b.total < a.total ? -1 : a.label.localeCompare(b.label, 'tr')),
    );
    return {
      rows: out.map((g) => ({
        key: g.key, label: g.label, currency: g.currency, orders: g.orderIds.size, quantity: g.quantity,
        net: moneyToJSON(money(g.net, g.currency)), vat: moneyToJSON(money(g.total - g.net, g.currency)), total: moneyToJSON(money(g.total, g.currency)),
        avgUnitPrice: g.quantity ? (g.priceQty / g.quantity).toFixed(4) : '0.0000', lastUnitPrice: g.lastUnitPrice,
      })),
    };
  },
});
