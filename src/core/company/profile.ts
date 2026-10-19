import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction } from '@/core/action';
import { companies } from '@/core/db/schema';
import { AppError } from '@/core/errors';

// Firma profili: resmî unvan, vergi ve sicil bilgileri, iletişim, ana IBAN ve mali müşavir.
// Belgelerde (sipariş formu, mutabakat, fatura çıktısı) ve muhasebeciye giden yazışmalarda kullanılır.

export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s/g, '').toUpperCase();
  if (!/^TR\d{24}$/.test(iban)) return false;
  // ISO 13616: ilk dört karakter sona, harfler sayıya (A=10…), 97'ye bölümden kalan 1.
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

export function isValidTckn(n: string): boolean {
  if (!/^[1-9]\d{10}$/.test(n)) return false;
  const d = [...n].map(Number);
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = (d.slice(0, 10).reduce((a, b) => a + b, 0)) % 10;
  return d[9] === d10 && d[10] === d11;
}

const text = (max: number) => z.string().trim().max(max).default('');

export const companyProfileSchema = z
  .object({
    legalName: text(200),
    taxOffice: text(80),
    taxNumber: z.string().trim().default(''),
    mersisNo: z.string().trim().default(''),
    tradeRegistryNo: text(40),
    address: text(300),
    city: text(60),
    phone: text(30),
    email: z.union([z.literal(''), z.string().trim().email('Geçerli bir e-posta girin.')]).default(''),
    website: text(120),
    bank: text(80),
    iban: z.string().default('').transform((s) => s.replace(/\s/g, '').toUpperCase()),
    accountant: z
      .object({ name: text(120), email: z.union([z.literal(''), z.string().trim().email('Geçerli bir e-posta girin.')]).default(''), phone: text(30) })
      .default({}),
  })
  .superRefine((p, ctx) => {
    // Vergi no: tüzel kişide 10 haneli VKN, şahıs firmasında 11 haneli T.C. kimlik no.
    if (p.taxNumber && !/^\d{10}$/.test(p.taxNumber) && !isValidTckn(p.taxNumber))
      ctx.addIssue({ code: 'custom', path: ['taxNumber'], message: '10 haneli vergi no ya da geçerli 11 haneli T.C. kimlik no girin.' });
    if (p.mersisNo && !/^\d{16}$/.test(p.mersisNo)) ctx.addIssue({ code: 'custom', path: ['mersisNo'], message: 'MERSİS no 16 haneli olmalı.' });
    if (p.iban && !isValidIban(p.iban)) ctx.addIssue({ code: 'custom', path: ['iban'], message: 'IBAN geçersiz (TR ile başlayan 26 karakter, kontrol haneleri tutmalı).' });
  });

export type CompanyProfile = z.infer<typeof companyProfileSchema>;

/** Belge anteti için tek satır: unvan · vergi dairesi ve no · adres (boş alanlar atlanır). */
export function companyLetterhead(p: Pick<CompanyProfile, 'legalName' | 'taxOffice' | 'taxNumber' | 'address' | 'city'>): string {
  const tax = [p.taxOffice && `${p.taxOffice} V.D.`, p.taxNumber].filter(Boolean).join(' ');
  return [p.legalName, tax, [p.address, p.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
}

export const getCompanyProfile = defineAction({
  name: 'company.legalProfile',
  roles: ['admin', 'sales', 'accounting', 'tracking'],
  rateLimit: false,
  input: z.object({}),
  run: async (ctx) => {
    const [row] = await ctx.tx.select({ profile: companies.profile }).from(companies).where(eq(companies.id, ctx.companyId));
    if (!row) throw new AppError('NOT_FOUND', 'Firma bulunamadı.');
    return companyProfileSchema.parse(row.profile ?? {});
  },
});

export const updateCompanyProfile = defineAction({
  name: 'company.updateProfile',
  roles: ['admin'],
  input: companyProfileSchema,
  run: async (ctx, i) => {
    const [before] = await ctx.tx.select({ profile: companies.profile }).from(companies).where(eq(companies.id, ctx.companyId));
    if (!before) throw new AppError('NOT_FOUND', 'Firma bulunamadı.');
    await ctx.tx.update(companies).set({ profile: i }).where(eq(companies.id, ctx.companyId));
    await ctx.audit({ entity: 'company', entityId: ctx.companyId, before: before.profile, after: i });
    return i;
  },
});
