import {
  domainError,
  failure,
  parseVersionIdentifier,
  success,
  type DomainResult,
} from '@adaptive-workout/domain';
import type { WorkoutEngineInput } from './contracts.js';
import type { WorkoutConstraint } from './constraints.js';

export const workoutInputValidationCodes = [
  'NO_TARGET_MUSCLES',
  'DUPLICATE_TARGET_MUSCLE',
  'TARGET_EXCLUDED_MUSCLE_COLLISION',
  'INVALID_DURATION',
  'DUPLICATE_AVAILABLE_EQUIPMENT',
  'AVAILABLE_UNAVAILABLE_EQUIPMENT_COLLISION',
  'DUPLICATE_EXCLUDED_EXERCISE',
  'CONTRADICTORY_EXERCISE_CONSTRAINTS',
  'CONTRADICTORY_FAMILY_CONSTRAINTS',
  'DUPLICATE_CONSTRAINT_ID',
  'INVALID_CONSTRAINT',
  'INVALID_SESSION_DATE',
  'INVALID_DETERMINISTIC_SEED',
  'INVALID_VERSION',
  'DUPLICATE_CATALOG_EXERCISE',
] as const;

export type WorkoutInputValidationCode = (typeof workoutInputValidationCodes)[number];

export interface WorkoutInputValidationIssue {
  readonly code: WorkoutInputValidationCode;
  readonly path: string;
  readonly message: string;
  readonly conflictingValues?: readonly string[];
}

export function validateWorkoutEngineInput(
  input: WorkoutEngineInput,
): DomainResult<WorkoutEngineInput, 'VALIDATION_ERROR'> {
  const issues: WorkoutInputValidationIssue[] = [];

  if (input.targetMuscles.length === 0) {
    addIssue(
      issues,
      'NO_TARGET_MUSCLES',
      'targetMuscles',
      'At least one target muscle is required.',
    );
  }

  const targetMuscleIds = input.targetMuscles.map(({ muscleId }) => muscleId);
  addDuplicateIssues(
    targetMuscleIds,
    'DUPLICATE_TARGET_MUSCLE',
    'targetMuscles',
    'Target muscle is duplicated.',
    issues,
  );

  if (!Number.isFinite(input.availableDurationMinutes) || input.availableDurationMinutes <= 0) {
    addIssue(
      issues,
      'INVALID_DURATION',
      'availableDurationMinutes',
      'Available duration must be greater than zero.',
    );
  }

  addDuplicateIssues(
    input.availableEquipmentIds,
    'DUPLICATE_AVAILABLE_EQUIPMENT',
    'availableEquipmentIds',
    'Available equipment is duplicated.',
    issues,
  );

  addDuplicateIssues(
    input.exerciseCatalog.map(({ exerciseId }) => exerciseId),
    'DUPLICATE_CATALOG_EXERCISE',
    'exerciseCatalog',
    'Exercise candidate is duplicated.',
    issues,
  );

  const constraintIds = input.constraints.map(({ id }) => id);
  addDuplicateIssues(
    constraintIds,
    'DUPLICATE_CONSTRAINT_ID',
    'constraints',
    'Constraint ID is duplicated.',
    issues,
  );

  const requiredMuscleIds = [...targetMuscleIds];
  const excludedMuscleIds = [...input.excludedMuscleIds];
  const unavailableEquipmentIds: string[] = [];
  const excludedExerciseIds: string[] = [];
  const preferredExerciseIds: string[] = [];
  const excludedExerciseFamilyIds: string[] = [];
  const preferredExerciseFamilyIds: string[] = [];

  input.constraints.forEach((constraint, index) => {
    validateConstraint(constraint, index, issues);

    switch (constraint.kind) {
      case 'required_target_muscles':
        requiredMuscleIds.push(...constraint.muscleIds);
        break;
      case 'excluded_muscles':
        excludedMuscleIds.push(...constraint.muscleIds);
        break;
      case 'unavailable_equipment':
        unavailableEquipmentIds.push(...constraint.equipmentIds);
        break;
      case 'excluded_exercises':
        excludedExerciseIds.push(...constraint.exerciseIds);
        break;
      case 'preferred_exercises':
        preferredExerciseIds.push(...constraint.exerciseIds);
        break;
      case 'excluded_exercise_families':
        excludedExerciseFamilyIds.push(...constraint.exerciseFamilyIds);
        break;
      case 'preferred_exercise_families':
        preferredExerciseFamilyIds.push(...constraint.exerciseFamilyIds);
        break;
      case 'reduced_exercise_priority':
      case 'preferred_muscles':
      case 'maximum_workout_duration':
      case 'muscle_volume_limit':
        break;
    }
  });

  addDuplicateIssues(
    excludedExerciseIds,
    'DUPLICATE_EXCLUDED_EXERCISE',
    'constraints',
    'Excluded exercise is duplicated.',
    issues,
  );

  addCollisionIssue(
    requiredMuscleIds,
    excludedMuscleIds,
    'TARGET_EXCLUDED_MUSCLE_COLLISION',
    'targetMuscles',
    'A required target muscle is also excluded.',
    issues,
  );
  addCollisionIssue(
    input.availableEquipmentIds,
    unavailableEquipmentIds,
    'AVAILABLE_UNAVAILABLE_EQUIPMENT_COLLISION',
    'constraints',
    'Equipment cannot be both available and unavailable.',
    issues,
  );
  addCollisionIssue(
    excludedExerciseIds,
    preferredExerciseIds,
    'CONTRADICTORY_EXERCISE_CONSTRAINTS',
    'constraints',
    'An exercise cannot be both excluded and preferred.',
    issues,
  );
  addCollisionIssue(
    excludedExerciseFamilyIds,
    preferredExerciseFamilyIds,
    'CONTRADICTORY_FAMILY_CONSTRAINTS',
    'constraints',
    'An exercise family cannot be both excluded and preferred.',
    issues,
  );

  if (!isIsoDate(input.sessionDate)) {
    addIssue(
      issues,
      'INVALID_SESSION_DATE',
      'sessionDate',
      'Session date must be a valid ISO calendar date.',
    );
  }

  if (input.deterministicSeed.trim().length === 0) {
    addIssue(
      issues,
      'INVALID_DETERMINISTIC_SEED',
      'deterministicSeed',
      'Deterministic seed cannot be empty.',
    );
  }

  if (
    input.version.engineName.trim().length === 0 ||
    !parseVersionIdentifier(input.contractVersion, 'contract').ok ||
    !parseVersionIdentifier(input.version.engineVersion, 'engine').ok ||
    !parseVersionIdentifier(input.version.ruleSetVersion, 'rule-set').ok
  ) {
    addIssue(
      issues,
      'INVALID_VERSION',
      'version',
      'Engine name, engine version, and rule-set version must be valid.',
    );
  }

  if (issues.length > 0) {
    return failure(
      domainError('VALIDATION_ERROR', 'Workout engine input validation failed.', { issues }),
    );
  }

  return success(input);
}

