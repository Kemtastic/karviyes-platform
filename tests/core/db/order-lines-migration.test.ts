import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

// 0021 göçü gerçek müşteri verisini taşır: veritabanı 0020'ye kadar kurulur, eski biçimde kayıt yazılır, sonra 0021 uygulanır.
let client: PGlite;
let dir: string;
const rows = async <T>(q: string) => (await client.query<T>(q)).rows;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'goc-'));
  cpSync('drizzle', dir, { recursive: true });
  const journalPath = join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] };
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.filter((e) => e.tag < '0021') }));

  client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: dir });
  await client.exec(`
    INSERT INTO companies (id, name, slug) VALUES ('00000000-0000-4000-8000-000000000001', 'A', 'a');
    INSERT INTO parties (id, company_id, kind, name, search_key) VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'customer', 'Müşteri', 'musteri');
    INSERT INTO orders (id, company_id, no, party_id, order_date, product, quantity, unit_price, vat_rate, currency, total_minor, packaging, department_notes, status, produced_qty, shipped_qty, created_by)
    VALUES
      ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'S-2026-000001', '00000000-0000-4000-8000-0000000000a1', '2026-10-01', '{"width":45}', 2222, '5.0000', '10.00', 'TRY', 1222100, '{"type":"sack","capacity":1000,"packages":3}', '{"printing":"Logo"}', 'ready_to_invoice', 2180, 0, 'u'),
      ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', 'S-2026-000002', '00000000-0000-4000-8000-0000000000a1', '2026-10-02', '{"width":40}', 1000, '4.0000', '10.00', 'TRY', 440000, '{"type":"none","capacity":0,"packages":0}', '{}', 'cancelled', 0, 0, 'u'),
      ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-000000000001', 'S-2026-000003', '00000000-0000-4000-8000-0000000000a1', '2026-10-03', '{"width":30}', 500, '3.0000', '20.00', 'TRY', 180000, '{"type":"box","capacity":250,"packages":2}', '{}', 'draft', 0, 0, 'u'),
      ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-000000000001', 'S-2026-000004', '00000000-0000-4000-8000-0000000000a1', '2026-10-04', '{"width":30}', 500, '3.0000', '20.00', 'TRY', 180000, '{"type":"none","capacity":0,"packages":0}', '{}', 'invoiced', 500, 500, 'u'),
      ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-000000000001', 'S-2026-000005', '00000000-0000-4000-8000-0000000000a1', '2026-10-05', '{"width":30}', 500, '3.0000', '20.00', 'TRY', 180000, '{"type":"none","capacity":0,"packages":0}', '{}', 'in_production', 480, 0, 'u');
    INSERT INTO jobs (id, company_id, order_id, no, stage) VALUES
      ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'S-2026-000001', 'completed'),
      ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b4', 'S-2026-000004', 'shipped'),
      ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b5', 'S-2026-000005', 'review');
  `);
  await migrate(db, { migrationsFolder: 'drizzle' });
});
afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('0021 sipariş satırları göçü', () => {
  it('her sipariş tek satır olur; ürün, adet, fiyat, tutar, paket ve notlar taşınır; durum işten türetilir', async () => {
    const lines = await rows<{ no: string; line_no: number; quantity: number; unit_price: string; total_minor: string; status: string; produced_qty: number; department_notes: unknown; packaging: { packages: number } }>(
      `SELECT o.no, l.line_no, l.quantity, l.unit_price, l.total_minor::text, l.status, l.produced_qty, l.department_notes, l.packaging FROM order_lines l JOIN orders o ON o.id = l.order_id ORDER BY o.no`,
    );
    expect(lines.map((l) => [l.no, l.line_no, l.quantity, l.unit_price, l.total_minor, l.status, l.produced_qty])).toEqual([
      ['S-2026-000001', 1, 2222, '5.0000', '1222100', 'done', 2180],
      ['S-2026-000002', 1, 1000, '4.0000', '440000', 'cancelled', 0],
      ['S-2026-000003', 1, 500, '3.0000', '180000', 'open', 0],
      ['S-2026-000004', 1, 500, '3.0000', '180000', 'done', 500],
      ['S-2026-000005', 1, 500, '3.0000', '180000', 'in_production', 480],
    ]);
    expect(lines[0]!.department_notes).toEqual({ printing: 'Logo' });
    expect(lines[0]!.packaging.packages).toBe(3);
  });

  it('iş satıra bağlanır ve numarası "/1" alır', async () => {
    const jobs = await rows<{ no: string; line_no: number }>(`SELECT j.no, l.line_no FROM jobs j JOIN order_lines l ON l.id = j.order_line_id ORDER BY j.no`);
    expect(jobs).toEqual([{ no: 'S-2026-000001/1', line_no: 1 }, { no: 'S-2026-000004/1', line_no: 1 }, { no: 'S-2026-000005/1', line_no: 1 }]);
  });

  it('zorunlu satır güvenliği göçten sonra yeniden açıktır (yeni tablo dahil)', async () => {
    const forced = await rows<{ relname: string; relforcerowsecurity: boolean }>(`SELECT relname, relforcerowsecurity FROM pg_class WHERE relname IN ('orders', 'jobs', 'order_lines') ORDER BY relname`);
    expect(forced.map((r) => [r.relname, r.relforcerowsecurity])).toEqual([['jobs', true], ['order_lines', true], ['orders', true]]);
  });
});

describe('iş ile satır tutarlılığı', () => {
  it('iş başka siparişin satırına bağlanamaz', async () => {
    const [other] = await rows<{ id: string }>(`SELECT id FROM order_lines WHERE order_id = '00000000-0000-4000-8000-0000000000b3'`);
    await expect(client.query(`UPDATE jobs SET order_line_id = '${other!.id}' WHERE id = '00000000-0000-4000-8000-0000000000c1'`)).rejects.toThrow(/jobs_order_line_fk/);
  });
});
