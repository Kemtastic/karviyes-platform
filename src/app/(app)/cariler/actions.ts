'use server';
import { archiveParty, createParty, searchParties, updateParty } from '@/core/parties/service';

export async function searchPartiesAction(input: unknown) {
  return searchParties(input);
}
export async function createPartyAction(input: unknown) {
  return createParty(input);
}
export async function updatePartyAction(input: unknown) {
  return updateParty(input);
}
export async function archivePartyAction(input: unknown) {
  return archiveParty(input);
}
