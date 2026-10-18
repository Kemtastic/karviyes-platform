import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import { getEnv } from '@/core/env';
import { schema, type Schema } from './schema';

export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

let instance: Promise<Db> | undefined;

// DATABASE_URL "pglite://memory" veya "pglite://<dizin>" ise gömülü PGlite, aksi hâlde Postgres havuzu.
async function connect(url: string): Promise<Db> {
  if (url.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const target = url.slice('pglite://'.length);
    const client = target === 'memory' ? new PGlite() : new PGlite(target);
    return drizzle(client, { schema }) as unknown as Db;
  }
  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  return drizzle(new Pool({ connectionString: url, max: 10 }), { schema }) as unknown as Db;
}

export function getDb(): Promise<Db> {
  instance ??= connect(getEnv().DATABASE_URL);
  return instance;
}

// Göçler sahip kullanıcıyla (uygulama rolüyle değil) çalışır.
export async function migrateDb(db: Db, url: string, migrationsFolder = 'drizzle'): Promise<void> {
  if (url.startsWith('pglite://')) {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder });
    return;
  }
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder });
}

// PGlite ve node-postgres ham sorgu sonuçlarını aynı { rows } biçiminde döndürür.
export function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}
