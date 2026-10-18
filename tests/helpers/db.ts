import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { companies, schema } from '@/core/db/schema';
import type { Db } from '@/core/db/client';

export type TestDb = { db: Db; companyA: string; companyB: string; close(): Promise<void> };

// Her test dosyası için bellek içi, göçleri uygulanmış, iki firmalı veritabanı.
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });
  const [a, b] = await db
    .insert(companies)
    .values([{ name: 'Firma A', slug: 'firma-a' }, { name: 'Firma B', slug: 'firma-b' }])
    .returning({ id: companies.id });
  if (!a || !b) throw new Error('Test firmaları oluşturulamadı');
  return { db: db as unknown as Db, companyA: a.id, companyB: b.id, close: () => client.close() };
}

// Drizzle, Postgres hatasını "Failed query" ile sarmalar; asıl mesaj cause içindedir.
export async function dbError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    return `${err.message ?? ''} ${err.cause?.message ?? ''}`;
  }
  return 'HATA BEKLENİYORDU AMA İŞLEM BAŞARILI OLDU';
}
