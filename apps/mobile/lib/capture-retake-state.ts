/**
 * Worker capture retake state — preserved-slot tracking across photo retakes.
 *
 * @derives(master-plan §G) — worker capture flow
 */
import type { PhotoPhase } from '@axhy/shared-schema';

const preservedSlotsByPhase = new Map<string, ReadonlyArray<number>>();

function keyOf(visitId: string, phase: PhotoPhase): string {
  return `${visitId}:${phase}`;
}

export function setRetakePreservedSlots(
  visitId: string,
  phase: PhotoPhase,
  slots: ReadonlyArray<number>,
): void {
  preservedSlotsByPhase.set(keyOf(visitId, phase), [...slots]);
}

export function consumeRetakePreservedSlots(
  visitId: string,
  phase: PhotoPhase,
): ReadonlyArray<number> {
  const key = keyOf(visitId, phase);
  const slots = preservedSlotsByPhase.get(key) ?? [];
  preservedSlotsByPhase.delete(key);
  return slots;
}
