'use server';
import { logCall, setResponsible } from '@/modules/sales/server/actions';

export async function logCallAction(input: unknown) {
  return logCall(input);
}
export async function setResponsibleAction(input: unknown) {
  return setResponsible(input);
}
