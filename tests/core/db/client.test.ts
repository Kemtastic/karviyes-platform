import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, connectDb, rowsOf } from '@/core/db/client';

describe('veritabanı bağlantısı', () => {
  it('PGlite veri klasörünün üst dizinleri yoksa oluşturur', async () => {
    const base = mkdtempSync(join(tmpdir(), 'pglite-'));
    try {
      const url = `pglite://${join(base, 'ic', 'ice', 'db')}`;
      const db = await connectDb(url);
      expect(rowsOf<{ v: number }>(await db.execute(sql`select 1 as v`))[0]?.v).toBe(1);
      await closeDb(url);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('PGlite tek örnek', () => {
  it('aynı adres için süreç içinde aynı bağlantıyı döndürür (aynı klasörü iki kez açıp bozmaz)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'pglite-'));
    try {
      const url = `pglite://${join(base, 'db')}`;
      const [a, b] = await Promise.all([connectDb(url), connectDb(url)]);
      expect(a).toBe(b);
      await closeDb(url);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('PGlite otomatik göç', () => {
  it('autoMigrate ile açılan dosya veritabanında tablolar hazırdır', async () => {
    const base = mkdtempSync(join(tmpdir(), 'pglite-'));
    try {
      const url = `pglite://${join(base, 'db')}`;
      const db = await connectDb(url, { autoMigrate: true });
      const rows = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from information_schema.tables where table_name = 'companies'`));
      expect(rows[0]?.n).toBe(1);
      await closeDb(url);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
