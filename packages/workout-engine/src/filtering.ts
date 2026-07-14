import { isUuid, type EquipmentId, type MuscleId } from '@adaptive-workout/domain';
import type {
  WorkoutEngineInput,
  WorkoutExerciseCandidate,
  WorkoutExerciseEquipmentRequirement,
  WorkoutExerciseMuscleContribution,
} from './contracts.js';

export const workoutCandidateRejectionCodes = [
  'INVALID_CANDIDATE',
  'INACTIVE_EXERCISE',
  'EXCLUDED_EXERCISE',
  'EXCLUDED_FAMILY',
  'RESTRICTED_MOVEMENT_PATTERN',
  'EXCLUDED_MUSCLE',
  'EXPLICITLY_UNAVAILABLE_EQUIPMENT',
  'MISSING_REQUIRED_EQUIPMENT',
  'NO_TARGET_MUSCLE_RELEVANCE',
] as const;

export type WorkoutCandidateRejectionCode = (typeof workoutCandidateRejectionCodes)[number];

export const workoutCandidateInvalidityCodes = [
  'DUPLICATE_EXERCISE_ID',
  'INVALID_EXERCISE_ID',
  'INVALID_EXERCISE_FAMILY_ID',
  'NO_MUSCLE_CONTRIBUTIONS',
  'NO_PRIMARY_MUSCLE',
  'INVALID_MUSCLE_ID',
  'DUPLICATE_MUSCLE',
  'INVALID_MUSCLE_CONTRIBUTION',
  'INVALID_EQUIPMENT_ID',
  'DUPLICATE_EQUIPMENT',
  'INVALID_DURATION_ESTIMATE',
] as const;

export type WorkoutCandidateInvalidityCode = (typeof workoutCandidateInvalidityCodes)[number];

export interface WorkoutCandidateRejectionReason {
  readonly code: WorkoutCandidateRejectionCode;
  readonly constraintId?: string;
  readonly relatedEquipmentIds?: readonly EquipmentId[];
  readonly relatedMuscleIds?: readonly MuscleId[];
  readonly invalidityCodes?: readonly WorkoutCandidateInvalidityCode[];
}

export interface RejectedWorkoutCandidate {
  readonly candidate: WorkoutExerciseCandidate;
  readonly reasons: readonly WorkoutCandidateRejectionReason[];
}

export interface WorkoutCandidateFilteringResult {
  readonly contractVersion: WorkoutEngineInput['contractVersion'];
  readonly version: WorkoutEngineInput['version'];
  readonly eligibleCandidates: readonly WorkoutExerciseCandidate[];
  readonly rejectedCandidates: readonly RejectedWorkoutCandidate[];
}