function validateConstraint(
  constraint: WorkoutConstraint,
  index: number,
  issues: WorkoutInputValidationIssue[],
): void {
  const path = `constraints[${index}]`;

  if (constraint.id.trim().length === 0 || !/^[a-z][a-z0-9_]{0,63}$/.test(constraint.reasonCode)) {
    addIssue(
      issues,
      'INVALID_CONSTRAINT',
      path,
      'Constraint ID and reason code must be non-empty controlled values.',
    );
  }

  switch (constraint.kind) {
    case 'maximum_workout_duration':
      if (!Number.isFinite(constraint.maximumMinutes) || constraint.maximumMinutes <= 0) {
        addIssue(
          issues,
          'INVALID_CONSTRAINT',
          `${path}.maximumMinutes`,
          'Maximum workout duration must be greater than zero.',
        );
      }
      break;
    case 'muscle_volume_limit':
      if (
        !Number.isInteger(constraint.maximumWorkingSets) ||
        constraint.maximumWorkingSets < 0 ||
        (constraint.minimumWorkingSets !== undefined &&
          (!Number.isInteger(constraint.minimumWorkingSets) ||
            constraint.minimumWorkingSets < 0 ||
            constraint.minimumWorkingSets > constraint.maximumWorkingSets))
      ) {
        addIssue(
          issues,
          'INVALID_CONSTRAINT',
          path,
          'Muscle volume limits require non-negative ordered integer bounds.',
        );
      }
      break;
    case 'required_target_muscles':
    case 'excluded_muscles':
    case 'unavailable_equipment':
    case 'excluded_exercises':
    case 'excluded_exercise_families':
    case 'reduced_exercise_priority':
    case 'preferred_exercises':
    case 'preferred_muscles':
    case 'preferred_exercise_families':
      if (constraintValues(constraint).length === 0) {
        addIssue(
          issues,
          'INVALID_CONSTRAINT',
          path,
          'List constraints require at least one referenced entity.',
        );
      }
      break;
  }
}

function constraintValues(
  constraint: Exclude<
    WorkoutConstraint,
    { kind: 'maximum_workout_duration' | 'muscle_volume_limit' }
  >,
): readonly string[] {
  switch (constraint.kind) {
    case 'required_target_muscles':
    case 'excluded_muscles':
    case 'preferred_muscles':
      return constraint.muscleIds;
    case 'unavailable_equipment':
      return constraint.equipmentIds;
    case 'excluded_exercises':
    case 'reduced_exercise_priority':
    case 'preferred_exercises':
      return constraint.exerciseIds;
    case 'excluded_exercise_families':
    case 'preferred_exercise_families':
      return constraint.exerciseFamilyIds;
  }
}

function addDuplicateIssues(
  values: readonly string[],
  code: WorkoutInputValidationCode,
  path: string,
  message: string,
  issues: WorkoutInputValidationIssue[],
): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  });

  if (duplicates.size > 0) {
    addIssue(issues, code, path, message, [...duplicates].sort());
  }
}

function addCollisionIssue(
  leftValues: readonly string[],
  rightValues: readonly string[],
  code: WorkoutInputValidationCode,
  path: string,
  message: string,
  issues: WorkoutInputValidationIssue[],
): void {
  const right = new Set(rightValues);
  const collisions = [...new Set(leftValues.filter((value) => right.has(value)))].sort();

  if (collisions.length > 0) {
    addIssue(issues, code, path, message, collisions);
  }
}

function addIssue(
  issues: WorkoutInputValidationIssue[],
  code: WorkoutInputValidationCode,
  path: string,
  message: string,
  conflictingValues?: readonly string[],
): void {
  issues.push({ code, path, message, ...(conflictingValues ? { conflictingValues } : {}) });
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
