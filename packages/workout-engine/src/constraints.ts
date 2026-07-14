import type { EquipmentId, ExerciseFamilyId, ExerciseId, MuscleId } from '@adaptive-workout/domain';

export const workoutConstraintSources = [
  'user',
  'program',
  'preference',
  'safety',
  'system',
] as const;

export type WorkoutConstraintSource = (typeof workoutConstraintSources)[number];

interface WorkoutConstraintBase<Kind extends string> {
  readonly id: string;
  readonly kind: Kind;
  readonly source: WorkoutConstraintSource;
  readonly reasonCode: string;
}

export interface RequiredTargetMusclesConstraint extends WorkoutConstraintBase<'required_target_muscles'> {
  readonly muscleIds: readonly MuscleId[];
}

export interface ExcludedMusclesConstraint extends WorkoutConstraintBase<'excluded_muscles'> {
  readonly muscleIds: readonly MuscleId[];
}

export interface UnavailableEquipmentConstraint extends WorkoutConstraintBase<'unavailable_equipment'> {
  readonly equipmentIds: readonly EquipmentId[];
}

export interface ExcludedExercisesConstraint extends WorkoutConstraintBase<'excluded_exercises'> {
  readonly exerciseIds: readonly ExerciseId[];
}

export interface ExcludedExerciseFamiliesConstraint extends WorkoutConstraintBase<'excluded_exercise_families'> {
  readonly exerciseFamilyIds: readonly ExerciseFamilyId[];
}

export interface ReducedExercisePriorityConstraint extends WorkoutConstraintBase<'reduced_exercise_priority'> {
  readonly exerciseIds: readonly ExerciseId[];
}

export interface PreferredExercisesConstraint extends WorkoutConstraintBase<'preferred_exercises'> {
  readonly exerciseIds: readonly ExerciseId[];
}

export interface PreferredMusclesConstraint extends WorkoutConstraintBase<'preferred_muscles'> {
  readonly muscleIds: readonly MuscleId[];
}

export interface PreferredExerciseFamiliesConstraint extends WorkoutConstraintBase<'preferred_exercise_families'> {
  readonly exerciseFamilyIds: readonly ExerciseFamilyId[];
}

export interface MaximumWorkoutDurationConstraint extends WorkoutConstraintBase<'maximum_workout_duration'> {
  readonly maximumMinutes: number;
}

export interface MuscleVolumeLimitConstraint extends WorkoutConstraintBase<'muscle_volume_limit'> {
  readonly muscleId: MuscleId;
  readonly minimumWorkingSets?: number;
  readonly maximumWorkingSets: number;
}

export type WorkoutConstraint =
  | RequiredTargetMusclesConstraint
  | ExcludedMusclesConstraint
  | UnavailableEquipmentConstraint
  | ExcludedExercisesConstraint
  | ExcludedExerciseFamiliesConstraint
  | ReducedExercisePriorityConstraint
  | PreferredExercisesConstraint
  | PreferredMusclesConstraint
  | PreferredExerciseFamiliesConstraint
  | MaximumWorkoutDurationConstraint
  | MuscleVolumeLimitConstraint;
