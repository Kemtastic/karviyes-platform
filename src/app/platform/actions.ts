'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createCompany, updateCompanySettings } from '@/core/platform/companies';
import { platformSetMemberActive } from '@/core/platform/insight';
import { endSupportView, startSupportView, SUPPORT_COOKIE } from '@/core/platform/support';

export async function updateCompanySettingsAction(input: unknown) {
  return updateCompanySettings(input);
}

export async function createCompanyAction(input: unknown) {
  return createCompany(input);
}

export async function setMemberActiveAction(input: unknown) {
  return platformSetMemberActive(input);
}

export async function startSupportViewAction(input: unknown) {
  const r = await startSupportView(input);
  if (r.ok) {
    (await cookies()).set(SUPPORT_COOKIE, r.data.id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: r.data.minutes * 60 });
  }
  return r;
}

export async function endSupportViewAction() {
  const jar = await cookies();
  const id = jar.get(SUPPORT_COOKIE)?.value;
  if (id) await endSupportView({ id });
  jar.delete(SUPPORT_COOKIE);
  redirect('/platform');
}
