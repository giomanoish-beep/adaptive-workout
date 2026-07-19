import type {
  WorkoutExerciseCandidate,
  WorkoutEngineInput,
} from '@adaptive-workout/workout-engine';
import type {
  ReplaceWorkoutExerciseRequest,
  ReplaceWorkoutExerciseResponse,
  WorkoutGenerationDependencies,
} from './contracts.js';
import { mapCatalogToEngineCandidates, type CatalogMappingResult } from './catalog-mapping.js';
import { buildEngineInput } from './engine-input.js';
import { mapProfileToGoalRules } from './profile-mapping.js';
import { validateGenerateWorkoutRequest } from './validation.js';

export function selectReplacementCandidate(
  request: ReplaceWorkoutExerciseRequest,
  engineInput: WorkoutEngineInput,
): WorkoutExerciseCandidate | null {
  const current = engineInput.exerciseCatalog.find(
    (candidate) => candidate.exerciseId === request.currentExerciseId,
  );
  if (!current) return null;

  const primaryMuscles = new Set(
    current.muscleContributions
      .filter((contribution) => contribution.role === 'primary')
      .map((contribution) => contribution.muscleId),
  );
  if (primaryMuscles.size === 0) return null;

  const excluded = new Set([
    ...request.workoutExerciseIds,
    ...(request.excludedReplacementIds ?? []),
  ]);
  const eligible = engineInput.exerciseCatalog.filter(
    (candidate) =>
      !excluded.has(candidate.exerciseId) &&
      candidateIsAllowed(candidate, engineInput) &&
      [...primaryMuscles].every((muscleId) =>
        candidate.muscleContributions.some(
          (contribution) =>
            contribution.muscleId === muscleId && contribution.role !== 'stabilizer',
        ),
      ),
  );

  return (
    [...eligible].sort((left, right) => {
      const leftSameFamily = left.exerciseFamilyId === current.exerciseFamilyId ? 1 : 0;
      const rightSameFamily = right.exerciseFamilyId === current.exerciseFamilyId ? 1 : 0;
      if (leftSameFamily !== rightSameFamily) return rightSameFamily - leftSameFamily;
      const leftPrimary = sharedPrimaryCount(current, left);
      const rightPrimary = sharedPrimaryCount(current, right);
      return rightPrimary - leftPrimary || left.exerciseId.localeCompare(right.exerciseId);
    })[0] ?? null
  );
}

function candidateIsAllowed(
  candidate: WorkoutExerciseCandidate,
  engineInput: WorkoutEngineInput,
): boolean {
  if (!candidate.isActive) return false;
  const availableEquipment = new Set(engineInput.availableEquipmentIds);
  if (
    candidate.equipment.some(
      (equipment) =>
        equipment.requirement === 'required' && !availableEquipment.has(equipment.equipmentId),
    )
  ) {
    return false;
  }
  if (
    engineInput.exercisePreferences.some(
      (preference) =>
        preference.exerciseId === candidate.exerciseId && preference.preference === 'dislike',
    )
  ) {
    return false;
  }
  return engineInput.constraints.every((constraint) => {
    switch (constraint.kind) {
      case 'excluded_exercises':
        return !constraint.exerciseIds.includes(candidate.exerciseId);
      case 'excluded_exercise_families':
        return !constraint.exerciseFamilyIds.includes(candidate.exerciseFamilyId);
      case 'unavailable_equipment':
        return !candidate.equipment.some(
          (equipment) =>
            equipment.requirement === 'required' &&
            constraint.equipmentIds.includes(equipment.equipmentId),
        );
      case 'excluded_muscles':
        return !candidate.muscleContributions.some((contribution) =>
          constraint.muscleIds.includes(contribution.muscleId),
        );
      default:
        return true;
    }
  });
}

export async function replaceWorkoutExercise(
  request: ReplaceWorkoutExerciseRequest,
  userId: string,
  deps: WorkoutGenerationDependencies,
): Promise<ReplaceWorkoutExerciseResponse> {
  const generationValidation = validateGenerateWorkoutRequest(request);
  if (
    !generationValidation.ok ||
    !request.currentExerciseId ||
    request.workoutExerciseIds.length === 0 ||
    !request.workoutExerciseIds.includes(request.currentExerciseId)
  ) {
    return replacementError('INVALID_REQUEST', 'The exercise replacement request is invalid.');
  }

  let profile;
  try {
    profile = await deps.profileLoader.loadProfile(userId);
  } catch {
    return replacementError('PROFILE_MISSING', 'Unable to load your training profile.');
  }
  if (!profile) return replacementError('PROFILE_MISSING', 'Complete your training profile first.');
  if (mapProfileToGoalRules(profile).discomfortReviewRequired) {
    return replacementError(
      'DISCOMFORT_REVIEW_REQUIRED',
      'Review your current discomfort before replacing this exercise.',
    );
  }

  let catalog;
  try {
    catalog = await deps.catalogLoader.loadActiveCatalog();
  } catch {
    return replacementError('CATALOG_UNAVAILABLE', 'Exercise catalog is unavailable.');
  }
  const mapped: CatalogMappingResult = mapCatalogToEngineCandidates(
    catalog.exercises,
    catalog.muscles,
    catalog.exerciseMuscles,
    catalog.exerciseEquipment,
    catalog.equipment,
  );
  const engineInput = buildEngineInput(
    request,
    mapped,
    deps.muscleIdMap,
    deps.equipmentContextMap,
    userId,
  );
  const replacement = selectReplacementCandidate(request, engineInput);
  if (!replacement) {
    return replacementError(
      'NO_VALID_SUBSTITUTE',
      'No valid substitute is available for your equipment and restrictions.',
    );
  }
  const name = mapped.exerciseIdToName.get(replacement.exerciseId);
  const exerciseVersion = mapped.exerciseIdToVersion.get(replacement.exerciseId);
  if (!name || exerciseVersion === undefined) {
    return replacementError('CATALOG_UNAVAILABLE', 'The replacement details are unavailable.');
  }
  return {
    status: 'success',
    action: 'replace_exercise',
    replacement: { exerciseId: replacement.exerciseId, exerciseVersion, name },
  };
}

function sharedPrimaryCount(
  current: WorkoutExerciseCandidate,
  candidate: WorkoutExerciseCandidate,
): number {
  const candidatePrimary = new Set(
    candidate.muscleContributions
      .filter((contribution) => contribution.role === 'primary')
      .map((contribution) => contribution.muscleId),
  );
  return current.muscleContributions.filter(
    (contribution) =>
      contribution.role === 'primary' && candidatePrimary.has(contribution.muscleId),
  ).length;
}

function replacementError(
  code: Extract<ReplaceWorkoutExerciseResponse, { status: 'error' }>['code'],
  message: string,
): ReplaceWorkoutExerciseResponse {
  return { status: 'error', action: 'replace_exercise', code, message };
}