export function filterWorkoutCandidates(
  input: WorkoutEngineInput,
): WorkoutCandidateFilteringResult {
  const availableEquipment = new Set(input.availableEquipmentIds);
  const targetMuscles = new Set(input.targetMuscles.map(({ muscleId }) => muscleId));
  const excludedMuscles = new Set(input.excludedMuscleIds);
  const unavailableEquipment = new Set<EquipmentId>();
  const excludedExerciseConstraints = new Map<string, string[]>();
  const excludedFamilyConstraints = new Map<
    string,
    { id: string; movementRestriction: boolean }[]
  >();

  for (const constraint of [...input.constraints].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    switch (constraint.kind) {
      case 'excluded_muscles':
        constraint.muscleIds.forEach((muscleId) => excludedMuscles.add(muscleId));
        break;
      case 'unavailable_equipment':
        constraint.equipmentIds.forEach((equipmentId) => unavailableEquipment.add(equipmentId));
        break;
      case 'excluded_exercises':
        constraint.exerciseIds.forEach((exerciseId) => {
          const constraintIds = excludedExerciseConstraints.get(exerciseId) ?? [];
          constraintIds.push(constraint.id);
          excludedExerciseConstraints.set(exerciseId, constraintIds);
        });
        break;
      case 'excluded_exercise_families':
        constraint.exerciseFamilyIds.forEach((exerciseFamilyId) => {
          const constraints = excludedFamilyConstraints.get(exerciseFamilyId) ?? [];
          constraints.push({
            id: constraint.id,
            movementRestriction: constraint.reasonCode === 'movement_pattern_excluded',
          });
          excludedFamilyConstraints.set(exerciseFamilyId, constraints);
        });
        break;
      case 'required_target_muscles':
        constraint.muscleIds.forEach((muscleId) => targetMuscles.add(muscleId));
        break;
      case 'reduced_exercise_priority':
      case 'preferred_exercises':
      case 'preferred_muscles':
      case 'preferred_exercise_families':
      case 'maximum_workout_duration':
      case 'muscle_volume_limit':
        break;
    }
  }

  const exerciseIdCounts = countValues(input.exerciseCatalog.map(({ exerciseId }) => exerciseId));
  const eligibleCandidates: WorkoutExerciseCandidate[] = [];
  const rejectedCandidates: RejectedWorkoutCandidate[] = [];

  for (const candidate of [...input.exerciseCatalog].sort(compareCandidates)) {
    const invalidityCodes = validateCandidate(candidate, exerciseIdCounts);
    if (invalidityCodes.length > 0) {
      rejectedCandidates.push({
        candidate,
        reasons: [{ code: 'INVALID_CANDIDATE', invalidityCodes }],
      });
      continue;
    }

    const reasons: WorkoutCandidateRejectionReason[] = [];

    if (!candidate.isActive) {
      reasons.push({ code: 'INACTIVE_EXERCISE' });
    }

    for (const constraintId of excludedExerciseConstraints.get(candidate.exerciseId) ?? []) {
      reasons.push({ code: 'EXCLUDED_EXERCISE', constraintId });
    }

    for (const constraint of excludedFamilyConstraints.get(candidate.exerciseFamilyId) ?? []) {
      reasons.push({
        code: constraint.movementRestriction ? 'RESTRICTED_MOVEMENT_PATTERN' : 'EXCLUDED_FAMILY',
        constraintId: constraint.id,
      });
    }

    const relevantMuscles = candidate.muscleContributions
      .filter(({ muscleId, role }) => role !== 'stabilizer' && targetMuscles.has(muscleId))
      .map(({ muscleId }) => muscleId);
    if (relevantMuscles.length === 0) {
      reasons.push({ code: 'NO_TARGET_MUSCLE_RELEVANCE' });
    }

    const conflictingMuscles = uniqueSorted(
      candidate.muscleContributions
        .filter(({ muscleId }) => excludedMuscles.has(muscleId))
        .map(({ muscleId }) => muscleId),
    );
    if (conflictingMuscles.length > 0) {
      reasons.push({ code: 'EXCLUDED_MUSCLE', relatedMuscleIds: conflictingMuscles });
    }

    const requiredEquipment = candidate.equipment
      .filter(({ requirement }) => requirement === 'required')
      .map(({ equipmentId }) => equipmentId);
    const explicitlyUnavailable = uniqueSorted(
      requiredEquipment.filter((equipmentId) => unavailableEquipment.has(equipmentId)),
    );
    if (explicitlyUnavailable.length > 0) {
      reasons.push({
        code: 'EXPLICITLY_UNAVAILABLE_EQUIPMENT',
        relatedEquipmentIds: explicitlyUnavailable,
      });
    }

    const missingEquipment = uniqueSorted(
      requiredEquipment.filter(
        (equipmentId) =>
          !availableEquipment.has(equipmentId) && !unavailableEquipment.has(equipmentId),
      ),
    );
    if (missingEquipment.length > 0) {
      reasons.push({ code: 'MISSING_REQUIRED_EQUIPMENT', relatedEquipmentIds: missingEquipment });
    }

    if (reasons.length === 0) {
      eligibleCandidates.push(candidate);
    } else {
      rejectedCandidates.push({ candidate, reasons: reasons.sort(compareRejectionReasons) });
    }
  }

  return {
    contractVersion: input.contractVersion,
    version: input.version,
    eligibleCandidates,
    rejectedCandidates,
  };
}

