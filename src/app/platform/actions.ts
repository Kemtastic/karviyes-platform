'use server';
import { createCompany, updateCompanySettings } from '@/core/platform/companies';
import { platformSetMemberActive } from '@/core/platform/insight';

export async function updateCompanySettingsAction(input: unknown) {
  return updateCompanySettings(input);
}

export async function createCompanyAction(input: unknown) {
  return createCompany(input);
}

export async function setMemberActiveAction(input: unknown) {
  return platformSetMemberActive(input);
}
