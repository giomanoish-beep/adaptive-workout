import type {
  ContractVersion,
  DeterministicEngineVersion,
  DomainId,
  EngineVersion,
  EquipmentId,
  ExerciseEquipmentRequirement,
  ExerciseFamilyId,
  ExerciseId,
  ExerciseMuscleRole,
  MuscleId,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import type { WorkoutConstraint } from './constraints.js';

export type UserId = DomainId<'user'>;
export type ProgramId = DomainId<'program'>;
export type ProgramWorkoutId = DomainId<'program-workout'>;
export type WorkoutDecisionId = DomainId<'workout-decision'>;

export const workoutOrigins = ['generated', 'programmed', 'custom', 'adapted'] as const;
export type WorkoutOrigin = (typeof workoutOrigins)[number];

export const workoutGoals = ['strength', 'hypertrophy', 'general_fitness'] as const;
export type WorkoutGoal = (typeof workoutGoals)[number];

export const trainingExperienceLevels = ['beginner', 'intermediate', 'advanced'] as const;
export type TrainingExperienceLevel = (typeof trainingExperienceLevels)[number];

export interface WorkoutTargetMuscle {
  readonly muscleId: MuscleId;
  readonly priority: 'required' | 'preferred';
}

export interface WorkoutExerciseCandidate {
  readonly exerciseId: ExerciseId;
  readonly exerciseFamilyId: ExerciseFamilyId;
  readonly isActive: boolean;
  readonly muscleContributions: readonly WorkoutExerciseMuscleContribution[];
  readonly equipment: readonly WorkoutExerciseEquipmentRequirement[];
  readonly durationEstimate?: ExerciseDurationEstimate;
}

export interface WorkoutExerciseMuscleContribution {
  readonly muscleId: MuscleId;
  readonly role: ExerciseMuscleRole;
  readonly contribution: number;
}

export interface WorkoutExerciseEquipmentRequirement {
  readonly equipmentId: EquipmentId;
  readonly requirement: ExerciseEquipmentRequirement;
}

export interface ExerciseDurationEstimate {
  readonly setupSeconds: number;
  readonly perSetSeconds: number;
}

export interface RecentMuscleTrainingContext {
  readonly muscleId: MuscleId;
  readonly recentWorkingSets: number;
  readonly fatigueScore?: number;
  readonly calculatedAt: string;
}

export interface RecentExerciseExposureContext {
  readonly exerciseId: ExerciseId;
  readonly lastPerformedAt?: string;
  readonly completedWorkingSets: number;
  readonly lastPerformedReps?: number;
  readonly lastPerformedRir?: number;
}

export interface ExercisePreferenceContext {
  readonly exerciseId: ExerciseId;
  readonly preference: 'like' | 'dislike';
}

export interface ProgramExercisePrescriptionContext {
  readonly position: number;
  readonly exerciseId: ExerciseId;
  readonly targetSets: number;
  readonly targetReps: RepRange;
  readonly targetRir?: number;
  readonly restSeconds?: number;
}

export interface ProgramWorkoutPrescriptionContext {
  readonly programId: ProgramId;
  readonly programWorkoutId: ProgramWorkoutId;
  readonly programVersion: number;
  readonly exercises: readonly ProgramExercisePrescriptionContext[];
}

export interface WorkoutEngineInput {
  readonly contractVersion: ContractVersion;
  readonly subjectUserId?: UserId;
  readonly sessionDate: string;
  readonly deterministicSeed: string;
  readonly origin: WorkoutOrigin;
  readonly goal: WorkoutGoal;
  readonly experienceLevel: TrainingExperienceLevel;
  readonly targetMuscles: readonly WorkoutTargetMuscle[];
  readonly excludedMuscleIds: readonly MuscleId[];
  readonly availableDurationMinutes: number;
  readonly availableEquipmentIds: readonly EquipmentId[];
  readonly exerciseCatalog: readonly WorkoutExerciseCandidate[];
  readonly recentMuscleTraining: readonly RecentMuscleTrainingContext[];
  readonly recentExerciseExposures: readonly RecentExerciseExposureContext[];
  readonly exercisePreferences: readonly ExercisePreferenceContext[];
  readonly constraints: readonly WorkoutConstraint[];
  readonly programPrescription?: ProgramWorkoutPrescriptionContext;
  readonly version: DeterministicEngineVersion;
}

export interface GeneratedWorkoutPlan {
  readonly origin: WorkoutOrigin;
  readonly exercises: readonly GeneratedWorkoutExercise[];
  readonly estimatedTotalDurationMinutes: number;
  readonly targetMuscleVolume: readonly TargetMuscleVolumeSummary[];
}

export interface GeneratedWorkoutExercise {
  readonly position: number;
  readonly exerciseId: ExerciseId;
  readonly exerciseFamilyId: ExerciseFamilyId;
  readonly plannedSets: readonly PlannedWorkoutSet[];
  readonly estimatedDurationMinutes: number;
  readonly reasonCodes: readonly string[];
}

export interface PlannedWorkoutSet {
  readonly setNumber: number;
  readonly classification: 'warm_up' | 'working';
  readonly targetReps: RepRange;
  readonly targetRir?: number;
  readonly restSeconds?: number;
}

export interface RepRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface TargetMuscleVolumeSummary {
  readonly muscleId: MuscleId;
  readonly plannedWorkingSets: number;
  readonly weightedSetContribution: number;
}

export interface WorkoutDecisionRecord {
  readonly decisionType: 'workout_generation';
  readonly engineName: string;
  readonly engineVersion: EngineVersion;
  readonly ruleSetVersion: RuleSetVersion;
  readonly deterministicSeed: string;
  readonly reasonCodes: readonly string[];
  readonly exclusions: readonly WorkoutCandidateExclusion[];
  readonly warnings: readonly WorkoutEngineWarning[];
}

export interface WorkoutCandidateExclusion {
  readonly exerciseId: ExerciseId;
  readonly reasonCode: string;
  readonly constraintId?: string;
}

export interface WorkoutEngineWarning {
  readonly code: string;
  readonly relatedMuscleId?: MuscleId;
  readonly relatedExerciseId?: ExerciseId;
}

export interface WorkoutEngineSuccess {
  readonly status: 'success';
  readonly contractVersion: ContractVersion;
  readonly plan: GeneratedWorkoutPlan;
  readonly decision: WorkoutDecisionRecord;
  readonly version: DeterministicEngineVersion;
}

export const workoutEngineFailureCodes = [
  'NO_TARGET_MUSCLES',
  'INVALID_DURATION',
  'UNSATISFIABLE_EQUIPMENT_CONSTRAINTS',
  'NO_ELIGIBLE_EXERCISES',
  'REQUIRED_MUSCLE_COVERAGE_UNSATISFIED',
  'DURATION_CONSTRAINT_IMPOSSIBLE',
  'CONTRADICTORY_CONSTRAINTS',
  'INVALID_INPUT',
  'UNSUPPORTED_VERSION',
] as const;

export type WorkoutEngineFailureCode = (typeof workoutEngineFailureCodes)[number];

export interface WorkoutEngineFailure {
  readonly status: 'failure';
  readonly contractVersion: ContractVersion;
  readonly code: WorkoutEngineFailureCode;
  readonly message: string;
  readonly reasonCodes: readonly string[];
  readonly relatedConstraintIds: readonly string[];
  readonly version: DeterministicEngineVersion;
}

export type WorkoutEngineResult = WorkoutEngineSuccess | WorkoutEngineFailure;

export type PersistedWorkoutDecisionReference = {
  readonly decisionId: WorkoutDecisionId;
};