function validateCandidate(
  candidate: WorkoutExerciseCandidate,
  exerciseIdCounts: ReadonlyMap<string, number>,
): readonly WorkoutCandidateInvalidityCode[] {
  const invalidities = new Set<WorkoutCandidateInvalidityCode>();

  if ((exerciseIdCounts.get(candidate.exerciseId) ?? 0) > 1) {
    invalidities.add('DUPLICATE_EXERCISE_ID');
  }
  if (!isUuid(candidate.exerciseId)) {
    invalidities.add('INVALID_EXERCISE_ID');
  }
  if (!isUuid(candidate.exerciseFamilyId)) {
    invalidities.add('INVALID_EXERCISE_FAMILY_ID');
  }
  validateMuscleContributions(candidate.muscleContributions, invalidities);
  validateEquipment(candidate.equipment, invalidities);

  if (
    candidate.durationEstimate !== undefined &&
    (!Number.isFinite(candidate.durationEstimate.setupSeconds) ||
      candidate.durationEstimate.setupSeconds < 0 ||
      !Number.isFinite(candidate.durationEstimate.perSetSeconds) ||
      candidate.durationEstimate.perSetSeconds <= 0)
  ) {
    invalidities.add('INVALID_DURATION_ESTIMATE');
  }

  return [...invalidities].sort(
    (left, right) =>
      workoutCandidateInvalidityCodes.indexOf(left) -
      workoutCandidateInvalidityCodes.indexOf(right),
  );
}

function validateMuscleContributions(
  contributions: readonly WorkoutExerciseMuscleContribution[],
  invalidities: Set<WorkoutCandidateInvalidityCode>,
): void {
  if (contributions.length === 0) {
    invalidities.add('NO_MUSCLE_CONTRIBUTIONS');
  }
  if (!contributions.some(({ role }) => role === 'primary')) {
    invalidities.add('NO_PRIMARY_MUSCLE');
  }
  if (hasDuplicates(contributions.map(({ muscleId }) => muscleId))) {
    invalidities.add('DUPLICATE_MUSCLE');
  }

  contributions.forEach(({ muscleId, contribution }) => {
    if (!isUuid(muscleId)) {
      invalidities.add('INVALID_MUSCLE_ID');
    }
    if (!Number.isFinite(contribution) || contribution <= 0 || contribution > 1) {
      invalidities.add('INVALID_MUSCLE_CONTRIBUTION');
    }
  });
}

function validateEquipment(
  equipment: readonly WorkoutExerciseEquipmentRequirement[],
  invalidities: Set<WorkoutCandidateInvalidityCode>,
): void {
  if (hasDuplicates(equipment.map(({ equipmentId }) => equipmentId))) {
    invalidities.add('DUPLICATE_EQUIPMENT');
  }
  if (equipment.some(({ equipmentId }) => !isUuid(equipmentId))) {
    invalidities.add('INVALID_EQUIPMENT_ID');
  }
}

function compareCandidates(
  left: WorkoutExerciseCandidate,
  right: WorkoutExerciseCandidate,
): number {
  return candidateStableKey(left).localeCompare(candidateStableKey(right));
}

function candidateStableKey(candidate: WorkoutExerciseCandidate): string {
  const muscles = candidate.muscleContributions
    .map(({ muscleId, role, contribution }) => `${muscleId}:${role}:${contribution}`)
    .sort()
    .join('|');
  const equipment = candidate.equipment
    .map(({ equipmentId, requirement }) => `${equipmentId}:${requirement}`)
    .sort()
    .join('|');
  const duration = candidate.durationEstimate
    ? `${candidate.durationEstimate.setupSeconds}:${candidate.durationEstimate.perSetSeconds}`
    : '';

  return `${candidate.exerciseId}:${candidate.exerciseFamilyId}:${String(candidate.isActive)}:${muscles}:${equipment}:${duration}`;
}

function compareRejectionReasons(
  left: WorkoutCandidateRejectionReason,
  right: WorkoutCandidateRejectionReason,
): number {
  const codeOrder =
    workoutCandidateRejectionCodes.indexOf(left.code) -
    workoutCandidateRejectionCodes.indexOf(right.code);
  if (codeOrder !== 0) {
    return codeOrder;
  }
  return (left.constraintId ?? '').localeCompare(right.constraintId ?? '');
}

function countValues(values: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return counts;
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function uniqueSorted<Value extends string>(values: readonly Value[]): readonly Value[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
