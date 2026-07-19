export type ProgramGoal = 'build_muscle' | 'gain_strength' | 'recomposition' | 'fat_loss_support';
export type ProgramDurationWeeks = 8 | 12 | 16;

export interface ProgramSetupDraft {
  readonly goal: ProgramGoal;
  readonly experience: 'beginner' | 'intermediate' | 'advanced';
  readonly daysPerWeek: number;
  readonly sessionDurationMinutes: number;
  readonly durationWeeks: ProgramDurationWeeks;
  readonly startDate: string;
  readonly equipment: readonly string[];
  readonly programPreference: 'app_decide' | 'push_pull_legs' | 'upper_lower' | 'full_body';
  readonly dislikedExerciseIds: readonly string[];
  readonly restrictedMovementPatterns: readonly string[];
}

export interface ProgramPrescriptionDto {
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

export interface ProgramTemplateDto {
  readonly templateKey: string;
  readonly name: string;
  readonly focus: readonly string[];
  readonly expectedDurationMinutes: number;
  readonly prescriptions: readonly ProgramPrescriptionDto[];
}

export interface ProgramScheduleDto {
  readonly scheduleKey: string;
  readonly week: number;
  readonly dayOfWeek: number;
  readonly scheduledDate: string;
  readonly phase: 'foundation' | 'build' | 'intensification' | 'deload';
  readonly isDeload: boolean;
  readonly templateKey: string;
}

export interface GeneratedProgramDto {
  readonly name: string;
  readonly split: string;
  readonly engineVersion: string;
  readonly ruleSetVersion: string;
  readonly templates: readonly ProgramTemplateDto[];
  readonly schedule: readonly ProgramScheduleDto[];
}

export interface ScheduledWorkoutState extends ProgramScheduleDto {
  readonly id: string;
  readonly status: 'upcoming' | 'in_progress' | 'completed' | 'skipped' | 'rescheduled';
  readonly originalScheduledDate: string;
}

export interface ProgramAdaptationDto {
  readonly id: string;
  readonly affectedRegion: string;
  readonly affectedMovementPatterns: readonly string[];
  readonly severity: 'mild' | 'moderate' | 'severe';
  readonly startDate: string;
  readonly reviewDate: string | null;
}

export interface LoadedProgram {
  readonly id: string;
  readonly revisionId: string;
  readonly revision: number;
  readonly startDate: string;
  readonly durationWeeks: number;
  readonly generated: GeneratedProgramDto;
  readonly setup: ProgramSetupDraft;
  readonly schedule: readonly ScheduledWorkoutState[];
  readonly adaptations: readonly ProgramAdaptationDto[];
}
