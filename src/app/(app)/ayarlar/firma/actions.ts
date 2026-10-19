'use server';
import { updateCompanyProfile } from '@/core/company/profile';
import { updateCompanyBranding } from '@/core/company/service';

export async function updateBrandingAction(input: unknown) {
  return updateCompanyBranding(input);
}

export async function updateProfileAction(input: unknown) {
  return updateCompanyProfile(input);
}
