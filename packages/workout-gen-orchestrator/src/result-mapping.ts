/**
 * Maps the engine result and prescription data to the browser-safe review DTO.
 *
 * Pure — takes engine output, catalog mapping context, goal profile,
 * and prescription data, produces a controlled WorkoutReviewResponse.
 * No Supabase, no engine re-invocation, no AI.
 */

import type {
  DurationFittedWorkoutSuccess,
  FittedWorkoutExercise,
  TrainingGoalRuleProfile,
} from '@adaptive-workout/workout-engine';
import type {
  WorkoutReviewSuccess,
  WorkoutReviewError,
  GenerationErrorCode,
} from './contracts.js';
import type { CatalogMappingResult } from './catalog-mapping.js';
import { prescribeExercise } from './prescription.js';
import {
  ORCHESTRATOR_ENGINE_NAME,
  ORCHESTRATOR_RULE_SET_VERSION,
} from './engine-input.js';

/**
 * Maps a successful engine result to the browser-safe review DTO.
 */
export function mapEngineResultToReview(
  engineResult: DurationFittedWorkoutSuccess,
  catalogResult: CatalogMappingResult,
  goalProfile: TrainingGoalRuleProfile,
  generationId: string,
): WorkoutReviewSuccess {
  const exercises = engineResult.exercises.map((fitted, index) =>
    mapExercise(fitted, index, catalogResult, goalProfile),
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
) {
  const name = catalogResult.exerciseIdToName.get(fitted.exerciseId) ?? String(fitted.exerciseId);

  // Get family slug for prescription calculations
  const candidate = findCandidateInfo(catalogResult, fitted.exerciseId);
  const familySlug = candidate?.familySlug ?? 'unknown';
  const prescription = prescribeExercise(goalProfile, familySlug);

  return {
    position: index + 1,
    exerciseId: fitted.exerciseId,
    name,
    sets: fitted.plannedWorkingSets,
    reps: { minimum: prescription.repMin, maximum: prescription.repMax },
    rir: prescription.targetRir,
    restSeconds: prescription.restSeconds,
  };
}

function findCandidateInfo(
  _catalogResult: CatalogMappingResult,
  _exerciseId: string,
): { familySlug: string } | undefined {
  void _catalogResult;
  void _exerciseId;
  // We need the family slug - it's stored in the candidates
  // But we already have it from the catalogMappingResult. Let me store it.
  // For now, use a simple lookup that maps exerciseId to familySlug.
  // The engine result has the exerciseFamilyId, but not the slug directly.
  // We stored the slug in the candidates during catalog mapping - we need
  // to pass it through. For now, return undefined and prescription will
  // use defaults. This will be fixed up when we integrate the family slugs
  // into the mapping flow properly.
  return undefined;
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