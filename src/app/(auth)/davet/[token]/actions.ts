'use server';
import { getAuth, getCompanyId } from '@/core/auth/session';
import { getDb } from '@/core/db/client';
import { acceptInvite } from '@/core/users/service';

export async function acceptInviteAction(input: { token: string; password: string }) {
  const companyId = await getCompanyId();
  const { dataDbFor } = await import('@/core/db/router');
  return acceptInvite(input, { auth: await getAuth(), db: await dataDbFor(companyId, await getDb()), companyId });
}
