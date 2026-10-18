import { and, asc, count, desc, eq, gte, inArray, lte, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { parties, staff } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import type { Role } from '@/core/modules/types';
import { orderLines, orders } from '@/modules/orders/db/schema';
import { getSector } from '@/sectors';
import { fabricRolls, jobEvents, jobs, plates, shipments } from '../db/schema';
import { findShortages, type Demand } from '../domain/materials';

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
      // Üretime alınmamış satırı olan siparişler; ürünler tek satırda.
      const rows = await ctx.tx
        .select({ id: orders.id, no: orders.no, orderDate: orders.orderDate, product: orderLines.product, quantity: orderLines.quantity, partyName: parties.name })
        .from(orderLines)
        .innerJoin(orders, eq(orders.id, orderLines.orderId))
        .innerJoin(parties, eq(parties.id, orders.partyId))
        .where(and(eq(orderLines.status, 'open'), inArray(orders.status, ['draft', 'in_production'])))
        .orderBy(asc(orders.orderDate), asc(orders.no), asc(orderLines.lineNo));
      const byOrder = new Map<string, { id: string; no: string; orderDate: string; partyName: string; quantity: number; products: string[] }>();
      for (const r of rows) {
        const o = byOrder.get(r.id) ?? { id: r.id, no: r.no, orderDate: r.orderDate, partyName: r.partyName, quantity: 0, products: [] };
        o.quantity += r.quantity;
        o.products.push(sector.describe(r.product));
        byOrder.set(r.id, o);
      }
      return { kind: 'orders' as const, rows: [...byOrder.values()].map(({ products, ...o }) => ({ ...o, product: products.join(' + ') })) };
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
      .select({ job: jobs, orderDate: orders.orderDate, product: orderLines.product, quantity: orderLines.quantity, partyName: parties.name })
      .from(jobs)
      .innerJoin(orderLines, eq(orderLines.id, jobs.orderLineId))
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
      .select({ job: jobs, product: orderLines.product, quantity: orderLines.quantity, departmentNotes: orderLines.departmentNotes, packaging: orderLines.packaging, partyName: parties.name, orderDate: orders.orderDate })
      .from(jobs)
      .innerJoin(orderLines, eq(orderLines.id, jobs.orderLineId))
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
      .select({ job: jobs, product: orderLines.product, quantity: orderLines.quantity, departmentNotes: orderLines.departmentNotes, packaging: orderLines.packaging, plateId: orderLines.plateId, partyName: parties.name, orderDate: orders.orderDate })
      .from(jobs)
      .innerJoin(orderLines, eq(orderLines.id, jobs.orderLineId))
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
    const [plate] = row.plateId ? await ctx.tx.select({ id: plates.id, name: plates.name, colours: plates.colours, notes: plates.notes, fileIds: plates.fileIds }).from(plates).where(eq(plates.id, row.plateId)) : [];
    const validated = sector.validateProduct(row.product);
    const rolls = await ctx.tx.select({ reservedFor: fabricRolls.reservedFor, status: fabricRolls.status }).from(fabricRolls).where(eq(fabricRolls.reservedJobId, i.id));
    const materials = sector.materials(validated, row.quantity).map((n) => {
      const mine = rolls.filter((r) => (r.reservedFor ?? 'fabric') === n.kind);
      return { kind: n.kind, label: n.label, widthCm: n.widthCm, colour: n.colour, gsm: n.gsm, rolls: n.rolls, reserved: mine.filter((r) => r.status === 'reserved').length, used: mine.filter((r) => r.status === 'used').length };
    });
    const notes = isOffice ? row.departmentNotes : Object.fromEntries(Object.entries(row.departmentNotes).filter(([k]) => stagesForRoles(ctx.user.roles).includes(k)));
    return {
      id: row.job.id, no: row.job.no, orderId: row.job.orderId, stage: row.job.stage, stageStatus: row.job.stageStatus, fabricReserved: row.job.fabricReserved,
      producedQty: row.job.producedQty, shippedQty: row.job.shippedQty, reviewNote: row.job.reviewNote, cancelReason: row.job.cancelReason, version: row.job.version,
      partyName: row.partyName, orderDate: row.orderDate, quantity: row.quantity, packaging: row.packaging, departmentNotes: notes,
      product: row.product, productText: sector.describe(row.product), canTurn: sector.canTurn(sector.validateProduct(row.product)),
      firstStages: sector.firstStages(sector.validateProduct(row.product)),
      events: events.map((e) => ({ id: e.id, stage: e.stage, kind: e.kind, at: e.at.toISOString(), machine: e.machine, data: e.data, note: e.note, staff: e.staffIds.map((id) => people.find((p) => p.id === id)?.name ?? '?') })),
      shipments: ships.map((s) => ({ id: s.id, qty: s.qty, shippedAt: s.shippedAt, note: s.note })),
      materials,
      plate: plate ?? null,
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

// Bekleyen malzeme ihtiyacı (üretime alınmamış siparişler + ayrımı tamamlanmamış işler) ile boştaki stok karşılaştırması.
export const materialShortages = defineAction({
  name: 'production.shortages',
  module: 'production',
  roles: ['admin', 'tracking'],
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) => {
    const sector = getSector(ctx.cfg.sector);
    const demands: Demand[] = [];
    const open = await ctx.tx
      .select({ no: orders.no, lineNo: orderLines.lineNo, product: orderLines.product, quantity: orderLines.quantity })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(and(eq(orderLines.status, 'open'), inArray(orders.status, ['draft', 'in_production'])));
    for (const l of open) for (const n of sector.materials(sector.validateProduct(l.product), l.quantity)) demands.push({ ...n, ref: `${l.no}/${l.lineNo}` });
    const active = await ctx.tx
      .select({ id: jobs.id, no: jobs.no, product: orderLines.product, quantity: orderLines.quantity })
      .from(jobs)
      .innerJoin(orderLines, eq(orderLines.id, jobs.orderLineId))
      .where(notInArray(jobs.stage, ['review', 'completed', 'cancelled']));
    const taken = active.length
      ? await ctx.tx.select({ jobId: fabricRolls.reservedJobId, reservedFor: fabricRolls.reservedFor }).from(fabricRolls).where(inArray(fabricRolls.reservedJobId, active.map((j) => j.id)))
      : [];
    for (const j of active) {
      for (const n of sector.materials(sector.validateProduct(j.product), j.quantity)) {
        const have = taken.filter((r) => r.jobId === j.id && (r.reservedFor ?? 'fabric') === n.kind).length;
        if (n.rolls > have) demands.push({ ...n, rolls: n.rolls - have, ref: j.no });
      }
    }
    const free = await ctx.tx.select({ widthCm: fabricRolls.widthCm, colour: fabricRolls.colour, gsm: fabricRolls.gsm }).from(fabricRolls).where(eq(fabricRolls.status, 'available'));
    return findShortages(demands, free.map((r) => ({ ...r, widthCm: Number(r.widthCm) })));
  },
});

// Ana sayfa özeti: işler aşama gruplarına göre.
export const productionSummary = defineAction({
  name: 'production.summary',
  module: 'production',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) => {
    const rows = await ctx.tx.select({ stage: jobs.stage, fabricReserved: jobs.fabricReserved, n: count() }).from(jobs).groupBy(jobs.stage, jobs.fabricReserved);
    const sum = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).reduce((s, r) => s + Number(r.n), 0);
    return {
      waitingFabric: sum((r) => r.stage === 'waiting' && !r.fabricReserved),
      inProduction: sum((r) => (r.stage === 'waiting' && r.fabricReserved) || PRODUCTION_STAGES.includes(r.stage)),
      review: sum((r) => r.stage === 'review'),
      readyToShip: sum((r) => r.stage === 'completed'),
    };
  },
});

