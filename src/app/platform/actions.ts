'use server';
import { createCompany, updateCompanySettings } from '@/core/platform/companies';

export async function updateCompanySettingsAction(input: unknown) {
  return updateCompanySettings(input);
}

export async function createCompanyAction(input: unknown) {
  return createCompany(input);
}
