import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { rowsOf } from '@/core/db/client';
import { companies } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { definePlatformAction } from './action';

// Firma verisinin tamamı (sözleşme sonu teslim, taşıma, KVKK erişim talebi). Firma kapsamındaki her tablo
// satır güvenliği altında okunur; yeni modül tabloları kendiliğinden dahil olur. Yüklenen dosyaların içeriği dahil değildir.

type Row = Record<string, unknown>;

// JSON'a sığmayan değerler: bigint (kuruş) metne, tarih ISO biçimine. Bağlantı özetleri (davet, mutabakat) dosyaya girmez.
const SECRET = /token_hash$/;
function plain(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (!SECRET.test(k)) out[k] = typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString() : v;
  return out;
}

export const exportCompanyData = definePlatformAction({
  name: 'platform.exportCompanyData',
  rateLimit: false,
  input: z.object({ companyId: z.string().uuid() }),
  run: async (ctx, i) => {
    const [company] = await ctx.db.select().from(companies).where(eq(companies.id, i.companyId));
    if (!company) throw new AppError('NOT_FOUND', 'Firma bulunamadı.');
    const tables = await ctx.inCompany(i.companyId, async (tx, audit) => {
      const names = rowsOf<{ table_name: string }>(
        await tx.execute(sql`
          select distinct c.table_name from information_schema.columns c
          join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
          where c.table_schema = 'public' and c.column_name = 'company_id' order by c.table_name`),
      ).map((r) => r.table_name);
      const out: Record<string, Row[]> = {};
      for (const name of names) out[name] = rowsOf<Row>(await tx.execute(sql`select * from ${sql.identifier(name)}`)).map(plain);
      await audit({ entity: 'company', entityId: i.companyId, after: { tables: names.length, rows: Object.values(out).reduce((n, r) => n + r.length, 0) } });
      return out;
    });
    await ctx.log({ targetCompanyId: i.companyId, detail: { tables: Object.keys(tables).length } });
    const { dataUrlEnc: _secret, ...safeCompany } = company;
    return { format: 'karviyes-firma-verisi/1', exportedAt: new Date().toISOString(), company: plain(safeCompany as Row), tables };
  },
});
