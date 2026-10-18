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

  it('dosya birimi uygulama kullanıcısına ait (root olmayan kullanıcı yazabilir)', () => {
    expect(readFileSync('Dockerfile', 'utf8')).toContain('mkdir -p /files && chown app:app /files');
  });

  it('geri yükleme servisi dosyaları yazılabilir bağlar ve gizli anahtarı dışarıdan alır', () => {
    const restore = compose.services.restore as Service & { volumes?: string[]; profiles?: string[] };
    expect(restore?.profiles).toEqual(['restore']);
    expect(restore?.volumes).toEqual(expect.arrayContaining(['files:/files']));
    expect(restore?.volumes?.some((v) => v.endsWith(':/anahtar/age.key:ro'))).toBe(true);
  });

  it('yedek betiği her adımın başarısını ayrı denetler (yarım arşiv üretmez)', () => {
    const sh = readFileSync('deploy/backup/yedekle.sh', 'utf8');
    // tar çıktısı doğrudan age'e borulanmaz (POSIX sh'ta pipefail yok, tar hatası gizlenir).
    expect(sh.split('\n').some((l) => l.includes('tar ') && l.includes('| age'))).toBe(false);
    expect(sh).toContain('mv "$out.tmp" "$out"');
  });

  it('uygulama ve göç aracı süper kullanıcıyla değil, ayrı uygulama rolüyle bağlanır; rol veritabanı ilk kurulurken oluşur', () => {
    const env = (name: string) => (compose.services[name] as Service & { environment?: Record<string, string> }).environment ?? {};
    for (const name of ['app', 'tools']) expect(env(name).DATABASE_URL).toMatch(/^postgres:\/\/uretim_app:/);
    const db = compose.services.db as Service & { volumes?: string[]; environment?: Record<string, string> };
    expect(db.volumes).toEqual(expect.arrayContaining(['./db-init:/docker-entrypoint-initdb.d:ro']));
    expect(db.environment?.APP_DB_PASSWORD).toBeTruthy();
  });

  it('geri yükleme tablo sahipliğini (uygulama rolü) korur; aksi hâlde sonraki göçler tabloları değiştiremez', () => {
    const sh = readFileSync('deploy/backup/geri-yukle.sh', 'utf8');
    expect(sh).toContain('pg_restore');
    expect(sh).not.toContain('--no-owner');
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
