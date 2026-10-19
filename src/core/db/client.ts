import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import { getEnv } from '@/core/env';
import { schema, type Schema } from './schema';

export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

let instance: Promise<Db> | undefined;

// Next geliştirme sunucusu modülleri birden çok kez yükleyebilir. PGlite tek bağlantılıdır ve aynı klasörü
// iki örnekle açmak veritabanını bozar; bu yüzden bağlantılar süreç genelinde adres başına tektir.
const shared = globalThis as unknown as { __dbConnections?: Map<string, Promise<Db>> };
const connections = (shared.__dbConnections ??= new Map());

// DATABASE_URL "pglite://memory" veya "pglite://<dizin>" ise gömülü PGlite, aksi hâlde Postgres havuzu.
// "pglite://memory" her çağrıda yeni, boş bir veritabanıdır (testler için).
export function connectDb(url: string, opts: { autoMigrate?: boolean } = {}): Promise<Db> {
  if (url === 'pglite://memory') return open(url);
  let connection = connections.get(url);
  if (!connection) {
    connection = open(url).then(async (db) => {
      if (opts.autoMigrate) await migrateDb(db, url);
      return db;
    });
    connections.set(url, connection);
    connection.catch(() => { if (connections.get(url) === connection) connections.delete(url); });
  }
  return connection;
}

async function open(url: string): Promise<Db> {
  if (url.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const target = url.slice('pglite://'.length);
    if (target !== 'memory') {
      const { mkdirSync } = await import('node:fs');
      const { dirname } = await import('node:path');
      mkdirSync(dirname(target), { recursive: true });
    }
    const client = target === 'memory' ? new PGlite() : new PGlite(target);
    return drizzle(client, { schema }) as unknown as Db;
  }
  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  return drizzle(new Pool({ connectionString: url, max: 10 }), { schema }) as unknown as Db;
}

export function getDb(): Promise<Db> {
  const url = getEnv().DATABASE_URL;
  // Gömülü PGlite (geliştirme/demo) açılırken göçleri kendisi uygular: ayrı bir süreç aynı klasörü açıp bozmasın.
  instance ??= connectDb(url, { autoMigrate: url.startsWith('pglite://') });
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

// Paylaşılan bağlantıyı kapatır (testler ve kapanış için).
export async function closeDb(url: string): Promise<void> {
  const connection = connections.get(url);
  connections.delete(url);
  if (!connection) return;
  const client = ((await connection) as unknown as { $client?: { waitReady?: Promise<void>; close?: () => Promise<void>; end?: () => Promise<void> } }).$client;
  // PGlite hazır olmadan kapatılırsa takılır.
  if (client?.waitReady) await client.waitReady;
  if (client?.close) await client.close();
  else if (client?.end) await client.end();
}
