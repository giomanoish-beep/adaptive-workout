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
import type {
  WorkoutReviewSuccess,
  WorkoutReviewError,
  GenerationErrorCode,
  ServerTrainingProfile,
} from './contracts.js';
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

  // Determine if the exercise is unilateral based on exercise name patterns
  const isUnilateral = inferIsUnilateral(name);

  // Estimate initial load
  const loadEstimate = estimateInitialLoad({
    familySlug,
    equipmentCategory,
    isUnilateral,
    bodyWeightKg: undefined, // profile body weight not yet stored in ServerTrainingProfile
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

/**
 * Infers the equipment category from the exercise's equipment slugs in the catalog.
 *
 * Maps equipment slugs to load-estimator categories:
 *   - barbell → 'barbell'
 *   - dumbbell → 'dumbbell'
 *   - smith-machine → 'smith'
 *   - cable → 'cable'
 *   - bodyweight, dip-station, pull-up-station → 'bodyweight'
 *   - selectorized-machine, plate-loaded-machine, leg-press, hack-squat → 'machine'
 *   - bench → accessory, falls through to 'machine' as default
 */
function inferEquipmentCategory(exerciseId: string, catalogResult: CatalogMappingResult): string {
  const slugs = catalogResult.exerciseIdToEquipmentSlugs.get(exerciseId);
  if (!slugs || slugs.length === 0) return 'machine';

  // Priority order: check for the most specific equipment first
  for (const slug of slugs) {
    if (slug === 'barbell') return 'barbell';
    if (slug === 'dumbbell') return 'dumbbell';
    if (slug === 'smith-machine') return 'smith';
    if (slug === 'cable') return 'cable';
    if (slug === 'bodyweight' || slug === 'dip-station' || slug === 'pull-up-station')
      return 'bodyweight';
  }

  // Machine-type equipment (selectorized, plate-loaded, etc.)
  for (const slug of slugs) {
    if (
      slug === 'selectorized-machine' ||
      slug === 'plate-loaded-machine' ||
      slug === 'leg-press' ||
      slug === 'hack-squat'
    ) {
      return 'machine';
    }
  }

  return 'machine';
}

/**
 * Infers whether an exercise is unilateral based on its name.
 *
 * Unilateral exercises involve one arm or one leg at a time.
 * Uses common naming patterns rather than catalog metadata since
 * the current catalog doesn't store body_side per exercise.
 */
function inferIsUnilateral(exerciseName: string): boolean {
  const lower = exerciseName.toLowerCase();
  const unilateralPatterns = [
    'single-arm',
    'single-leg',
    'one-arm',
    'one-leg',
    'single-limb',
    'unilateral',
    'alternating',
  ];
  return unilateralPatterns.some((pattern) => lower.includes(pattern));
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
