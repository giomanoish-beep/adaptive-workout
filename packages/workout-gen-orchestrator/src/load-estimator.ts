/**
 * Deterministic conservative initial load estimator for first-session
 * workouts (V1.4). Rules are versioned; no AI or randomization is used.
 */

import type { LoadPrescription } from './contracts.js';

export const LOAD_ESTIMATOR_VERSION = 'load-estimator/1' as const;

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

const EXPERIENCE_MULTIPLIERS: Readonly<Record<string, number>> = {
  beginner: 0.4,
  intermediate: 0.6,
  advanced: 0.8,
};

const DEFAULT_LOAD_INCREMENT = 2.5;
const MIN_BARBELL_LOAD = 20;
const MIN_DUMBBELL_LOAD = 2;
const MIN_MACHINE_LOAD = 5;

export interface LoadEstimationInput {
  readonly familySlug: string;
  readonly equipmentCategory: string;
  readonly isUnilateral: boolean;
  readonly bodyWeightKg?: number | null;
  readonly experienceLevel: 'beginner' | 'intermediate' | 'advanced';
}

export function estimateInitialLoad(input: LoadEstimationInput): LoadPrescription {
  const experienceMultiplier = EXPERIENCE_MULTIPLIERS[input.experienceLevel];

  if (input.equipmentCategory === 'bodyweight') {
    return {
      kind: 'bodyweight',
      suggestedLoadKg: null,
      unit: 'kg',
      label: 'Bodyweight',
      incrementKg: 0,
    };
  }

  if (input.equipmentCategory === 'machine' || input.equipmentCategory === 'cable') {
    const base = FAMILY_MACHINE_BASES[input.familySlug] ?? 15;
    const suggestedLoadKg = safeRoundedLoad(base * experienceMultiplier, 5, MIN_MACHINE_LOAD);
    return {
      kind: 'external_numeric',
      suggestedLoadKg,
      unit: 'kg',
      label: 'Estimated - machine weight not standardized',
      incrementKg: 5,
    };
  }

  if (input.equipmentCategory === 'smith' || input.equipmentCategory === 'barbell') {
    if (!isValidBodyWeight(input.bodyWeightKg)) {
      return calibrationRequired(2.5);
    }

    const coefficient = FAMILY_BARBELL_BW_COEFFICIENTS[input.familySlug] ?? 0.3;
    const smithMultiplier = input.equipmentCategory === 'smith' ? 0.85 : 1;
    const unilateralMultiplier = input.isUnilateral ? 0.5 : 1;
    const raw =
      coefficient *
      input.bodyWeightKg *
      experienceMultiplier *
      smithMultiplier *
      unilateralMultiplier;
    const suggestedLoadKg = safeRoundedLoad(raw, DEFAULT_LOAD_INCREMENT, MIN_BARBELL_LOAD);

    return {
      kind: 'external_numeric',
      suggestedLoadKg,
      unit: 'kg',
      label:
        input.equipmentCategory === 'smith'
          ? 'Estimated - Smith machine assisted'
          : 'Estimated - confirm after first set',
      incrementKg: DEFAULT_LOAD_INCREMENT,
    };
  }

  if (input.equipmentCategory === 'dumbbell') {
    const base = FAMILY_DUMBBELL_BASES[input.familySlug] ?? 5;
    const suggestedLoadKg = safeRoundedLoad(base * experienceMultiplier, 2, MIN_DUMBBELL_LOAD);
    return {
      kind: 'external_numeric',
      suggestedLoadKg,
      unit: 'kg',
      label: 'Estimated - confirm after first set',
      incrementKg: 2,
    };
  }

  return calibrationRequired(0, 'Calibration needed');
}

function calibrationRequired(
  incrementKg: number,
  label = 'Calibration needed - enter your body weight in settings',
): LoadPrescription {
  return {
    kind: 'calibration_required',
    suggestedLoadKg: null,
    unit: 'kg',
    label,
    incrementKg,
  };
}

function isValidBodyWeight(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function safeRoundedLoad(value: number, increment: number, minimum: number): number {
  if (!Number.isFinite(value) || value < 0) return minimum;
  return Math.max(roundToIncrement(value, increment), minimum);
}

function roundToIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}
