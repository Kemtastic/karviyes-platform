'use server';
import { getAuth, getCompanyId } from '@/core/auth/session';
import { getDb } from '@/core/db/client';
import { acceptInvite } from '@/core/users/service';

export async function acceptInviteAction(input: { token: string; password: string }) {
  return acceptInvite(input, { auth: await getAuth(), db: await getDb(), companyId: await getCompanyId() });
}
