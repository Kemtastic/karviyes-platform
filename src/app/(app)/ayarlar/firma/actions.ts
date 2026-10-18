'use server';
import { updateCompanyBranding } from '@/core/company/service';

export async function updateBrandingAction(input: unknown) {
  return updateCompanyBranding(input);
}
