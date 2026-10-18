import { and, asc, eq, inArray, like } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { parties } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import type { Role } from '@/core/modules/types';
import { isDistrictOf } from './locations';
import { normalizeSearch } from './search';
import { validateTaxId } from './tax-id';

const EDITORS: Role[] = ['admin', 'sales', 'tracking'];

const partyFields = z
  .object({
    kind: z.enum(['customer', 'supplier', 'both']),
    name: z.string().trim().min(2).max(200),
    legalType: z.enum(['company', 'individual']).default('company'),
    taxId: z.string().trim().max(11).default(''),
    taxOffice: z.string().trim().max(120).default(''),
    city: z.string().trim().max(60).default(''),
    district: z.string().trim().max(60).default(''),
    address: z.string().trim().max(500).default(''),
    contactName: z.string().trim().max(120).default(''),
    phone: z.string().trim().max(40).default(''),
    email: z.union([z.string().trim().email(), z.literal('')]).default(''),
    notes: z.string().trim().max(2000).default(''),
  })
  .superRefine((p, ctx) => {
    if (p.taxId && !validateTaxId(p.taxId, p.legalType)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['taxId'], message: p.legalType === 'company' ? 'Vergi numarası (10 hane) geçersiz.' : 'T.C. kimlik numarası (11 hane) geçersiz.' });
    }
    if (p.district && (!p.city || !isDistrictOf(p.city, p.district))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['district'], message: 'Seçilen ilin ilçelerinden seçim yapın.' });
    }
  });

type PartyInput = z.infer<typeof partyFields>;

const searchKeyOf = (p: PartyInput) => normalizeSearch([p.name, p.contactName, p.taxId, p.city, p.district].join(' '));

export const createParty = defineAction({
  name: 'parties.create',
  roles: EDITORS,
  input: partyFields,
  run: async (ctx, i) => {
    const [row] = await ctx.tx.insert(parties).values({ companyId: ctx.companyId, ...i, searchKey: searchKeyOf(i) }).returning();
    await ctx.audit({ entity: 'party', entityId: row!.id, after: i });
    return row!;
  },
});

export const updateParty = defineAction({
  name: 'parties.update',
  roles: EDITORS,
  input: z.intersection(partyFields, z.object({ id: z.string().uuid(), version: z.number().int() })),
  run: async (ctx, i) => {
    const { id, version, ...fields } = i;
    const [before] = await ctx.tx.select().from(parties).where(eq(parties.id, id));
    if (!before) throw new AppError('NOT_FOUND', 'Cari bulunamadı.');
    const updated = await ctx.tx
      .update(parties)
      .set({ ...fields, searchKey: searchKeyOf(fields), version: before.version + 1 })
      .where(and(eq(parties.id, id), eq(parties.version, version)))
      .returning();
    if (!updated.length) throw new AppError('CONFLICT', 'Bu kayıt başka biri tarafından değiştirildi, sayfayı yenileyin.');
    await ctx.audit({ entity: 'party', entityId: id, before, after: updated[0] });
    return updated[0]!;
  },
});

export const archiveParty = defineAction({
  name: 'parties.archive',
  roles: ['admin', 'tracking'],
  input: z.object({ id: z.string().uuid(), version: z.number().int() }),
  run: async (ctx, i) => {
    const updated = await ctx.tx
      .update(parties)
      .set({ archived: true, version: i.version + 1 })
      .where(and(eq(parties.id, i.id), eq(parties.version, i.version)))
      .returning({ id: parties.id });
    if (!updated.length) throw new AppError('CONFLICT', 'Bu kayıt başka biri tarafından değiştirildi, sayfayı yenileyin.');
    await ctx.audit({ entity: 'party', entityId: i.id, after: { archived: true } });
    return { id: i.id };
  },
});

export const searchParties = defineAction({
  name: 'parties.search',
  roles: EDITORS,
  rateLimit: false,
  input: z.object({ q: z.string().max(100).default(''), kind: z.enum(['customer', 'supplier']).optional(), limit: z.number().int().min(1).max(200).default(50) }),
  run: async (ctx, i) => {
    const key = normalizeSearch(i.q);
    const rows = await ctx.tx
      .select()
      .from(parties)
      .where(and(eq(parties.archived, false), key ? like(parties.searchKey, `%${key}%`) : undefined, i.kind ? inArray(parties.kind, [i.kind, 'both']) : undefined))
      .orderBy(asc(parties.name))
      .limit(i.limit);
    return rows;
  },
});

// Cari kartı: vergi no ve adres içerir; yalnızca ofis rolleri görür.
export const partyDetail = defineAction({
  name: 'parties.detail',
  roles: EDITORS,
  rateLimit: false,
  input: z.object({ id: z.string().uuid() }),
  run: async (ctx, i) => {
    const [row] = await ctx.tx.select().from(parties).where(eq(parties.id, i.id));
    if (!row) throw new AppError('NOT_FOUND', 'Cari bulunamadı.');
    return row;
  },
});

const KIND_TEXT = { customer: 'Müşteri', supplier: 'Tedarikçi', both: 'Müşteri ve tedarikçi' } as const;

// Excel için cari listesi (arşivlenmemiş). Kişisel veri içerdiği için denetime yazılır.
export const exportParties = defineAction({
  name: 'parties.export',
  roles: EDITORS,
  input: z.object({}),
  run: async (ctx) => {
    const rows = await ctx.tx.select().from(parties).where(eq(parties.archived, false)).orderBy(asc(parties.name)).limit(20000);
    const headers = ['Ad', 'Tür', 'Şahıs/Şirket', 'VKN/TCKN', 'Vergi dairesi', 'İl', 'İlçe', 'Adres', 'Yetkili', 'Telefon', 'E-posta', 'Not'];
    const out = rows.map((p) => [p.name, KIND_TEXT[p.kind], p.legalType === 'company' ? 'Şirket' : 'Şahıs', p.taxId, p.taxOffice, p.city, p.district, p.address, p.contactName, p.phone, p.email, p.notes]);
    await ctx.audit({ entity: 'party', entityId: ctx.companyId, after: { export: 'parties', rows: out.length } });
    return { headers, rows: out };
  },
});
