import { and, eq, inArray, isNotNull, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { istanbulDate, istanbulToday } from '@/core/dates';
import { parties } from '@/core/db/schema';
import type { Role } from '@/core/modules/types';
import { orderLines, orders } from '@/modules/orders/db/schema';
import { jobs } from '../db/schema';

export const STUCK_DAYS = 3;
export const FABRIC_WAIT_DAYS = 2;
export const DUE_SOON_DAYS = 3;

export type AlertKind = 'late' | 'due_soon' | 'stuck' | 'fabric_wait';
export type Alert = { kind: AlertKind; severity: 'danger' | 'warning'; href: string; title: string; detail: string; days: number; date: string };

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

type OrderRow = { id: string; no: string; partyName: string; deliveryDate: string; quantity: number; shipped: number };
type JobRow = { id: string; no: string; partyName: string; stage: string; fabricReserved: boolean; createdAt: string; updatedAt: string };

/** Uyarı kuralları (saf): teslim tarihi geçmiş/yaklaşan sevk edilmemiş sipariş, aynı aşamada bekleyen iş, kumaş bekleyen iş. */
export function classifyAlerts(ordersIn: OrderRow[], jobsIn: JobRow[], today: string, stageLabel: (s: string) => string = (s) => s): Alert[] {
  const out: Alert[] = [];
  for (const o of ordersIn) {
    if (o.shipped >= o.quantity) continue;
    const d = days(o.deliveryDate, today);
    const left = (o.quantity - o.shipped).toLocaleString('tr-TR');
    if (d > 0) out.push({ kind: 'late', severity: 'danger', href: `/siparisler/${o.id}`, title: `${o.partyName} · ${o.no}`, detail: `Teslim tarihi ${d} gün geçti; ${left} adet sevk edilmedi.`, days: d, date: o.deliveryDate });
    else if (-d <= DUE_SOON_DAYS) out.push({ kind: 'due_soon', severity: 'warning', href: `/siparisler/${o.id}`, title: `${o.partyName} · ${o.no}`, detail: d === 0 ? `Teslim bugün; ${left} adet bekliyor.` : `Teslime ${-d} gün kaldı; ${left} adet bekliyor.`, days: -d, date: o.deliveryDate });
  }
  for (const j of jobsIn) {
    if (j.stage === 'waiting' && !j.fabricReserved) {
      const d = days(j.createdAt, today);
      if (d >= FABRIC_WAIT_DAYS) out.push({ kind: 'fabric_wait', severity: 'warning', href: `/uretim/is/${j.id}`, title: `${j.partyName} · ${j.no}`, detail: `${d} gündür kumaş ayrılmayı bekliyor.`, days: d, date: j.createdAt });
      continue;
    }
    const d = days(j.updatedAt, today);
    if (d >= STUCK_DAYS) out.push({ kind: 'stuck', severity: d >= STUCK_DAYS * 2 ? 'danger' : 'warning', href: `/uretim/is/${j.id}`, title: `${j.partyName} · ${j.no}`, detail: `${d} gündür ${stageLabel(j.stage)} aşamasında; hareket yok.`, days: d, date: j.updatedAt });
  }
  const rank = { danger: 0, warning: 1 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.days - a.days);
}

const VIEW: Role[] = ['admin', 'tracking', 'sales'];

export const productionAlerts = defineAction({
  name: 'production.alerts',
  readOnlySafe: true,
  module: 'production',
  roles: VIEW,
  rateLimit: false,
  input: z.object({ today: z.string().date().optional() }),
  run: async (ctx, i) => {
    const today = i.today ?? istanbulToday();
    const { getSector } = await import('@/sectors');
    const sector = getSector(ctx.cfg.sector);
    const label = (s: string) => sector.stages.find((x) => x.id === s)?.label ?? (s === 'review' ? 'kontrol' : s === 'waiting' ? 'bekleme' : s);
    const openOrders = await ctx.tx
      .select({ id: orders.id, no: orders.no, partyName: parties.name, deliveryDate: orders.deliveryDate })
      .from(orders)
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .where(and(isNotNull(orders.deliveryDate), notInArray(orders.status, ['cancelled', 'invoiced'])));
    const ids = openOrders.map((o) => o.id);
    const lines = ids.length ? await ctx.tx.select({ orderId: orderLines.orderId, quantity: orderLines.quantity, shipped: orderLines.shippedQty, status: orderLines.status }).from(orderLines).where(inArray(orderLines.orderId, ids)) : [];
    const orderRows: OrderRow[] = openOrders.map((o) => {
      const mine = lines.filter((l) => l.orderId === o.id && l.status !== 'cancelled');
      return { id: o.id, no: o.no, partyName: o.partyName, deliveryDate: o.deliveryDate!, quantity: mine.reduce((s, l) => s + l.quantity, 0), shipped: mine.reduce((s, l) => s + l.shipped, 0) };
    });
    const activeJobs = await ctx.tx
      .select({ id: jobs.id, no: jobs.no, stage: jobs.stage, fabricReserved: jobs.fabricReserved, createdAt: jobs.createdAt, updatedAt: jobs.updatedAt, partyName: parties.name })
      .from(jobs)
      .innerJoin(orders, eq(orders.id, jobs.orderId))
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .where(notInArray(jobs.stage, ['completed', 'shipped', 'cancelled']));
    const jobRows: JobRow[] = activeJobs.map((j) => ({ ...j, createdAt: istanbulDate(j.createdAt), updatedAt: istanbulDate(j.updatedAt) }));
    return classifyAlerts(orderRows, jobRows, today, label);
  },
});
