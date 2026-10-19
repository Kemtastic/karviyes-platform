// Veritabanının tablo tablo JSON dökümü (yedek). Kullanım:
//   npx tsx --env-file=.env.kurulum scripts/yedek-al.ts <hedef klasör>
// Bağlantı adresi yalnızca ortam değişkeninden okunur, ekrana yazılmaz. Döküm parola özetleri ve 2FA
// gizli anahtarları içerir: hedef klasörü yalnız güvenli yerde tutun, paylaşmayın.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const target = process.argv[2];
if (!target) throw new Error('Hedef klasör verin: scripts/yedek-al.ts <klasör>');
const url = process.env.DATABASE_URL;
if (!url || url.startsWith('pglite://')) throw new Error('DATABASE_URL bir Postgres adresi olmalı.');

const pool = new pg.Pool({ connectionString: url, max: 2 });
mkdirSync(target, { recursive: true });
const tables = await pool.query<{ schema: string; name: string }>(
  "select table_schema as schema, table_name as name from information_schema.tables where table_type = 'BASE TABLE' and table_schema in ('public', 'drizzle') order by 1, 2",
);
const summary: Record<string, number> = {};
for (const t of tables.rows) {
  const rows = await pool.query(`select * from "${t.schema}"."${t.name}"`);
  writeFileSync(join(target, `${t.schema}.${t.name}.json`), JSON.stringify(rows.rows, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 1));
  summary[`${t.schema}.${t.name}`] = rows.rowCount ?? 0;
}
writeFileSync(join(target, '_ozet.json'), JSON.stringify({ at: new Date().toISOString(), tables: summary }, null, 2));
await pool.end();
console.log(`Yedek alındı: ${tables.rows.length} tablo, ${Object.values(summary).reduce((a, b) => a + b, 0)} satır.`);
