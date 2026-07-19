export const PROGRAM_ENGINE_VERSION = 'program-engine-v1.2.0';
export const PROGRAM_RULE_SET_VERSION = 'program-rules-v1.2.0';

export type ProgramGoal = 'build_muscle' | 'gain_strength' | 'recomposition' | 'fat_loss_support';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type ProgramDurationWeeks = 8 | 12 | 16;
export type ProgramPreference = 'app_decide' | 'push_pull_legs' | 'upper_lower' | 'full_body';

export interface ProgramExerciseCandidate {
  readonly id: string;
  readonly name: string;
  readonly movementPattern: string;
  readonly primaryMuscle: string;
  readonly equipment: readonly string[];
}

export interface ProgramSetup {
  readonly goal: ProgramGoal;
  readonly experience: Experience;
  readonly daysPerWeek: number;
  readonly sessionDurationMinutes: number;
  readonly durationWeeks: ProgramDurationWeeks;
  readonly startDate: string;
  readonly equipment: readonly string[];
  readonly programPreference: ProgramPreference;
  readonly dislikedExerciseIds: readonly string[];
  readonly restrictedMovementPatterns: readonly string[];
}

export interface ProgramPrescription {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly position: number;
  readonly movementPattern: string;
  readonly sets: number;
  readonly repsMin: number;
  readonly repsMax: number;
  readonly targetRir: number;
  readonly restSeconds: number;
  readonly initialLoadKg: number | null;
  readonly calibrationStatus: 'calibration_required' | 'history_based';
  readonly recommendationReason: string;
}

export interface ProgramSessionTemplate {
  readonly templateKey: string;
  readonly name: string;
  readonly focus: readonly string[];
  readonly expectedDurationMinutes: number;
  readonly prescriptions: readonly ProgramPrescription[];
}

export interface ScheduledProgramSession {
  readonly scheduleKey: string;
  readonly week: number;
  readonly dayOfWeek: number;
  readonly scheduledDate: string;
  readonly phase: 'foundation' | 'build' | 'intensification' | 'deload';
  readonly isDeload: boolean;
  readonly templateKey: string;
}

export interface GeneratedProgram {
  readonly name: string;
  readonly split: string;
  readonly engineVersion: string;
  readonly ruleSetVersion: string;
  readonly templates: readonly ProgramSessionTemplate[];
  readonly schedule: readonly ScheduledProgramSession[];
}

export interface ActiveAdaptation {
  readonly id: string;
  readonly affectedRegion: string;
  readonly affectedMovementPatterns: readonly string[];
  readonly severity: 'mild' | 'moderate' | 'severe';
  readonly startDate: string;
  readonly endDate: string | null;
}

export interface AdaptedPrescription {
  readonly base: ProgramPrescription;
  readonly effective: ProgramPrescription | null;
  readonly adapted: boolean;
  readonly reasonCodes: readonly string[];
}

export interface ExerciseHistorySummary {
  readonly weightKg: number;
  readonly reps: number;
  readonly rir: number | null;
  readonly recommendedWeightKg: number | null;
}
