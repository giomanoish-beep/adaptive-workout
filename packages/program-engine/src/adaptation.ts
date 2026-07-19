import type {
  ActiveAdaptation,
  AdaptedPrescription,
  ProgramExerciseCandidate,
  ProgramPrescription,
} from './contracts.js';

export function adaptPrescription(
  base: ProgramPrescription,
  adaptation: ActiveAdaptation,
  catalog: readonly ProgramExerciseCandidate[],
): AdaptedPrescription {
  if (!adaptation.affectedMovementPatterns.includes(base.movementPattern)) {
    return { base, effective: base, adapted: false, reasonCodes: [] };
  }
  if (adaptation.severity === 'severe') {
    return {
      base,
      effective: null,
      adapted: true,
      reasonCodes: ['stop_training_seek_medical_advice'],
    };
  }
  const replacement = catalog
    .filter((item) => item.id !== base.exerciseId)
    .filter((item) => !adaptation.affectedMovementPatterns.includes(item.movementPattern))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!replacement) {
    return { base, effective: null, adapted: true, reasonCodes: ['restricted_no_substitute'] };
  }
  return {
    base,
    effective: {
      ...base,
      exerciseId: replacement.id,
      exerciseName: replacement.name,
      movementPattern: replacement.movementPattern,
      sets: adaptation.severity === 'moderate' ? Math.max(1, base.sets - 1) : base.sets,
      recommendationReason: 'Temporary training adaptation; the base prescription is unchanged.',
    },
    adapted: true,
    reasonCodes: ['active_discomfort_restriction', 'movement_substitution'],
  };
}

export function removeAdaptation(adapted: AdaptedPrescription): ProgramPrescription {
  return adapted.base;
}
