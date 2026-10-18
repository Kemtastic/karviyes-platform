'use server';
import { createStaff, updateStaff } from '@/core/users/service';

export async function createStaffAction(input: unknown) {
  return createStaff(input);
}
export async function updateStaffAction(input: unknown) {
  return updateStaff(input);
}
