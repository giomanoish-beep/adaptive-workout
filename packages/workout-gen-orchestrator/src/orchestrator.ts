/**
 * Core workout generation orchestrator.
 *
 * This module orchestrates the full server-side workout generation flow:
 * 1. Validate the structured request
 * 2. Load and validate the user's training profile
 * 3. Load the exercise catalog
 * 4. Map profile and catalog data to engine-compatible inputs
 * 5. Invoke the deterministic workout engine
 * 6. Apply the prescription layer
 * 7. Map the result to a browser-safe review DTO
 * 8. Emit controlled observability events
 *
 * Server-only. No Supabase client, AI provider, or browser code.
 */

import {
  constructDurationFittedWorkout,
  validateWorkoutEngineInput,
} from '@adaptive-workout/workout-engine';
import { NoopSink, type ObservabilitySink } from '@adaptive-workout/observability';
import type {
  GenerateWorkoutRequest,
  WorkoutReviewResponse,
  WorkoutGenerationDependencies,
} from './contracts.js';
import { validateGenerateWorkoutRequest } from './validation.js';
import { mapProfileToGoalRules } from './profile-mapping.js';
import { mapCatalogToEngineCandidates } from './catalog-mapping.js';
import {
  buildEngineInput,
  ORCHESTRATOR_CONTRACT_VERSION,
  ORCHESTRATOR_RULE_SET_VERSION,
} from './engine-input.js';
import { mapEngineResultToReview, mapErrorToReview } from './result-mapping.js';
import { PRESCRIPTION_RULES_VERSION } from './prescription.js';
import { createGenerationObservability } from './observability.js';

/**
 * Generates a deterministic workout from a structured request and trained profile.
 *
 * @param request - Validated structured workout generation request
 * @param userId - Authenticated user ID from the auth context
 * @param deps - Injected dependencies (profile loader, catalog loader, mappings)
 * @param sink - Observability sink (defaults to NoopSink in tests)
 */