// Sevk geçmişi: tarih aralığındaki sevkler (yeniden eskiye), iş, müşteri ve ürünle.
export const shipmentHistory = defineAction({
  name: 'production.shipments',
  module: 'production',
  roles: OFFICE,
  rateLimit: false,
  input: z.object({ from: z.string().date(), to: z.string().date() }),
  run: async (ctx, i) => {
    const sector = getSector(ctx.cfg.sector);
    const rows = await ctx.tx
      .select({ s: shipments, jobNo: jobs.no, jobId: jobs.id, product: orderLines.product, partyName: parties.name })
      .from(shipments)
      .innerJoin(jobs, eq(jobs.id, shipments.jobId))
      .innerJoin(orderLines, eq(orderLines.id, jobs.orderLineId))
      .innerJoin(orders, eq(orders.id, jobs.orderId))
      .innerJoin(parties, eq(parties.id, orders.partyId))
      .where(and(gte(shipments.shippedAt, i.from), lte(shipments.shippedAt, i.to)))
      .orderBy(desc(shipments.shippedAt), desc(shipments.createdAt))
      .limit(2000);
    return rows.map((r) => ({ id: r.s.id, shippedAt: r.s.shippedAt, qty: r.s.qty, note: r.s.note, jobId: r.jobId, jobNo: r.jobNo, partyName: r.partyName, product: sector.describe(r.product) }));
  },
});
