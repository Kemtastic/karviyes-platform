import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction, type ActionCtx } from '@/core/action';
import { istanbulToday } from '@/core/dates';
import { staff } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import type { Role } from '@/core/modules/types';
import { cancelFromProduction, getOrderForProduction, markInProduction, markReadyToInvoice, onProductionProgress } from '@/modules/orders/server/public';
import { getSector } from '@/sectors';
import type { SectorPackage } from '@/sectors/types';
import { fabricRolls, jobEvents, jobs, shipments } from '../db/schema';
import { rollMatches } from '../domain/materials';
import { transition, type JobEvent, type JobState } from '../domain/state-machine';

const TRACKING: Role[] = ['admin', 'tracking'];
const ALL_PRODUCTION: Role[] = ['admin', 'tracking', 'slitting', 'printing', 'cutting', 'finishing', 'repair'];
// Sağlam adet hedefin bu oranının altındaysa açık onay istenir.
const LOW_QTY_RATIO = 0.9;

const conflict = () => new AppError('CONFLICT', 'Bu kayıt başka biri tarafından değiştirildi, sayfayı yenileyin.');

// Sürüm, rol ve durum kontrollerinden önce denetlenir: eski ekrandan gelen istek her zaman CONFLICT alır.
async function load(ctx: ActionCtx, jobId: string, version?: number) {
  const [job] = await ctx.tx.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw new AppError('NOT_FOUND', 'İş bulunamadı.');
  if (version !== undefined && job.version !== version) throw conflict();
  const order = await getOrderForProduction(ctx.tx, job.orderId);
  const sector = getSector(ctx.cfg.sector);
  return { job, order, sector, product: sector.validateProduct(order.product) };
}

function stateOf(job: typeof jobs.$inferSelect): JobState {
  return { stage: job.stage, stageStatus: job.stageStatus, fabricReserved: job.fabricReserved, producedQty: job.producedQty, shippedQty: job.shippedQty };
}

// Bölüm rolü kontrolü: yönetici ve üretim takip her aşamada; diğerleri yalnızca kendi bölümünde.
function assertStageRole(ctx: ActionCtx, sector: SectorPackage, stage: string): void {
  if (ctx.user.roles.some((r) => r === 'admin' || r === 'tracking')) return;
  const def = sector.stages.find((s) => s.id === stage);
  if (!def || !ctx.user.roles.includes(def.role)) throw new AppError('FORBIDDEN', 'Bu iş sizin bölümünüzde değil.');
}

async function apply(
  ctx: ActionCtx,
  loaded: Awaited<ReturnType<typeof load>>,
  version: number,
  event: JobEvent,
  log: { kind: string; staffIds?: string[]; machine?: string; data?: Record<string, number | string | boolean>; note?: string },
  extra: Partial<typeof jobs.$inferInsert> = {},
): Promise<JobState> {
  const { job, sector, product } = loaded;
  const next = transition(stateOf(job), event, sector, product);
  const updated = await ctx.tx
    .update(jobs)
    .set({ ...next, version: job.version + 1, updatedAt: new Date(), ...extra })
    .where(and(eq(jobs.id, job.id), eq(jobs.version, version)))
    .returning({ id: jobs.id });
  if (!updated.length) throw conflict();
  await ctx.tx.insert(jobEvents).values({
    companyId: ctx.companyId,
    jobId: job.id,
    stage: job.stage,
    kind: log.kind,
    userId: ctx.user.userId,
    staffIds: log.staffIds ?? [],
    machine: log.machine ?? '',
    data: log.data ?? {},
    note: log.note ?? '',
  });
  return next;
}

const jobRef = { jobId: z.string().uuid(), version: z.number().int() };

export const startProduction = defineAction({
  name: 'production.start',
  module: 'production',
  roles: TRACKING,
  input: z.object({ orderId: z.string().uuid() }),
  run: async (ctx, i) => {
    const order = await getOrderForProduction(ctx.tx, i.orderId);
    await markInProduction(ctx.tx, order.id);
    const [row] = await ctx.tx.insert(jobs).values({ companyId: ctx.companyId, orderId: order.id, no: order.no }).returning({ id: jobs.id });
    await ctx.tx.insert(jobEvents).values({ companyId: ctx.companyId, jobId: row!.id, stage: 'waiting', kind: 'created', userId: ctx.user.userId });
    await ctx.audit({ entity: 'job', entityId: row!.id, after: { orderId: order.id, no: order.no } });
    return { id: row!.id };
  },
});

