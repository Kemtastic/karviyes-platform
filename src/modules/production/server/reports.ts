import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { staff } from '@/core/db/schema';
import { jobEvents } from '../db/schema';

export type ReportRow = { key: string; stage: string; jobs: number; good: number; cutWaste: number; printWaste: number };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// Bitirilen aşamalar üzerinden makine ve personel özeti. Fire, olayın kendi aşamasına göre sayılır:
// baskı aşamasında yalnızca baskı firesi, diğer aşamalarda yalnızca kesim firesi.
export const machineStaffReport = defineAction({
  name: 'production.report',
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
      const row = map.get(id) ?? { key, stage: e.stage, jobs: 0, good: 0, cutWaste: 0, printWaste: 0, jobIds: new Set<string>() };
      row.jobIds.add(e.jobId);
      row.good += num(e.data.good);
      if (e.stage === 'printing') row.printWaste += num(e.data.printWaste);
      else row.cutWaste += num(e.data.cutWaste);
      map.set(id, row);
    };
    for (const e of events) {
      if (e.machine) add(byMachine, e.machine, e);
      for (const s of e.staffIds) add(byStaff, names.get(s) ?? 'Bilinmeyen personel', e);
    }
    const finalize = (m: typeof byMachine): ReportRow[] =>
      [...m.values()].map(({ jobIds, ...r }) => ({ ...r, jobs: jobIds.size })).sort((a, b) => a.key.localeCompare(b.key, 'tr') || a.stage.localeCompare(b.stage));
    return { byMachine: finalize(byMachine), byStaff: finalize(byStaff) };
  },
});