export async function generateWorkout(
  request: GenerateWorkoutRequest,
  userId: string,
  deps: WorkoutGenerationDependencies,
  sink: ObservabilitySink = new NoopSink(),
): Promise<WorkoutReviewResponse> {
  const correlationId = deps.correlationId ?? `${userId}-${Date.now()}`;
  const obs = createGenerationObservability(sink);

  // 1. Validate request
  const validationResult = validateGenerateWorkoutRequest(request);
  if (!validationResult.ok) {
    obs.emitValidationFailed({
      correlationId,
      errorCode: validationResult.error?.code ?? 'INVALID_REQUEST',
    });
    return mapErrorToReview(
      validationResult.error?.code ?? 'INVALID_REQUEST',
      validationResult.error?.message ?? 'Invalid request.',
    );
  }

  obs.emitGenerationRequestReceived({
    correlationId,
    targetCount: request.targetMuscles.length,
    requestedDuration: request.durationMinutes,
    equipmentContext: request.equipmentContext,
  });

  // 2. Load and validate profile
  let profile;
  try {
    profile = await deps.profileLoader.loadProfile(userId);
  } catch {
    obs.emitProfileLoadFailed({ correlationId, reason: 'load_error' });
    return mapErrorToReview('PROFILE_MISSING', 'Unable to load training profile.', correlationId);
  }

  if (!profile) {
    obs.emitProfileLoadFailed({ correlationId, reason: 'profile_missing' });
    return mapErrorToReview(
      'PROFILE_MISSING',
      'Complete your training profile first.',
      correlationId,
    );
  }

  if (!profile.goal || !profile.experience) {
    obs.emitProfileLoadFailed({ correlationId, reason: 'profile_invalid' });
    return mapErrorToReview(
      'PROFILE_INVALID',
      'Training profile is incomplete. Please update your settings.',
      correlationId,
    );
  }

  // 3. Profile mapping
  const { goalProfile, discomfortReviewRequired } = mapProfileToGoalRules(profile);

  if (discomfortReviewRequired) {
    obs.emitValidationFailed({
      correlationId,
      errorCode: 'DISCOMFORT_REVIEW_REQUIRED',
    });
    return mapErrorToReview(
      'DISCOMFORT_REVIEW_REQUIRED',
      'You reported current discomfort. Please review before generating a workout.',
      correlationId,
    );
  }

  // 4. Load catalog
  let catalog;
  try {
    catalog = await deps.catalogLoader.loadActiveCatalog();
  } catch {
    obs.emitCatalogLoadFailed({ correlationId, reason: 'load_error' });
    return mapErrorToReview(
      'CATALOG_UNAVAILABLE',
      'Exercise catalog is unavailable. Please try again.',
      correlationId,
    );
  }

  if (!catalog || !catalog.exercises || catalog.exercises.length === 0) {
    obs.emitCatalogLoadFailed({ correlationId, reason: 'empty_catalog' });
    return mapErrorToReview('CATALOG_UNAVAILABLE', 'No exercises available.', correlationId);
  }

  // 5. Map catalog to engine candidates
  const catalogResult = mapCatalogToEngineCandidates(
    catalog.exercises,
    catalog.muscles,
    catalog.exerciseMuscles,
    catalog.exerciseEquipment,
    catalog.equipment,
  );

  // 6. Build engine input
  const engineInput = buildEngineInput(
    request,
    catalogResult,
    deps.muscleIdMap,
    deps.equipmentContextMap,
    userId,
  );

  // 7. Validate engine input
  const engineInputValidation = validateWorkoutEngineInput(engineInput);
  if (!engineInputValidation.ok) {
    obs.emitValidationFailed({ correlationId, errorCode: 'INVALID_INPUT' });
    return mapErrorToReview(
      'INVALID_REQUEST',
      'Could not build a valid workout request from the provided inputs.',
      correlationId,
    );
  }

  // 8. Invoke the deterministic workout engine with training goal profile
  const startMs = Date.now();

  const engineResult = constructDurationFittedWorkout(
    engineInput,
    {
      contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
      ruleSetVersion: ORCHESTRATOR_RULE_SET_VERSION,
      maximumComponentMagnitude: 6.0,
      relevance: {
        primaryRoleWeight: 2.0,
        secondaryRoleWeight: 1.0,
        requiredTargetWeight: 3.0,
        preferredTargetWeight: 1.5,
      },
      adjustments: {
        userLikeBonus: 1.0,
        userDislikePenalty: 1.0,
        reducedPriorityPenalty: 1.0,
        preferredExerciseBonus: 0.5,
        preferredFamilyBonus: 0.5,
        preferredMuscleBonus: 1.0,
        templatePrescriptionBonus: 1.5,
      },
      recency: {
        windowDays: 14,
        maximumPenalty: 1.5,
      },
    },
    {
      contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
      ruleSetVersion: ORCHESTRATOR_RULE_SET_VERSION,
      minimumRequiredMuscleWorkingSets: 4,
      minimumPreferredMuscleWorkingSets: 2,
      requiredMuscleTargetWorkingSets: 6,
      preferredMuscleTargetWorkingSets: 4,
      preferredMuscleAdditionalWorkingSets: 2,
      defaultWorkingSetsPerExercise: 3,
      maximumWorkingSetsPerExercise: 5,
      maximumWorkingSetsPerMuscle: 12,
      maximumSelectedExercises: 8,
      minimumDistinctExerciseFamilies: 2,
      primarySetContribution: 1.0,
      secondarySetContribution: 0.6,
    },
    {
      contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
      ruleSetVersion: ORCHESTRATOR_RULE_SET_VERSION,
      defaultSetExecutionSeconds: 45,
      defaultRestSecondsBetweenSets: 120,
      defaultExerciseSetupSeconds: 60,
      transitionSecondsBetweenExercises: 30,
      minimumWorkingSetsPerExercise: 2,
      targetDurationUtilization: 0.45,
      minimumExpansionBudgetSeconds: 120,
      preferredVolumeExpansionMultiplier: 1.4,
    },
    goalProfile,
  );

  const latencyMs = Date.now() - startMs;

  if (engineResult.status === 'failure') {
    obs.emitEngineGenerationFailed({
      correlationId,
      errorCode: engineResult.code,
      latencyMs,
    });

    // Map engine failure codes to controlled error codes
    const errorCode = mapEngineFailureToErrorCode(engineResult.code);
    return mapErrorToReview(
      errorCode,
      'Could not create a feasible workout with the current settings. Try adjusting your target muscles, duration, or equipment.',
      correlationId,
    );
  }

  // 9. Success — map to review DTO
  obs.emitEngineGenerationSucceeded({
    correlationId,
    appliedGoal: String(goalProfile.goal),
    candidateCount: engineInput.exerciseCatalog.length,
    resultExerciseCount: engineResult.exercises.length,
    engineVersion: String(ORCHESTRATOR_ENGINE_NAME),
    ruleSetVersion: String(ORCHESTRATOR_RULE_SET_VERSION),
    prescriptionVersion: PRESCRIPTION_RULES_VERSION,
    latencyMs,
  });

  return mapEngineResultToReview(engineResult, catalogResult, goalProfile, correlationId);
}

function mapEngineFailureToErrorCode(code: string): 'NO_FEASIBLE_WORKOUT' | 'GENERATION_FAILED' {
  const noFeasibleCodes = new Set([
    'ALLOCATION_FAILED',
    'INSUFFICIENT_TARGET_COVERAGE',
    'DURATION_CONSTRAINT_IMPOSSIBLE',
    'NO_ELIGIBLE_EXERCISES',
    'REQUIRED_MUSCLE_COVERAGE_UNSATISFIED',
    'MINIMUM_SET_PRESCRIPTION_IMPOSSIBLE',
  ]);
  return noFeasibleCodes.has(code) ? 'NO_FEASIBLE_WORKOUT' : 'GENERATION_FAILED';
}

const ORCHESTRATOR_ENGINE_NAME = '@adaptive-workout/workout-engine';
