/**
 * Server-side request validation for workout generation requests.
 *
 * Pure, deterministic validation. Rejects malformed, oversized, or
 * duplicate requests before they touch the engine or database.
 * No Supabase, no engine imports, no AI.
 */

import { type GenerateWorkoutRequest, type GenerationErrorCode } from './contracts.js';

/** Inclusive duration bounds. */
export const REQUEST_DURATION_MIN = 15;
export const REQUEST_DURATION_MAX = 240;

/** Maximum array sizes for controlled fields. */
export const MAX_TARGET_MUSCLES = 10;
export const MAX_EXCLUDED_MUSCLES = 10;
export const MAX_UNAVAILABLE_EQUIPMENT = 10;

/** Controlled equipment context identifiers. */
export const equipmentContextIds = ['full-gym', 'dumbbells-only', 'cables-only'] as const;
export type EquipmentContextId = (typeof equipmentContextIds)[number];

/** Controlled muscle option IDs. */
export const muscleOptionIds = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'core',
] as const;
export type MuscleOptionId = (typeof muscleOptionIds)[number];

export interface ValidationIssue {
  readonly code: GenerationErrorCode;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly error?: ValidationIssue;
}

/**
 * Validates a structured workout generation request.
 *
 * Pure: identical requests yield identical results.
 */
export function validateGenerateWorkoutRequest(
  request: GenerateWorkoutRequest,
): ValidationResult {
  // At least one target muscle
  if (!request.targetMuscles || request.targetMuscles.length === 0) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'Select at least one target muscle.' },
    };
  }

  // Bounded target muscle count
  if (request.targetMuscles.length > MAX_TARGET_MUSCLES) {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: `Maximum ${MAX_TARGET_MUSCLES} target muscles allowed.`,
      },
    };
  }

  // No duplicate targets
  const uniqueTargets = new Set(request.targetMuscles);
  if (uniqueTargets.size !== request.targetMuscles.length) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'Duplicate target muscles are not allowed.' },
    };
  }

  // All target muscles must be valid identifiers
  for (const muscle of request.targetMuscles) {
    if (!isValidMuscleId(muscle)) {
      return {
        ok: false,
        error: { code: 'INVALID_REQUEST', message: `Unknown muscle identifier: ${muscle}` },
      };
    }
  }

  // Excluded muscles must be valid and bounded
  if (request.excludedMuscles && request.excludedMuscles.length > 0) {
    if (request.excludedMuscles.length > MAX_EXCLUDED_MUSCLES) {
      return {
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: `Maximum ${MAX_EXCLUDED_MUSCLES} excluded muscles allowed.`,
        },
      };
    }

    const uniqueExcluded = new Set(request.excludedMuscles);
    if (uniqueExcluded.size !== request.excludedMuscles.length) {
      return {
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Duplicate excluded muscles are not allowed.' },
      };
    }

    // No overlap between target and excluded
    for (const excluded of request.excludedMuscles) {
      if (!isValidMuscleId(excluded)) {
        return {
          ok: false,
          error: { code: 'INVALID_REQUEST', message: `Unknown excluded muscle: ${excluded}` },
        };
      }
      if (uniqueTargets.has(excluded)) {
        return {
          ok: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'A muscle cannot be both target and excluded.',
          },
        };
      }
    }
  }

  // Duration validation
  if (
    typeof request.durationMinutes !== 'number' ||
    !Number.isInteger(request.durationMinutes) ||
    request.durationMinutes < REQUEST_DURATION_MIN ||
    request.durationMinutes > REQUEST_DURATION_MAX
  ) {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: `Duration must be an integer between ${REQUEST_DURATION_MIN} and ${REQUEST_DURATION_MAX} minutes.`,
      },
    };
  }

  // Equipment context
  if (!request.equipmentContext || !isValidEquipmentContext(request.equipmentContext)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Select a valid equipment context.',
      },
    };
  }

  // Optional emphasis validation
  if (request.emphasis !== undefined && request.emphasis !== null) {
    if (!isValidMuscleId(request.emphasis)) {
      return {
        ok: false,
        error: { code: 'INVALID_REQUEST', message: `Unknown emphasis muscle: ${request.emphasis}` },
      };
    }
  }

  // Bounded unavailable equipment
  if (request.unavailableEquipment && request.unavailableEquipment.length > MAX_UNAVAILABLE_EQUIPMENT) {
    return {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: `Maximum ${MAX_UNAVAILABLE_EQUIPMENT} unavailable equipment entries allowed.`,
      },
    };
  }

  return { ok: true };
}

function isValidMuscleId(id: string): boolean {
  return (muscleOptionIds as readonly string[]).includes(id);
}

function isValidEquipmentContext(id: string): id is EquipmentContextId {
  return (equipmentContextIds as readonly string[]).includes(id);
}