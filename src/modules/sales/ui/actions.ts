'use server';
import { logCall, setPriority, setResponsible, transferCustomers } from '@/modules/sales/server/actions';

export async function logCallAction(input: unknown) {
  return logCall(input);
}
export async function setResponsibleAction(input: unknown) {
  return setResponsible(input);
}
export async function setPriorityAction(input: unknown) {
  return setPriority(input);
}
export async function transferCustomersAction(input: unknown) {
  return transferCustomers(input);
}
