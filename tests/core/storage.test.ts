import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db';
import { runtime, testUser } from '../helpers/runtime';
import { createFsStorage } from '@/core/storage';
import { readStoredFile, storeFile } from '@/core/files/service';

let t: TestDb;
let dir: string;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = new TextEncoder().encode('%PDF-1.7\n...');
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

beforeAll(async () => { t = await createTestDb(); dir = mkdtempSync(join(tmpdir(), 'depo-')); });
afterAll(async () => { await t.close(); rmSync(dir, { recursive: true, force: true }); });

const admin = () => runtime(t, testUser(t.companyA, ['admin']));
const storage = () => createFsStorage(dir);

describe('dosya deposu', () => {
  it('PNG kabul edilir ve aynı firmadan okunur', async () => {
    const r = await storeFile({ name: 'logo.png', bytes: PNG }, admin(), { storage: storage() });
    if (!r.ok) throw new Error(r.message);
    expect(r.data.contentType).toBe('image/png');
    const read = await readStoredFile(r.data.id, admin(), { storage: storage() });
    expect(read.ok && Array.from(read.data.bytes)).toEqual(Array.from(PNG));
  });

  it('SVG/HTML reddedilir', async () => {
    expect(await storeFile({ name: 'logo.svg', bytes: SVG }, admin(), { storage: storage() })).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('uzantıya değil içeriğe bakılır', async () => {
    const r = await storeFile({ name: 'resim.png', bytes: PDF }, admin(), { storage: storage() });
    expect(r.ok && r.data.contentType).toBe('application/pdf');
  });

  it('10 MB üstü reddedilir', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PNG);
    expect(await storeFile({ name: 'buyuk.png', bytes: big }, admin(), { storage: storage() })).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('başka firma dosyayı okuyamaz', async () => {
    const r = await storeFile({ name: 'logo.png', bytes: PNG }, admin(), { storage: storage() });
    if (!r.ok) throw new Error(r.message);
    const other = await readStoredFile(r.data.id, runtime(t, testUser(t.companyB, ['admin'])), { storage: storage() });
    expect(other).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
