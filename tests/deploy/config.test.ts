import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { createTestDb, type TestDb } from '../helpers/db';
import { healthCheck } from '@/core/health';

type Service = { ports?: unknown[]; user?: string; read_only?: boolean; image?: string; build?: unknown };
const compose = parse(readFileSync('deploy/docker-compose.yml', 'utf8')) as { services: Record<string, Service> };

describe('VPS paketi', () => {
  it('veritabanı portu dışarı açılmaz', () => {
    expect(compose.services.db?.ports).toBeUndefined();
  });

  it('uygulama root olmayan kullanıcıyla ve salt okunur dosya sistemiyle çalışır', () => {
    const app = compose.services.app!;
    expect(app.read_only).toBe(true);
    expect(readFileSync('Dockerfile', 'utf8')).toMatch(/^USER app$/m);
  });

  it('yalnızca ters vekil (Caddy) 80/443 açar', () => {
    const exposed = Object.entries(compose.services).filter(([, s]) => s.ports?.length).map(([n]) => n);
    expect(exposed).toEqual(['caddy']);
  });

  it('örnek ortam dosyasında gerçek değer yok', () => {
    const lines = readFileSync('deploy/kurulum.env.example', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'));
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) {
      const value = line.slice(line.indexOf('=') + 1).trim();
      expect([value === '', value.startsWith('degistir'), /^(postgres:\/\/|https:\/\/|http:\/\/|s3|fs|app_user|\$\{)/.test(value)].some(Boolean)).toBe(true);
    }
  });
});

describe('sağlık ucu', () => {
  let t: TestDb;
  beforeAll(async () => { t = await createTestDb(); });
  afterAll(async () => { await t.close(); });

  it('yalnızca ok ve db alanlarını döner', async () => {
    expect(await healthCheck(t.db)).toEqual({ ok: true, db: true });
  });
});
