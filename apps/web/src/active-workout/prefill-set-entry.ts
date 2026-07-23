import type { PlannedSet } from './active-workout-state';
import { emptySetEntryInput, type SetEntryInput } from './active-workout-validation';

export function prefillSetEntry(plannedSet: PlannedSet | undefined): SetEntryInput {
  if (plannedSet?.loadKind === 'external_numeric' && plannedSet.suggestedLoadKg !== null) {
    return { ...emptySetEntryInput, weight: String(plannedSet.suggestedLoadKg) };
  }
  return emptySetEntryInput;
}
