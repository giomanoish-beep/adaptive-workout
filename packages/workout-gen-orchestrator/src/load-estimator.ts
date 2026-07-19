/**
 * Deterministic conservative initial load estimator for first-session
 * workouts (V1.4).
 *
 * Produces a suggested load in kg for exercises where no historical data
 * exists. Every estimate is labeled with its source so the UI can display
 * appropriate caveats.
 *
 * Rules are versioned and explicitly documented. No AI, no randomization.
 */

import type { TrainingGoalRuleProfile } from '@adaptive-workout/workout-engine';

export const LOAD_ESTIMATOR_VERSION = 'load-estimator/1' as const;

export type LoadEstimateSource =
  | 'first_session_coefficient'
  | 'bodyweight_reference'
  | 'calibration_required';

export interface LoadEstimate {
  /** Suggested load in kg; 0 means bodyweight or unloaded. */
  readonly loadKg: number;
  readonly source: LoadEstimateSource;
  /** Human-readable label for the UI (e.g. "Estimated — confirm after first set"). */
  readonly label: string;
}

/**
 * Family-level base coefficients for barbell/free-weight movements.
 * Expressed as a fraction of bodyweight in kg.
 *
 * These are conservative starting points calibrated for an untrained or
 * early-intermediate lifter. Advanced lifters receive a higher multiplier
 * (see experience coefficient).
 */
const FAMILY_BARBELL_BW_COEFFICIENTS: Readonly<Record<string, number>> = {
  'knee-dominant-squat': 0.8,
  'hip-hinge': 0.9,
  'horizontal-press': 0.6,
  'incline-press': 0.45,
  'vertical-press': 0.4,
  'horizontal-pull': 0.55,
  'vertical-pull': 0.5,
  'unilateral-knee-dominant': 0.35,
  'hip-extension': 0.6,
  'arm-curl': 0.12,
  'triceps-extension': 0.1,
  'shoulder-raise': 0.08,
  'calf-raise': 0.3,
};

/**
 * Absolute base loads (kg) for dumbbell exercises where bodyweight scaling
 * is not appropriate. Conservative estimates for an untrained lifter.
 */
const FAMILY_DUMBBELL_BASES: Readonly<Record<string, number>> = {
  'horizontal-press': 10,
  'incline-press': 8,
  'vertical-press': 6,
  'horizontal-pull': 8,
  'vertical-pull': 6,
  'arm-curl': 6,
  'triceps-extension': 5,
  'shoulder-raise': 5,
  'shoulder-press': 6,
  'lateral-raise': 4,
  'rear-delt-fly': 3,
  'calf-raise': 8,
  'unilateral-knee-dominant': 8,
  'hip-extension': 8,
};

/**
 * Absolute base loads (kg) for machine/selectorized exercises.
 * These are intentionally low — machine weight stacks are not standardized
 * and the displayed number is not comparable across manufacturers.
 */
const FAMILY_MACHINE_BASES: Readonly<Record<string, number>> = {
  'chest-press-machine': 25,
  'shoulder-press-machine': 15,
  'lat-pulldown': 25,
  'seated-row': 25,
  'leg-press': 60,
  'hack-squat': 20,
  'leg-extension': 20,
  'leg-curl': 20,
  'hip-adduction': 20,
  'hip-abduction': 20,
  'glute-drive': 30,
  'back-extension': 10,
  'abdominal-crunch': 15,
  'pec-fly': 15,
  'rear-delt-machine': 10,
  'biceps-curl-machine': 10,
  'triceps-extension-machine': 10,
  'calf-raise-machine': 25,
  'rotary-torso': 15,
};

/** Experience-level multiplier applied to the raw estimate. */
const EXPERIENCE_MULTIPLIERS: Readonly<Record<string, number>> = {
  beginner: 0.4,
  intermediate: 0.6,
  advanced: 0.8,
};

/** Smallest load increment for rounding (kg). */
const DEFAULT_LOAD_INCREMENT = 2.5;

/** Safety clamp values in kg. */
const MIN_BARBELL_LOAD = 20; // empty Olympic bar
const MIN_DUMBBELL_LOAD = 2;
const MIN_MACHINE_LOAD = 5;

