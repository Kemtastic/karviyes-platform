import { and, eq, gte, lte, ne } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { parties } from '@/core/db/schema';
import { mulPrice, type Currency } from '@/core/money';
import type { Role } from '@/core/modules/types';
import { orderLines, orders } from '@/modules/orders/db/schema';
import { getSector } from '@/sectors';
import { jobs } from '../db/schema';

const VIEW: Role[] = ['admin', 'tracking', 'accounting'];
const DONE = ['completed', 'shipped'];

type Group = { currency: Currency; key: string; lines: number; quantity: number; rolls: number; sales: bigint };

/**
 * Üretim içgörüleri (seçilen sipariş tarihi aralığı): bobin durumu, sevk bekleyen mamul ve değeri,
 * ürün ölçüsü başına bobin başı satış. Tutarlar KDV, klişe ve nakliye hariçtir.
 */
export const productionInsights = defineAction({
  name: 'production.insights',
  readOnlySafe: true,
  module: 'production',
  roles: VIEW,
  rateLimit: false,
  input: z.object({ from: z.string().date(), to: z.string().date() }),
  run: async (ctx, i) => {
    const sector = getSector(ctx.cfg.sector);
    const rows = await ctx.tx
      .select({ line: orderLines, currency: orders.currency, orderNo: orders.no, partyName: parties.name, job: jobs })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .leftJoin(jobs, eq(jobs.orderLineId, orderLines.id))
      .where(and(ne(orderLines.status, 'cancelled'), ne(orders.status, 'cancelled'), gte(orders.orderDate, i.from), lte(orders.orderDate, i.to)));

    const rolls = { pending: 0, production: 0, done: 0 };
    let goodDone = 0;
    const groups = new Map<string, Group>();
    for (const r of rows) {
      const p = r.line.product as Record<string, unknown>;
      const fabric = sector.materials(p, r.line.quantity).filter((m) => m.kind === 'fabric').reduce((s, m) => s + m.rolls, 0);
      const stage = r.job?.stage;
      if (!stage || stage === 'waiting') rolls.pending += fabric;
      else if (DONE.includes(stage)) {
        rolls.done += fabric;
        goodDone += r.job!.producedQty;
      } else rolls.production += fabric;

      const key = sector.analysisKey?.(p) ?? sector.describe(p);
      const id = `${r.currency}|${key}`;
      const g = groups.get(id) ?? { currency: r.currency as Currency, key, lines: 0, quantity: 0, rolls: 0, sales: 0n };
      g.lines += 1;
      g.quantity += r.line.quantity;
      g.rolls += fabric;
      g.sales += mulPrice(r.line.unitPrice, r.line.quantity);
      groups.set(id, g);
    }

    // Sevk bekleyen mamul: üretilen − sevk edilen (tarih aralığından bağımsız, bugünkü durum).
    const stockRows = await ctx.tx
      .select({ job: jobs, unitPrice: orderLines.unitPrice, product: orderLines.product, currency: orders.currency, partyName: parties.name })
      .from(jobs)
      .innerJoin(orderLines, eq(orderLines.id, jobs.orderLineId))
      .innerJoin(orders, eq(orders.id, jobs.orderId))
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .where(ne(jobs.stage, 'cancelled'));
    const stock = stockRows
      .filter((s) => s.job.producedQty > s.job.shippedQty)
      .map((s) => {
        const qty = s.job.producedQty - s.job.shippedQty;
        return { jobId: s.job.id, jobNo: s.job.no, partyName: s.partyName, product: sector.describe(s.product as Record<string, unknown>), qty, currency: s.currency as Currency, value: mulPrice(s.unitPrice, qty).toString() };
      })
      .sort((a, b) => b.qty - a.qty);

    return {
      rolls,
      goodDone,
      stock,
      specs: [...groups.values()]
        .map((g) => ({ ...g, sales: g.sales.toString(), perRoll: g.rolls > 0 ? ((g.sales * 100n) / BigInt(Math.round(g.rolls * 100))).toString() : null }))
        .sort((a, b) => Number(BigInt(b.sales) - BigInt(a.sales))),
    };
  },
});