export const addFabricRolls = defineAction({
  name: 'production.addFabric',
  module: 'production',
  roles: TRACKING,
  input: z.object({ widthCm: z.coerce.number().positive().max(1000), colour: z.string().trim().min(1).max(60), gsm: z.coerce.number().int().min(10).max(500), metres: z.coerce.number().int().positive().max(100000), count: z.coerce.number().int().min(1).max(200).default(1) }),
  run: async (ctx, i) => {
    const rows = await ctx.tx
      .insert(fabricRolls)
      .values(Array.from({ length: i.count }, () => ({ companyId: ctx.companyId, widthCm: String(i.widthCm), colour: i.colour, gsm: i.gsm, metres: i.metres })))
      .returning({ id: fabricRolls.id });
    await ctx.audit({ entity: 'fabric', entityId: rows[0]!.id, after: { ...i } });
    return { ids: rows.map((r) => r.id) };
  },
});

export const reserveFabric = defineAction({
  name: 'production.reserveFabric',
  module: 'production',
  roles: TRACKING,
  input: z.object({ ...jobRef, rollIds: z.array(z.string().uuid()).min(1).max(100) }),
  run: async (ctx, i) => {
    const loaded = await load(ctx, i.jobId, i.version);
    const rolls = await ctx.tx.select().from(fabricRolls).where(inArray(fabricRolls.id, i.rollIds));
    if (rolls.length !== i.rollIds.length || rolls.some((r) => r.status !== 'available')) throw new AppError('INVALID_STATE', 'Seçilen bobinlerden biri artık kullanılabilir değil.');
    await apply(ctx, loaded, i.version, { type: 'reserveFabric' }, { kind: 'fabric_reserved', data: { rolls: rolls.length } });
    // Aynı anda başka iş aynı bobini ayırmış olabilir: yalnızca hâlâ boşta olanlar güncellenir, eksik varsa işlem geri alınır.
    const reserved = await ctx.tx
      .update(fabricRolls)
      .set({ status: 'reserved', reservedJobId: i.jobId, reservedFor: 'fabric' })
      .where(and(inArray(fabricRolls.id, i.rollIds), eq(fabricRolls.status, 'available')))
      .returning({ id: fabricRolls.id });
    if (reserved.length !== i.rollIds.length) throw new AppError('INVALID_STATE', 'Seçilen bobinlerden biri artık kullanılabilir değil.');
    return { id: i.jobId };
  },
});

export const sendToStage = defineAction({
  name: 'production.send',
  module: 'production',
  roles: TRACKING,
  input: z.object({ ...jobRef, stage: z.string().min(1).max(40) }),
  run: async (ctx, i) => {
    const loaded = await load(ctx, i.jobId, i.version);
    await apply(ctx, loaded, i.version, { type: 'send', stage: i.stage }, { kind: 'sent', data: { to: i.stage } });
    return { id: i.jobId };
  },
});

// Aşama başlarken o aşamada tüketilecek malzeme (ör. kesimde sap) boştaki stoktan ayrılır; eskiden yeniye.
async function reserveStageMaterials(ctx: ActionCtx, loaded: Awaited<ReturnType<typeof load>>): Promise<void> {
  const stage = loaded.job.stage;
  const needs = loaded.sector.materials(loaded.product, loaded.order.quantity).filter((n) => n.consumeAt === stage && n.kind !== 'fabric');
  for (const need of needs) {
    const already = await ctx.tx.select({ id: fabricRolls.id }).from(fabricRolls).where(and(eq(fabricRolls.reservedJobId, loaded.job.id), eq(fabricRolls.reservedFor, need.kind)));
    const missing = need.rolls - already.length;
    if (missing <= 0) continue;
    const candidates = (
      await ctx.tx
        .select()
        .from(fabricRolls)
        .where(and(eq(fabricRolls.status, 'available'), eq(fabricRolls.widthCm, String(need.widthCm)), need.gsm === null ? undefined : eq(fabricRolls.gsm, need.gsm)))
        .orderBy(asc(fabricRolls.createdAt))
    ).filter((r) => rollMatches(need, { widthCm: Number(r.widthCm), colour: r.colour, gsm: r.gsm }));
    if (candidates.length < missing) {
      const label = loaded.sector.stages.find((s) => s.id === stage)?.label ?? stage;
      throw new AppError('INVALID_STATE', `${label} aşamasına başlamak için ${missing} bobin ${need.widthCm} cm ${need.colour} ${need.label.toLocaleLowerCase('tr')} gerekli (${need.gsm ? `${need.gsm} gr` : 'herhangi gramaj'}); boşta ${candidates.length} bobin var. Üretim takibe haber verin.`);
    }
    const ids = candidates.slice(0, missing).map((r) => r.id);
    const taken = await ctx.tx
      .update(fabricRolls)
      .set({ status: 'reserved', reservedJobId: loaded.job.id, reservedFor: need.kind })
      .where(and(inArray(fabricRolls.id, ids), eq(fabricRolls.status, 'available')))
      .returning({ id: fabricRolls.id });
    if (taken.length !== ids.length) throw conflict();
  }
}

