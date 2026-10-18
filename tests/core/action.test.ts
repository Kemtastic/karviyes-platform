import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestDb, type TestDb } from '../helpers/db';
import { defineAction, type ActionRuntime } from '@/core/action';
import { withCompany } from '@/core/db/scope';
import { auditLog } from '@/core/db/schema';
import { parseInstallConfig } from '@/core/install-config';
import type { CurrentUser } from '@/core/auth/session';

let t: TestDb;
const cfg = parseInstallConfig({ company: { name: 'K', slug: 'k' }, modules: ['orders', 'production'], sector: 'bags' });
const user = (companyId: string, roles: CurrentUser['roles'], userId = 'u1'): CurrentUser => ({
  userId, email: 'x@example.com', name: 'X', companyId, membershipId: 'm1', roles, kind: 'person', staffId: null, twoFactorEnabled: true,
});
const rt = (u: CurrentUser | null): ActionRuntime => ({ user: u, db: t.db, cfg });
const audits = () => withCompany(t.companyA, (tx) => tx.select().from(auditLog), t.db);

const echo = defineAction({
  name: 'test.echo',
  module: 'orders',
  roles: ['admin'],
  input: z.object({ ad: z.string().min(2) }),
  audit: (i) => ({ entity: 'test', entityId: i.ad, after: i }),
  run: async (_ctx, i) => ({ merhaba: i.ad }),
});

const boom = defineAction({ name: 'test.boom', roles: ['admin'], input: z.object({}), run: async () => { throw new Error('db patladı'); } });

const auditThenFail = defineAction({
  name: 'test.auditThenFail',
  roles: ['admin'],
  input: z.object({}),
  run: async (ctx) => {
    await ctx.audit({ entity: 'test', entityId: 'yarim', after: {} });
    throw new Error('sonra hata');
  },
});

beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.close(); });

describe('defineAction', () => {
  it('oturumsuz çağrı UNAUTHENTICATED', async () => {
    expect(await echo({ ad: 'Ali' }, rt(null))).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  });

  it('rolü olmayan kullanıcı FORBIDDEN alır, audit yazılmaz', async () => {
    const before = (await audits()).length;
    expect(await echo({ ad: 'Ali' }, rt(user(t.companyA, ['printing'])))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect((await audits()).length).toBe(before);
  });

  it('kapalı modül MODULE_DISABLED', async () => {
    const only = parseInstallConfig({ company: { name: 'K', slug: 'k' }, modules: ['orders'], sector: 'bags' });
    const prodAction = defineAction({ name: 'test.prod', module: 'production', roles: ['admin'], input: z.object({}), run: async () => 1 });
    expect(await prodAction({}, { user: user(t.companyA, ['admin']), db: t.db, cfg: only })).toMatchObject({ ok: false, code: 'MODULE_DISABLED' });
  });

  it('geçersiz girdi Türkçe alan hatasıyla VALIDATION', async () => {
    const r = await echo({ ad: 'A' }, rt(user(t.companyA, ['admin'])));
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION' });
    if (r.ok) throw new Error('beklenmedi');
    expect(r.fieldErrors?.ad).toMatch(/en az 2/i);
  });

  it('beklenmeyen hata iç ayrıntıyı sızdırmaz', async () => {
    const r = await boom({}, rt(user(t.companyA, ['admin'])));
    expect(r).toMatchObject({ ok: false, code: 'INTERNAL', message: 'Beklenmeyen bir hata oluştu.' });
    if (r.ok) throw new Error('beklenmedi');
    expect(r.errorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(r)).not.toContain('db patladı');
  });

  it('başarılı çağrı sonucu döner ve aynı işlemde audit yazar', async () => {
    const r = await echo({ ad: 'Ayşe' }, rt(user(t.companyA, ['admin'])));
    expect(r).toEqual({ ok: true, data: { merhaba: 'Ayşe' } });
    expect((await audits()).some((a) => a.entityId === 'Ayşe' && a.action === 'test.echo' && a.actorUserId === 'u1')).toBe(true);
  });

  it('hata olursa aynı işlemdeki audit kaydı da geri alınır', async () => {
    await auditThenFail({}, rt(user(t.companyA, ['admin'])));
    expect((await audits()).some((a) => a.entityId === 'yarim')).toBe(false);
  });

  it('aynı kullanıcı dakikada 120 yazmadan sonra RATE_LIMITED alır', async () => {
    const u = user(t.companyA, ['admin'], 'hizli-kullanici');
    for (let i = 0; i < 120; i++) {
      const r = await echo({ ad: 'Yük' }, rt(u));
      expect(r.ok).toBe(true);
    }
    expect(await echo({ ad: 'Yük' }, rt(u))).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
  });
});
