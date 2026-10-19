import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { parties, staff } from '@/core/db/schema';
import { orderLines, orders } from '@/modules/orders/db/schema';
import { jobEvents, jobs } from '../db/schema';

export type ReportRow = { key: string; stage: string; jobs: number; good: number; cutWaste: number; printWaste: number; wasteKg: number };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// Bitirilen aşamalar üzerinden makine ve personel özeti. Fire, olayın kendi aşamasına göre sayılır:
// baskı aşamasında yalnızca baskı firesi, diğer aşamalarda yalnızca kesim firesi.
export const machineStaffReport = defineAction({
  name: 'production.report',
  readOnlySafe: true,
  module: 'production',
  roles: ['admin', 'tracking'],
  rateLimit: false,
  input: z.object({ from: z.string().date(), to: z.string().date() }),
  run: async (ctx, i) => {
    const events = await ctx.tx
      .select()
      .from(jobEvents)
      .where(and(eq(jobEvents.kind, 'finished'), gte(jobEvents.at, new Date(`${i.from}T00:00:00+03:00`)), lte(jobEvents.at, new Date(`${i.to}T23:59:59.999+03:00`))));
    const staffIds = [...new Set(events.flatMap((e) => e.staffIds))];
    const names = new Map((staffIds.length ? await ctx.tx.select({ id: staff.id, name: staff.name }).from(staff).where(inArray(staff.id, staffIds)) : []).map((s) => [s.id, s.name]));

    const byMachine = new Map<string, ReportRow & { jobIds: Set<string> }>();
    const byStaff = new Map<string, ReportRow & { jobIds: Set<string> }>();
    const add = (map: typeof byMachine, key: string, e: (typeof events)[number]) => {
      const id = `${key}|${e.stage}`;
      const row = map.get(id) ?? { key, stage: e.stage, jobs: 0, good: 0, cutWaste: 0, printWaste: 0, wasteKg: 0, jobIds: new Set<string>() };
      row.jobIds.add(e.jobId);
      row.good += num(e.data.good);
      if (e.stage === 'printing') row.printWaste += num(e.data.printWaste);
      else row.cutWaste += num(e.data.cutWaste);
      row.wasteKg += num(e.data.wasteKg);
      map.set(id, row);
    };
    for (const e of events) {
      if (e.machine) add(byMachine, e.machine, e);
      for (const s of e.staffIds) add(byStaff, names.get(s) ?? 'Bilinmeyen personel', e);
    }
    // İş özeti: son sağlam adet (en son bitirilen adet sayan aşama), kesim firesi adet, baskı firesi metre; fire oranı = kesim firesi / (sağlam + kesim firesi).
    const jobIds = [...new Set(events.map((e) => e.jobId))];
    const info = jobIds.length
      ? await ctx.tx
          .select({ id: jobs.id, no: jobs.no, target: orderLines.quantity, partyName: parties.name })
          .from(jobs)
          .innerJoin(orderLines, eq(orderLines.id, jobs.orderLineId))
          .innerJoin(orders, eq(orders.id, jobs.orderId))
          .innerJoin(parties, eq(parties.id, orders.partyId))
          .where(inArray(jobs.id, jobIds))
      : [];
    const byJob = info
      .map((j) => {
        const mine = events.filter((e) => e.jobId === j.id).sort((a, b) => a.at.getTime() - b.at.getTime());
        const goods = mine.filter((e) => e.stage !== 'printing' && e.stage !== 'slitting' && typeof e.data.good === 'number');
        const good = goods.length ? num(goods[goods.length - 1]!.data.good) : 0;
        const cutWaste = mine.filter((e) => e.stage !== 'printing').reduce((s, e) => s + num(e.data.cutWaste), 0);
        const printWaste = mine.filter((e) => e.stage === 'printing').reduce((s, e) => s + num(e.data.printWaste), 0);
        const wasteKg = Math.round(mine.reduce((s, e) => s + num(e.data.wasteKg), 0) * 100) / 100;
        const wasteRate = good + cutWaste > 0 ? ((cutWaste / (good + cutWaste)) * 100).toFixed(2) : '0.00';
        return { jobId: j.id, jobNo: j.no, partyName: j.partyName, target: j.target, good, cutWaste, printWaste, wasteKg, wasteRate };
      })
      .sort((a, b) => a.jobNo.localeCompare(b.jobNo));
    const finalize = (m: typeof byMachine): ReportRow[] =>
      [...m.values()].map(({ jobIds, ...r }) => ({ ...r, jobs: jobIds.size })).sort((a, b) => a.key.localeCompare(b.key, 'tr') || a.stage.localeCompare(b.stage));
    return { byMachine: finalize(byMachine), byStaff: finalize(byStaff), byJob };
  },
});