export interface LoadEstimationInput {
  /** Exercise family slug (e.g. "horizontal-press"). */
  readonly familySlug: string;
  /** Equipment category: "barbell", "dumbbell", "machine", "cable", "smith", "bodyweight". */
  readonly equipmentCategory: string;
  /** Whether the exercise is unilateral (halve the load). */
  readonly isUnilateral: boolean;
  /** User body weight in kg (optional — if missing, defaults used). */
  readonly bodyWeightKg?: number;
  /** User experience level. */
  readonly experienceLevel: 'beginner' | 'intermediate' | 'advanced';
}

/**
 * Produces a conservative initial load estimate for a single exercise
 * prescription in a first-session workout.
 *
 * Returns a labeled estimate that the UI must display as non-authoritative.
 */
export function estimateInitialLoad(input: LoadEstimationInput): LoadEstimate {
  const experienceMultiplier =
    EXPERIENCE_MULTIPLIERS[input.experienceLevel] ?? EXPERIENCE_MULTIPLIERS.beginner;

  // Bodyweight / unloaded exercises
  if (input.equipmentCategory === 'bodyweight') {
    return {
      loadKg: 0,
      source: 'bodyweight_reference',
      label: 'Bodyweight',
    };
  }

  // Machine exercises — use absolute base values (bodyweight-agnostic).
  if (input.equipmentCategory === 'machine' || input.equipmentCategory === 'cable') {
    const base = FAMILY_MACHINE_BASES[input.familySlug] ?? 15;
    const raw = base * experienceMultiplier;
    const rounded = roundToIncrement(raw, 5); // machines use 5 kg increments
    const clamped = Math.max(rounded, MIN_MACHINE_LOAD);
    return {
      loadKg: clamped,
      source: 'calibration_required',
      label: 'Estimated — machine weight not standardized',
    };
  }

  // Smith machine — similar to barbell but slightly reduced due to guided path.
  if (input.equipmentCategory === 'smith') {
    const bwCoeff = FAMILY_BARBELL_BW_COEFFICIENTS[input.familySlug] ?? 0.3;
    const bodyWeight = input.bodyWeightKg ?? 75; // conservative default
    const raw = bwCoeff * bodyWeight * experienceMultiplier * 0.85; // 15% reduction vs free barbell
    const perSide = input.isUnilateral ? raw * 0.5 : raw;
    const rounded = roundToIncrement(perSide, DEFAULT_LOAD_INCREMENT);
    return {
      loadKg: Math.max(rounded, MIN_BARBELL_LOAD),
      source: 'first_session_coefficient',
      label: 'Estimated — Smith machine assisted',
    };
  }

  // Barbell exercises — bodyweight-proportional.
  if (input.equipmentCategory === 'barbell') {
    const bwCoeff = FAMILY_BARBELL_BW_COEFFICIENTS[input.familySlug] ?? 0.3;
    const bodyWeight = input.bodyWeightKg ?? 75;
    const raw = bwCoeff * bodyWeight * experienceMultiplier;
    const perSide = input.isUnilateral ? raw * 0.5 : raw;
    const rounded = roundToIncrement(perSide, DEFAULT_LOAD_INCREMENT);
    return {
      loadKg: Math.max(rounded, MIN_BARBELL_LOAD),
      source: 'first_session_coefficient',
      label: 'Estimated — confirm after first set',
    };
  }

  // Dumbbell exercises — use absolute base values.
  if (input.equipmentCategory === 'dumbbell') {
    const base = FAMILY_DUMBBELL_BASES[input.familySlug] ?? 5;
    const raw = base * experienceMultiplier;
    const rounded = roundToIncrement(raw, 2); // dumbbells use 2 kg increments
    const clamped = Math.max(rounded, MIN_DUMBBELL_LOAD);
    return {
      loadKg: clamped,
      source: 'first_session_coefficient',
      label: 'Estimated — confirm after first set',
    };
  }

  // Unknown / fallback
  return {
    loadKg: 0,
    source: 'calibration_required',
    label: 'Calibration needed',
  };
}

function roundToIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}