import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { parties, staff } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import type { Role } from '@/core/modules/types';
import { orders } from '@/modules/orders/db/schema';
import { getSector } from '@/sectors';
import { fabricRolls, jobEvents, jobs, shipments } from '../db/schema';

const ALL: Role[] = ['admin', 'tracking', 'sales', 'slitting', 'printing', 'cutting', 'finishing', 'repair'];
const OFFICE: Role[] = ['admin', 'tracking', 'sales'];

export const BOARD_TABS = ['orders', 'fabric', 'production', 'review', 'ready', 'shipped', 'all'] as const;
export type BoardTab = (typeof BOARD_TABS)[number];

const PRODUCTION_STAGES = ['slitting', 'printing', 'cutting', 'finishing', 'repair', 'turning'];

// Okuma: üretim panosu sipariş ve cari tablolarını yalnızca okur (yazma orders/public üzerinden).
export const productionBoard = defineAction({
  name: 'production.board',
  module: 'production',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({ tab: z.enum(BOARD_TABS).default('production') }),
  run: async (ctx, i) => {
    const sector = getSector(ctx.cfg.sector);
    if (i.tab === 'orders') {
      const rows = await ctx.tx
        .select({ id: orders.id, no: orders.no, orderDate: orders.orderDate, product: orders.product, quantity: orders.quantity, partyName: parties.name })
        .from(orders)
        .innerJoin(parties, eq(parties.id, orders.partyId))
        .where(eq(orders.status, 'draft'))
        .orderBy(asc(orders.orderDate));
      return { kind: 'orders' as const, rows: rows.map((r) => ({ ...r, product: sector.describe(r.product) })) };
    }
    const stageFilter = {
      fabric: and(eq(jobs.stage, 'waiting'), eq(jobs.fabricReserved, false)),
      production: inArray(jobs.stage, ['waiting', ...PRODUCTION_STAGES]),
      review: eq(jobs.stage, 'review'),
      ready: eq(jobs.stage, 'completed'),
      shipped: eq(jobs.stage, 'shipped'),
      all: undefined,
    }[i.tab];
    const rows = await ctx.tx
      .select({ job: jobs, orderDate: orders.orderDate, product: orders.product, quantity: orders.quantity, partyName: parties.name })
      .from(jobs)
      .innerJoin(orders, eq(orders.id, jobs.orderId))
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .where(stageFilter)
      .orderBy(asc(orders.orderDate))
      .limit(500);
    return {
      kind: 'jobs' as const,
      rows: rows.map(({ job, product, ...r }) => ({
        id: job.id, no: job.no, stage: job.stage, stageStatus: job.stageStatus, fabricReserved: job.fabricReserved,
        producedQty: job.producedQty, shippedQty: job.shippedQty, version: job.version, ...r, product: sector.describe(product),
      })),
    };
  },
});

function stagesForRoles(roles: Role[]): string[] {
  if (roles.some((r) => r === 'admin' || r === 'tracking')) return PRODUCTION_STAGES;
  const out: string[] = [];
  for (const r of roles) {
    if (r === 'finishing') out.push('finishing', 'turning');
    else if (PRODUCTION_STAGES.includes(r)) out.push(r);
  }
  return out;
}

// Bölüm ekranı: yalnızca o bölümün işleri; fiyat ve ödeme yok.
export const departmentQueue = defineAction({
  name: 'production.queue',
  module: 'production',
  roles: ALL,
  rateLimit: false,
  input: z.object({ stage: z.string().min(1).max(40) }),
  run: async (ctx, i) => {
    if (!stagesForRoles(ctx.user.roles).includes(i.stage)) throw new AppError('FORBIDDEN', 'Bu bölümün ekranına erişiminiz yok.');
    const sector = getSector(ctx.cfg.sector);
    const rows = await ctx.tx
      .select({ job: jobs, product: orders.product, quantity: orders.quantity, departmentNotes: orders.departmentNotes, packaging: orders.packaging, partyName: parties.name, orderDate: orders.orderDate })
      .from(jobs)
      .innerJoin(orders, eq(orders.id, jobs.orderId))
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .where(eq(jobs.stage, i.stage))
      .orderBy(asc(orders.orderDate));
    return rows.map(({ job, product, departmentNotes, ...r }) => ({
      id: job.id, no: job.no, stage: job.stage, stageStatus: job.stageStatus, version: job.version, reviewNote: job.reviewNote,
      productText: sector.describe(product), product, note: departmentNotes[i.stage] ?? '', ...r,
    }));
  },
});

