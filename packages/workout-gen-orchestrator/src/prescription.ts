/**
 * Deterministic prescription layer for rep ranges, target RIR, and rest seconds.
 *
 * This is the smallest authoritative layer that derives per-exercise prescriptions
 * from the training goal rule profile and exercise characteristics.
 *
 * Rules are versioned and explicitly documented. No AI, no randomization.
 */

import type { TrainingGoalRuleProfile } from '@adaptive-workout/workout-engine';
import type { LoadPrescription } from './contracts.js';

/** Version identifier for the prescription rules. */
export const PRESCRIPTION_RULES_VERSION = 'prescription/1' as const;

export interface ExercisePrescription {
  readonly repMin: number;
  readonly repMax: number;
  readonly targetRir: number;
  readonly restSeconds: number;
  readonly loadPrescription: LoadPrescription;
}

/**
 * Determines the prescription for an exercise based on the goal profile
 * and whether the exercise is compound or isolation.
 *
 * Compound exercises (classified by family slug patterns) receive longer rest
 * and potentially different rep ranges than isolation exercises.
 */
export function prescribeExercise(
  goalProfile: TrainingGoalRuleProfile,
  exerciseFamilySlug: string,
  loadPrescription: LoadPrescription,
): ExercisePrescription {
  const isCompound = isCompoundFamily(exerciseFamilySlug);
  const guidance = goalProfile.repRangeGuidance;
  const restTendency = goalProfile.restTendency;

  return {
    repMin: guidance.minimum,
    repMax: guidance.maximum,
    targetRir: computeTargetRir(goalProfile.goal),
    restSeconds: computeRestSeconds(restTendency, isCompound),
    loadPrescription,
  };
}

/**
 * Computes target RIR deterministically per goal.
 *
 * - gain_strength: 2 RIR (stay further from failure)
 * - build_muscle, recomposition: 2 RIR
 * - lose_fat: 2 RIR
 * - improve_fitness: 3 RIR (more conservative)
 * - default: 2 RIR
 */
function computeTargetRir(goal: string): number {
  switch (goal) {
    case 'gain_strength':
      return 2;
    case 'build_muscle':
      return 2;
    case 'recomposition':
      return 2;
    case 'lose_fat':
      return 2;
    case 'improve_fitness':
      return 3;
    default:
      return 2;
  }
}

/**
 * Computes planned rest seconds deterministically per rest tendency and exercise type.
 *
 * Representative tendencies:
 *   - longer: 180s compound, 120s isolation
 *   - moderate: 120s compound, 90s isolation
 *   - shorter: 90s compound, 60s isolation (accessory only, never indiscriminate)
 */
function computeRestSeconds(
  restTendency: 'shorter' | 'moderate' | 'longer',
  isCompound: boolean,
): number {
  switch (restTendency) {
    case 'longer':
      return isCompound ? 180 : 120;
    case 'moderate':
      return isCompound ? 120 : 90;
    case 'shorter':
      // Shorter rest for accessory/isolation only; compounds still get adequate rest
      return isCompound ? 90 : 60;
  }
}

/**
 * Determines if an exercise family is compound based on movement pattern.
 *
 * Compound families involve multiple joints and large muscle groups.
 * This classification is used only for rest prescription, not for
 * engine selection logic.
 */
function isCompoundFamily(familySlug: string): boolean {
  const compoundFamilies = new Set([
    'horizontal-press',
    'incline-press',
    'vertical-press',
    'horizontal-pull',
    'vertical-pull',
    'knee-dominant-squat',
    'hip-hinge',
    'unilateral-knee-dominant',
    'hip-extension',
  ]);
  return compoundFamilies.has(familySlug);
}
