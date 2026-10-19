import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../helpers/db';
import { createAuth, createUserWithPassword, type Auth } from '@/core/auth/auth';
import { addMembership, resolveCurrentUser } from '@/core/auth/session';

let t: TestDb;
let auth: Auth;

async function cookieFor(email: string): Promise<Headers> {
  const res = await auth.handler(new Request('http://localhost:3000/api/auth/sign-in/email', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', 'x-forwarded-for': '10.1.0.1' },
    body: JSON.stringify({ email, password: 'GucluParola-2026!' }),
  }));
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  return new Headers({ cookie });
}

beforeAll(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { secret: 's'.repeat(32), baseURL: 'http://localhost:3000', issuer: 'Test' });
  const a = await createUserWithPassword(auth, { email: 'a@example.com', name: 'A', password: 'GucluParola-2026!' });
  await createUserWithPassword(auth, { email: 'uyesiz@example.com', name: 'Üyesiz', password: 'GucluParola-2026!' });
  await addMembership(t.db, t.companyA, { userId: a.id, roles: ['admin'], kind: 'person' });
});
afterAll(async () => { await t.close(); });

describe('oturumdaki kullanıcı', () => {
  it('oturumsuz istek null döner', async () => {
    expect(await resolveCurrentUser(auth, t.db, t.companyA, new Headers())).toBeNull();
  });

  it('üyeliği olan kullanıcı rolleriyle döner', async () => {
    const u = await resolveCurrentUser(auth, t.db, t.companyA, await cookieFor('a@example.com'));
    expect(u).toMatchObject({ email: 'a@example.com', companyId: t.companyA, roles: ['admin'], kind: 'person', twoFactorEnabled: false });
  });

  it('bu firmada üyeliği olmayan kullanıcı null döner', async () => {
    expect(await resolveCurrentUser(auth, t.db, t.companyA, await cookieFor('uyesiz@example.com'))).toBeNull();
  });

  it('merkez panelden askıya alınan firmanın kullanıcısı oturum açmış sayılmaz', async () => {
    const { companySettings } = await import('@/core/db/schema');
    const { withCompany } = await import('@/core/db/scope');
    const { eq } = await import('drizzle-orm');
    const headers = await cookieFor('a@example.com');
    await withCompany(t.companyA, (tx) => tx.insert(companySettings).values({ companyId: t.companyA, status: 'suspended' }), t.db);
    expect(await resolveCurrentUser(auth, t.db, t.companyA, headers)).toBeNull();
    await withCompany(t.companyA, (tx) => tx.update(companySettings).set({ status: 'active' }).where(eq(companySettings.companyId, t.companyA)), t.db);
    expect(await resolveCurrentUser(auth, t.db, t.companyA, headers)).not.toBeNull();
  });

  it('başka firmanın kapsamında kullanıcı görünmez', async () => {
    expect(await resolveCurrentUser(auth, t.db, t.companyB, await cookieFor('a@example.com'))).toBeNull();
  });
});