export const jobDetail = defineAction({
  name: 'production.detail',
  module: 'production',
  roles: ALL,
  rateLimit: false,
  input: z.object({ id: z.string().uuid() }),
  run: async (ctx, i) => {
    const [row] = await ctx.tx
      .select({ job: jobs, product: orders.product, quantity: orders.quantity, departmentNotes: orders.departmentNotes, packaging: orders.packaging, partyName: parties.name, orderDate: orders.orderDate })
      .from(jobs)
      .innerJoin(orders, eq(orders.id, jobs.orderId))
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .where(eq(jobs.id, i.id));
    if (!row) throw new AppError('NOT_FOUND', 'İş bulunamadı.');
    const isOffice = ctx.user.roles.some((r) => OFFICE.includes(r));
    if (!isOffice && !stagesForRoles(ctx.user.roles).includes(row.job.stage)) throw new AppError('NOT_FOUND', 'İş bulunamadı.');
    const events = await ctx.tx.select().from(jobEvents).where(eq(jobEvents.jobId, i.id)).orderBy(desc(jobEvents.at));
    const staffIds = [...new Set(events.flatMap((e) => e.staffIds))];
    const people = staffIds.length ? await ctx.tx.select({ id: staff.id, name: staff.name }).from(staff).where(inArray(staff.id, staffIds)) : [];
    const ships = await ctx.tx.select().from(shipments).where(eq(shipments.jobId, i.id)).orderBy(desc(shipments.shippedAt));
    const sector = getSector(ctx.cfg.sector);
    const notes = isOffice ? row.departmentNotes : Object.fromEntries(Object.entries(row.departmentNotes).filter(([k]) => stagesForRoles(ctx.user.roles).includes(k)));
    return {
      id: row.job.id, no: row.job.no, orderId: row.job.orderId, stage: row.job.stage, stageStatus: row.job.stageStatus, fabricReserved: row.job.fabricReserved,
      producedQty: row.job.producedQty, shippedQty: row.job.shippedQty, reviewNote: row.job.reviewNote, cancelReason: row.job.cancelReason, version: row.job.version,
      partyName: row.partyName, orderDate: row.orderDate, quantity: row.quantity, packaging: row.packaging, departmentNotes: notes,
      product: row.product, productText: sector.describe(row.product), canTurn: sector.canTurn(sector.validateProduct(row.product)),
      firstStages: sector.firstStages(sector.validateProduct(row.product)),
      events: events.map((e) => ({ id: e.id, stage: e.stage, kind: e.kind, at: e.at.toISOString(), machine: e.machine, data: e.data, note: e.note, staff: e.staffIds.map((id) => people.find((p) => p.id === id)?.name ?? '?') })),
      shipments: ships.map((s) => ({ id: s.id, qty: s.qty, shippedAt: s.shippedAt, note: s.note })),
    };
  },
});

export const listFabric = defineAction({
  name: 'production.fabric',
  module: 'production',
  roles: ['admin', 'tracking'],
  rateLimit: false,
  input: z.object({ status: z.enum(['available', 'reserved', 'used']).optional() }),
  run: async (ctx, i) =>
    ctx.tx
      .select({ roll: fabricRolls, jobNo: jobs.no })
      .from(fabricRolls)
      .leftJoin(jobs, eq(jobs.id, fabricRolls.reservedJobId))
      .where(i.status ? eq(fabricRolls.status, i.status) : undefined)
      .orderBy(asc(fabricRolls.colour), asc(fabricRolls.widthCm))
      .then((rows) => rows.map(({ roll, jobNo }) => ({ ...roll, createdAt: roll.createdAt.toISOString(), jobNo }))),
});

export const listWorkshopStaff = defineAction({
  name: 'production.staff',
  module: 'production',
  roles: ALL,
  rateLimit: false,
  input: z.object({ stage: z.string().max(40) }),
  run: async (ctx, i) => {
    const rows = await ctx.tx.select({ id: staff.id, name: staff.name, departments: staff.departments, active: staff.active }).from(staff);
    const want = i.stage === 'turning' ? 'finishing' : i.stage;
    return rows.filter((s) => s.active && s.departments.includes(want)).map((s) => ({ id: s.id, name: s.name }));
  },
});
