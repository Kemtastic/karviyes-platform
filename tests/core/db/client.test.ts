import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { connectDb, rowsOf } from '@/core/db/client';

describe('veritabanı bağlantısı', () => {
  it('PGlite veri klasörünün üst dizinleri yoksa oluşturur', async () => {
    const base = mkdtempSync(join(tmpdir(), 'pglite-'));
    try {
      const db = await connectDb(`pglite://${join(base, 'ic', 'ice', 'db')}`);
      expect(rowsOf<{ v: number }>(await db.execute(sql`select 1 as v`))[0]?.v).toBe(1);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
