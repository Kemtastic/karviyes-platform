import { and, asc, eq, inArray, like } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { parties } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import type { Role } from '@/core/modules/types';
import { parseCsv } from '@/core/export/csv';
import { PROVINCES, districtsOf, isDistrictOf } from './locations';
import { normalizeSearch } from './search';
import { validateTaxId } from './tax-id';

const EDITORS: Role[] = ['admin', 'sales', 'accounting', 'tracking'];

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
  readOnlySafe: true,
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
  readOnlySafe: true,
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

// ---- İçe aktarma (Excel → CSV) ------------------------------------------------------------------

type ImportField = keyof Omit<PartyInput, 'legalType' | 'kind'> | 'kind' | 'legalType';

// Başlık eşleştirme: bizim dışa aktarımımız ve eski Karviyes dışa aktarımı (harf/boşluk duyarsız).
const HEADER_ALIASES: Record<string, ImportField> = {
  ad: 'name', unvan: 'name', unvanadsoyad: 'name', firmaadi: 'name', firma: 'name', musteri: 'name', cariadi: 'name',
  tur: 'kind', sahissirket: 'legalType',
  vkntckn: 'taxId', vkn: 'taxId', tckn: 'taxId', vergino: 'taxId', vergikimlikno: 'taxId',
  vergidairesi: 'taxOffice', il: 'city', sehir: 'city', ilce: 'district', adres: 'address',
  yetkili: 'contactName', yetkilikisi: 'contactName', anayetkilikisi: 'contactName',
  telefon: 'phone', tel: 'phone', gsm: 'phone', iletisimgsm: 'phone', iletisimsabit: 'phone',
  eposta: 'email', email: 'email', mail: 'email', not: 'notes', notlar: 'notes', aciklama: 'notes',
};
const MAX_LEN: Partial<Record<ImportField, number>> = { name: 200, taxOffice: 120, city: 60, district: 60, address: 500, contactName: 120, phone: 40, notes: 2000 };
const FIELD_LABELS: Partial<Record<ImportField, string>> = { name: 'Ad', taxOffice: 'Vergi dairesi', city: 'İl', district: 'İlçe', address: 'Adres', contactName: 'Yetkili', phone: 'Telefon', notes: 'Not' };
const headerKey = (h: string) => normalizeSearch(h).replace(/[^a-z0-9]/g, '');