async function assertStaff(ctx: ActionCtx, staffIds: string[]) {
  if (!staffIds.length) return;
  const found = await ctx.tx.select({ id: staff.id }).from(staff).where(and(inArray(staff.id, staffIds), eq(staff.active, true)));
  if (found.length !== new Set(staffIds).size) throw new AppError('VALIDATION', 'Personel listesinden seçin.', { staffIds: 'Personel listesinden seçin.' });
}

export const startStage = defineAction({
  name: 'production.startStage',
  module: 'production',
  roles: ALL_PRODUCTION,
  input: z.object({ ...jobRef, machine: z.string().trim().max(60).default(''), staffIds: z.array(z.string().uuid()).max(20).default([]) }),
  run: async (ctx, i) => {
    const loaded = await load(ctx, i.jobId, i.version);
    assertStageRole(ctx, loaded.sector, loaded.job.stage);
    await assertStaff(ctx, i.staffIds);
    await reserveStageMaterials(ctx, loaded);
    await apply(ctx, loaded, i.version, { type: 'start' }, { kind: 'started', staffIds: i.staffIds, machine: i.machine });
    return { id: i.jobId };
  },
});

export const finishStage = defineAction({
  name: 'production.finishStage',
  module: 'production',
  roles: ALL_PRODUCTION,
  input: z.object({
    ...jobRef,
    good: z.coerce.number().int().min(0).optional(),
    cutWaste: z.coerce.number().int().min(0).default(0),
    printWaste: z.coerce.number().min(0).default(0),
    samples: z.coerce.number().int().min(0).default(0),
    sacks: z.coerce.number().int().min(0).default(0),
    boxes: z.coerce.number().int().min(0).default(0),
    metres: z.coerce.number().min(0).optional(),
    staffIds: z.array(z.string().uuid()).max(20).default([]),
    machine: z.string().trim().max(60).default(''),
    note: z.string().trim().max(500).default(''),
    quantityAcknowledged: z.boolean().default(false),
  }),
  run: async (ctx, i) => {
    const loaded = await load(ctx, i.jobId, i.version);
    const stage = loaded.job.stage;
    assertStageRole(ctx, loaded.sector, stage);
    await assertStaff(ctx, i.staffIds);
    const countsGood = ['cutting', 'finishing', 'repair', 'turning'].includes(stage);
    if (countsGood && i.good === undefined) throw new AppError('VALIDATION', 'Sağlam adedi girin.', { good: 'Sağlam adedi girin.' });
    const target = loaded.order.quantity;
    if ((stage === 'cutting' || stage === 'finishing') && i.good !== undefined && i.good < target * LOW_QTY_RATIO && !i.quantityAcknowledged) {
      throw new AppError('VALIDATION', `Sağlam adet hedefin altında (hedef ${target.toLocaleString('tr-TR')}). Doğruysa onaylayın.`, { good: 'Adet hedefin altında; doğruysa onay kutusunu işaretleyin.' });
    }
    const data: Record<string, number | boolean> = { cutWaste: i.cutWaste, printWaste: i.printWaste, samples: i.samples, sacks: i.sacks, boxes: i.boxes };
    if (i.good !== undefined) data.good = i.good;
    if (i.metres !== undefined) data.metres = i.metres;
    if (i.quantityAcknowledged) data.quantityAcknowledged = true;
    // Bitirirken makine/personel seçilmezse aşamanın başlatma kaydındakiler kullanılır (raporlar bitirme kaydını okur).
    const [started] = await ctx.tx
      .select({ machine: jobEvents.machine, staffIds: jobEvents.staffIds })
      .from(jobEvents)
      .where(and(eq(jobEvents.jobId, i.jobId), eq(jobEvents.stage, stage), eq(jobEvents.kind, 'started')))
      .orderBy(desc(jobEvents.at))
      .limit(1);
    const staffIds = i.staffIds.length ? i.staffIds : (started?.staffIds ?? []);
    const machine = i.machine || started?.machine || '';
    const next = await apply(ctx, loaded, i.version, { type: 'finish', good: i.good }, { kind: 'finished', data, staffIds, machine, note: i.note });
    // Aşamayı bitiren bölüm işe ayrılmış malzemeyi tüketmiştir (ilk aşama kumaşı, kesim sapı).
    await ctx.tx.update(fabricRolls).set({ status: 'used' }).where(and(eq(fabricRolls.reservedJobId, i.jobId), eq(fabricRolls.status, 'reserved')));
    if (stage === 'finishing') await onProductionProgress(ctx.tx, { orderId: loaded.order.id, producedQty: next.producedQty });
    return { id: i.jobId, stage: next.stage };
  },
});

