'use server';
import * as a from '../server/actions';
import { departmentQueue } from '../server/queries';
import { createPlate } from '../server/plates';

export async function startProductionAction(input: unknown) { return a.startProduction(input); }
export async function addFabricAction(input: unknown) { return a.addFabricRolls(input); }
export async function reserveFabricAction(input: unknown) { return a.reserveFabric(input); }
export async function sendToStageAction(input: unknown) { return a.sendToStage(input); }
export async function startStageAction(input: unknown) { return a.startStage(input); }
export async function finishStageAction(input: unknown) { return a.finishStage(input); }
export async function toRepairAction(input: unknown) { return a.sendToRepair(input); }
export async function toTurningAction(input: unknown) { return a.sendToTurning(input); }
export async function approveAction(input: unknown) { return a.approveReview(input); }
export async function returnFromReviewAction(input: unknown) { return a.returnFromReview(input); }
export async function shipAction(input: unknown) { return a.shipJob(input); }
export async function cancelJobAction(input: unknown) { return a.cancelJob(input); }
export async function reopenReviewAction(input: unknown) { return a.reopenReview(input); }
export async function correctQtyAction(input: unknown) { return a.correctProducedQty(input); }
export async function queueAction(input: { stage: string }) { return departmentQueue(input); }
export async function createPlateAction(input: unknown) { return createPlate(input); }