export const importParties = defineAction({
  name: 'parties.import',
  roles: EDITORS,
  input: z.object({ csv: z.string().max(3_000_000, 'Dosya en fazla 3 MB olabilir.'), dryRun: z.boolean() }),
  run: async (ctx, i) => {
    // Yanlış kodlamayla okunmuş dosya (ör. Windows-1254 → UTF-8) bozuk harf (U+FFFD) içerir; bozuk adla kayıt açılmasın.
    if (i.csv.includes('�')) throw new AppError('VALIDATION', 'Dosyadaki Türkçe karakterler okunamadı. Excel’de "CSV UTF-8" olarak kaydedip tekrar deneyin.');
    const [header, ...data] = parseCsv(i.csv);
    if (!header) throw new AppError('VALIDATION', 'Dosya boş.');
    if (data.length > 5000) throw new AppError('VALIDATION', 'Bir seferde en çok 5000 satır aktarılabilir.');
    const columns = header.map((h) => HEADER_ALIASES[headerKey(h)]);
    if (!columns.includes('name')) throw new AppError('VALIDATION', 'Ad (ünvan) sütunu bulunamadı. Başlık satırında "Ad" veya "Firma adı" olmalı.');

    const existing = await ctx.tx.select({ name: parties.name, taxId: parties.taxId }).from(parties).where(eq(parties.archived, false));
    const seenTax = new Set(existing.map((p) => p.taxId).filter(Boolean));
    const seenName = new Set(existing.map((p) => normalizeSearch(p.name)));
    const fileNames = new Set<string>();
    const toInsert: PartyInput[] = [];
    const skipped: { row: number; name: string; reason: string }[] = [];
    const errors: { row: number; message: string }[] = [];
    const warnings: { row: number; message: string }[] = [];

    data.forEach((cells, n) => {
      const row = n + 2;
      const raw: Partial<Record<ImportField, string>> = {};
      columns.forEach((field, c) => {
        const v = (cells[c] ?? '').trim();
        if (field && v && !raw[field]) raw[field] = v;
      });
      const warn = (message: string) => warnings.push({ row, message });
      for (const [field, max] of Object.entries(MAX_LEN) as [ImportField, number][]) {
        if (raw[field] && raw[field]!.length > max) {
          raw[field] = raw[field]!.slice(0, max);
          warn(`${FIELD_LABELS[field] ?? field} ${max} karaktere kısaltıldı.`);
        }
      }
      if (!raw.name || raw.name.length < 2) return void errors.push({ row, message: 'Ad boş.' });
      const kindText = normalizeSearch(raw.kind ?? '');
      const kind = kindText.includes('ve') ? 'both' : kindText.startsWith('tedarik') ? 'supplier' : 'customer';
      let taxId = (raw.taxId ?? '').replace(/\D/g, '');
      const legalText = normalizeSearch(raw.legalType ?? '');
      const legalType = legalText.startsWith('sahis') || (!legalText && taxId.length === 11) ? 'individual' : 'company';
      if (taxId && !validateTaxId(taxId, legalType)) {
        warn(`Geçersiz ${legalType === 'company' ? 'VKN' : 'TCKN'} boşaltıldı (${taxId}).`);
        taxId = '';
      }
      const city = PROVINCES.find((p) => normalizeSearch(p) === normalizeSearch(raw.city ?? '')) ?? raw.city ?? '';
      let district = raw.district ? (districtsOf(city).find((d) => normalizeSearch(d) === normalizeSearch(raw.district!)) ?? '') : '';
      if (raw.district && !district) warn(`İlçe "${raw.district}" ${city || 'il'} ilçelerinde yok; boşaltıldı.`);
      if (district && !isDistrictOf(city, district)) district = '';
      let email = raw.email ?? '';
      if (email && !z.string().email().safeParse(email).success) {
        warn(`Geçersiz e-posta boşaltıldı (${email}).`);
        email = '';
      }
      const key = normalizeSearch(raw.name);
      if (taxId && seenTax.has(taxId)) return void skipped.push({ row, name: raw.name, reason: 'Aynı VKN ile kayıtlı cari var.' });
      if (fileNames.has(key)) return void skipped.push({ row, name: raw.name, reason: 'Dosyada aynı ad daha önce geçiyor.' });
      if (seenName.has(key)) return void skipped.push({ row, name: raw.name, reason: 'Aynı adla kayıtlı cari var.' });
      const parsed = partyFields.safeParse({ ...raw, kind, legalType, taxId, city, district, email });
      if (!parsed.success) return void errors.push({ row, message: parsed.error.issues.map((x) => x.message).join(' ') });
      fileNames.add(key);
      if (taxId) seenTax.add(taxId);
      toInsert.push(parsed.data);
    });

    if (!i.dryRun && toInsert.length) {
      // Postgres tek sorguda en çok 65.535 parametre alır (satır başına 14): parçalar hâlinde eklenir.
      for (let n = 0; n < toInsert.length; n += 1000) {
        await ctx.tx.insert(parties).values(toInsert.slice(n, n + 1000).map((p) => ({ companyId: ctx.companyId, ...p, searchKey: searchKeyOf(p) })));
      }
      await ctx.audit({ entity: 'party', entityId: ctx.companyId, after: { import: toInsert.length, skipped: skipped.length, errors: errors.length } });
    }
    return { total: data.length, toAdd: toInsert.length, added: i.dryRun ? 0 : toInsert.length, skipped, errors, warnings, preview: toInsert.slice(0, 20).map((p) => ({ name: p.name, kind: p.kind, city: p.city, phone: p.phone })) };
  },
});
