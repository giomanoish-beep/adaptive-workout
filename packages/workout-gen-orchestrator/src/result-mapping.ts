/**
 * Maps the engine result and prescription data to the browser-safe review DTO.
 *
 * Pure — takes engine output, catalog mapping context, goal profile,
 * server profile data, and prescription data, produces a controlled
 * WorkoutReviewResponse. No Supabase, no engine re-invocation, no AI.
 */

import type {
  DurationFittedWorkoutSuccess,
  FittedWorkoutExercise,
  TrainingGoalRuleProfile,
} from '@adaptive-workout/workout-engine';
import type { WorkoutReviewSuccess, WorkoutReviewError, GenerationErrorCode, ServerTrainingProfile } from './contracts.js';
import type { CatalogMappingResult } from './catalog-mapping.js';
import { prescribeExercise } from './prescription.js';
import { estimateInitialLoad } from './load-estimator.js';
import { ORCHESTRATOR_ENGINE_NAME, ORCHESTRATOR_RULE_SET_VERSION } from './engine-input.js';

/**
 * Maps a successful engine result to the browser-safe review DTO.
 */
export function mapEngineResultToReview(
  engineResult: DurationFittedWorkoutSuccess,
  catalogResult: CatalogMappingResult,
  goalProfile: TrainingGoalRuleProfile,
  generationId: string,
  profile?: ServerTrainingProfile,
): WorkoutReviewSuccess {
  const exercises = engineResult.exercises.map((fitted, index) =>
    mapExercise(fitted, index, catalogResult, goalProfile, profile),
  );

  const muscleVolume = engineResult.muscleVolumeSummary.map((summary) => {
    const name = catalogResult.muscleIdToName.get(summary.muscleId) ?? String(summary.muscleId);
    return {
      muscle: name,
      volume: Math.round(summary.weightedWorkingSetContribution * 10) / 10,
    };
  });

  const title = deriveTitle(engineResult, catalogResult);

  return {
    status: 'success',
    generationId,
    title,
    estimatedDurationMinutes: Math.round(engineResult.estimatedDuration.totalMinutes),
    totalWorkingSets: exercises.reduce((sum, ex) => sum + ex.sets, 0),
    exercises,
    muscleVolume,
    appliedGoal: goalProfile.goal,
    engineVersion: `${ORCHESTRATOR_ENGINE_NAME}@${String(ORCHESTRATOR_RULE_SET_VERSION)}`,
    ruleSetVersion: String(ORCHESTRATOR_RULE_SET_VERSION),
    traceSummary: null,
  };
}

function mapExercise(
  fitted: FittedWorkoutExercise,
  index: number,
  catalogResult: CatalogMappingResult,
  goalProfile: TrainingGoalRuleProfile,
  profile?: ServerTrainingProfile,
) {
  const name = catalogResult.exerciseIdToName.get(fitted.exerciseId) ?? String(fitted.exerciseId);

  // Extract family slug from the exerciseFamilyId → slug mapping
  const familySlug = catalogResult.familyIdToSlug?.get(fitted.exerciseFamilyId) ?? 'unknown';

  // Determine equipment category from the catalog
  const equipmentCategory = inferEquipmentCategory(fitted.exerciseId, catalogResult);

  // Estimate initial load
  const loadEstimate = estimateInitialLoad({
    familySlug,
    equipmentCategory,
    isUnilateral: false, // we don't have this info yet with current catalog — default to bilateral
    bodyWeightKg: undefined, // profile body weight not yet stored
    experienceLevel: normalizeExperienceLevel(profile?.experience ?? 'intermediate'),
  });

  const prescription = prescribeExercise(
    goalProfile,
    familySlug,
    loadEstimate.loadKg,
    loadEstimate.source,
    loadEstimate.label,
  );

  return {
    position: index + 1,
    exerciseId: fitted.exerciseId,
    exerciseVersion: catalogResult.exerciseIdToVersion.get(fitted.exerciseId)!,
    name,
    sets: fitted.plannedWorkingSets,
    reps: { minimum: prescription.repMin, maximum: prescription.repMax },
    rir: prescription.targetRir,
    restSeconds: prescription.restSeconds,
    initialLoadKg: prescription.initialLoadKg,
    loadEstimateSource: prescription.loadEstimateSource,
    loadEstimateLabel: prescription.loadEstimateLabel,
  };
}

function inferEquipmentCategory(
  _exerciseId: string,
  _catalogResult: CatalogMappingResult,
): string {
  // Simplified: we'll return a default since the current catalog mapping
  // doesn't store equipment category per exercise. The load estimator
  // will use reasonable defaults.
  return 'machine';
}

function normalizeExperienceLevel(exp: string): 'beginner' | 'intermediate' | 'advanced' {
  const lower = exp.toLowerCase();
  if (lower === 'beginner' || lower === 'novice') return 'beginner';
  if (lower === 'advanced' || lower === 'expert') return 'advanced';
  return 'intermediate';
}

function deriveTitle(
  engineResult: DurationFittedWorkoutSuccess,
  catalogResult: CatalogMappingResult,
): string {
  const muscleNames = engineResult.muscleVolumeSummary
    .map((s) => catalogResult.muscleIdToName.get(s.muscleId))
    .filter((n): n is string => n !== undefined);

  if (muscleNames.length === 0) return 'Generated Workout';
  if (muscleNames.length === 1) return muscleNames[0]!;
  if (muscleNames.length === 2) return `${muscleNames[0]!} + ${muscleNames[1]!}`;
  return `${muscleNames.slice(0, 2).join(' + ')} Focus`;
}

/**
 * Creates a controlled error response.
 */
export function mapErrorToReview(
  code: GenerationErrorCode,
  message: string,
  generationId: string | null = null,
): WorkoutReviewError {
  return {
    status: 'error',
    generationId,
    code,
    message,
  };
}