'use server';
import { updateCompanySettings } from '@/core/platform/companies';

export async function updateCompanySettingsAction(input: unknown) {
  return updateCompanySettings(input);
}
