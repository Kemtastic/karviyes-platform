'use server';
import { createDeviceAccount, deactivateMember, inviteUser, updateMemberRoles } from '@/core/users/service';

export async function inviteUserAction(input: unknown) {
  return inviteUser(input);
}
export async function updateRolesAction(input: unknown) {
  return updateMemberRoles(input);
}
export async function deactivateMemberAction(input: unknown) {
  return deactivateMember(input);
}
export async function createDeviceAction(input: unknown) {
  return createDeviceAccount(input);
}