export const sendToRepair = defineAction({
  name: 'production.toRepair',
  module: 'production',
  roles: ['admin', 'tracking', 'finishing'],
  input: z.object({ ...jobRef, note: z.string().trim().max(500).default('') }),
  run: async (ctx, i) => {
    const loaded = await load(ctx, i.jobId, i.version);
    // Kontrol kararı üretim takibindir: kontroldeki işi bölüm tableti tamire gönderemez.
    if (loaded.job.stage === 'review' && !ctx.user.roles.some((r) => r === 'admin' || r === 'tracking')) throw new AppError('FORBIDDEN', 'Kontroldeki işi yalnızca üretim takip tamire gönderebilir.');
    await apply(ctx, loaded, i.version, { type: 'toRepair' }, { kind: 'to_repair', note: i.note });
    return { id: i.jobId };
  },
});

export const sendToTurning = defineAction({
  name: 'production.toTurning',
  module: 'production',
  roles: ['admin', 'tracking', 'finishing'],
  input: z.object({ ...jobRef, note: z.string().trim().max(500).default('') }),
  run: async (ctx, i) => {
    const loaded = await load(ctx, i.jobId, i.version);
    await apply(ctx, loaded, i.version, { type: 'toTurning' }, { kind: 'to_turning', note: i.note });
    return { id: i.jobId };
  },
});

export const approveReview = defineAction({
  name: 'production.approve',
  module: 'production',
  roles: TRACKING,
  input: z.object(jobRef),
  run: async (ctx, i) => {
    const loaded = await load(ctx, i.jobId, i.version);
    await apply(ctx, loaded, i.version, { type: 'approve' }, { kind: 'approved' });
    await markReadyToInvoice(ctx.tx, loaded.order.id);
    return { id: i.jobId };
  },
});

export const returnFromReview = defineAction({
  name: 'production.returnFromReview',
  module: 'production',
  roles: TRACKING,
  input: z.object({ ...jobRef, to: z.string().min(1).max(40), note: z.string().trim().min(3).max(500) }),
  run: async (ctx, i) => {
    const loaded = await load(ctx, i.jobId, i.version);
    await apply(ctx, loaded, i.version, { type: 'returnFromReview', to: i.to }, { kind: 'returned', data: { to: i.to }, note: i.note }, { reviewNote: i.note });
    return { id: i.jobId };
  },
});

export const shipJob = defineAction({
  name: 'production.ship',
  module: 'production',
  roles: TRACKING,
  input: z.object({ ...jobRef, qty: z.coerce.number().int(), shippedAt: z.string().date().optional(), note: z.string().trim().max(300).default('') }),
  run: async (ctx, i) => {
    const loaded = await load(ctx, i.jobId, i.version);
    const next = await apply(ctx, loaded, i.version, { type: 'ship', qty: i.qty }, { kind: 'shipped', data: { qty: i.qty }, note: i.note });
    await ctx.tx.insert(shipments).values({ companyId: ctx.companyId, jobId: i.jobId, qty: i.qty, shippedAt: i.shippedAt ?? istanbulToday(), note: i.note, createdBy: ctx.user.userId });
    await onProductionProgress(ctx.tx, { orderId: loaded.order.id, shippedQty: next.shippedQty });
    await ctx.audit({ entity: 'job', entityId: i.jobId, after: { shipped: i.qty, totalShipped: next.shippedQty } });
    return { id: i.jobId, stage: next.stage };
  },
});

export const cancelJob = defineAction({
  name: 'production.cancel',
  module: 'production',
  roles: TRACKING,
  input: z.object({ ...jobRef, reason: z.string().trim().min(3).max(500) }),
  run: async (ctx, i) => {
    const loaded = await load(ctx, i.jobId, i.version);
    await apply(ctx, loaded, i.version, { type: 'cancel' }, { kind: 'cancelled', note: i.reason }, { cancelReason: i.reason });
    await cancelFromProduction(ctx.tx, loaded.order.id, i.reason);
    await ctx.tx.update(fabricRolls).set({ status: 'available', reservedJobId: null }).where(and(eq(fabricRolls.reservedJobId, i.jobId), eq(fabricRolls.status, 'reserved')));
    await ctx.audit({ entity: 'job', entityId: i.jobId, after: { cancelled: true, reason: i.reason } });
    return { id: i.jobId };
  },
});
