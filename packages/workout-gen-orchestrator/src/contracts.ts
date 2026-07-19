/**
 * Browser-safe and server-side contracts for workout generation orchestration.
 *
 * These types define the boundary between the browser, the Edge Function,
 * and the server-side orchestrator. No Supabase client, engine internals,
 * or AI provider types leak into browser-facing contracts.
 */

/* ------------------------------------------------------------------ */
/*  Browser → Server request                                           */
/* ------------------------------------------------------------------ */

/** Structured workout generation request from the browser. */
export interface GenerateWorkoutRequest {
  /** UI muscle option IDs that map to canonical muscle slugs via server-side mapping. */
  readonly targetMuscles: readonly string[];
  /** Optional excluded muscle IDs (same format as targetMuscles). */
  readonly excludedMuscles?: readonly string[];
  /** Duration in minutes, validated 15-240. */
  readonly durationMinutes: number;
  /** UI equipment context ID that maps to canonical equipment slugs server-side. */
  readonly equipmentContext: string;
  /** Optional emphasis muscle (UI option ID). */
  readonly emphasis?: string;
  /** Optional unavailable equipment IDs. */
  readonly unavailableEquipment?: readonly string[];
}

/** Browser-safe request for replacing one exercise in the current workout only. */
export interface ReplaceWorkoutExerciseRequest extends GenerateWorkoutRequest {
  readonly action: 'replace_exercise';
  readonly currentExerciseId: string;
  readonly workoutExerciseIds: readonly string[];
  /** Previously shown replacements, used to avoid an immediate cycle. */
  readonly excludedReplacementIds?: readonly string[];
}

export interface ReplaceWorkoutExerciseSuccess {
  readonly status: 'success';
  readonly action: 'replace_exercise';
  readonly replacement: {
    readonly exerciseId: string;
    readonly exerciseVersion: number;
    readonly name: string;
  };
}

export interface ReplaceWorkoutExerciseError {
  readonly status: 'error';
  readonly action: 'replace_exercise';
  readonly code:
    | 'INVALID_REQUEST'
    | 'PROFILE_MISSING'
    | 'DISCOMFORT_REVIEW_REQUIRED'
    | 'CATALOG_UNAVAILABLE'
    | 'NO_VALID_SUBSTITUTE';
  readonly message: string;
}

export type ReplaceWorkoutExerciseResponse =
  ReplaceWorkoutExerciseSuccess | ReplaceWorkoutExerciseError;

/* ------------------------------------------------------------------ */
/*  Server → Browser response (review DTO)                             */
/* ------------------------------------------------------------------ */

export interface WorkoutReviewRepRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface WorkoutReviewExercise {
  readonly position: number;
  /** Canonical exercise ID (UUID). */
  readonly exerciseId: string;
  /** Catalog version paired with the canonical exercise ID. */
  readonly exerciseVersion: number;
  readonly name: string;
  readonly sets: number;
  readonly reps: WorkoutReviewRepRange;
  readonly rir: number;
  /** Planned rest in seconds, or null if not prescribed. */
  readonly restSeconds: number | null;
}

export interface WorkoutReviewMuscleVolume {
  readonly muscle: string;
  readonly volume: number;
}

export interface WorkoutReviewSuccess {
  readonly status: 'success';
  /** Generation correlation ID. */
  readonly generationId: string;
  readonly title: string;
  readonly estimatedDurationMinutes: number;
  readonly totalWorkingSets: number;
  readonly exercises: readonly WorkoutReviewExercise[];
  readonly muscleVolume: readonly WorkoutReviewMuscleVolume[];
  /** The training goal applied (from profile). */
  readonly appliedGoal: string;
  readonly engineVersion: string;
  readonly ruleSetVersion: string;
  /** Controlled trace summary for UI debugging only. */
  readonly traceSummary: string | null;
}

/* ------------------------------------------------------------------ */
/*  Controlled error responses                                         */
/* ------------------------------------------------------------------ */

export const generationErrorCodes = [
  'UNAUTHENTICATED',
  'INVALID_REQUEST',
  'PROFILE_MISSING',
  'PROFILE_INVALID',
  'DISCOMFORT_REVIEW_REQUIRED',
  'CATALOG_UNAVAILABLE',
  'NO_FEASIBLE_WORKOUT',
  'GENERATION_FAILED',
  'RATE_LIMITED',
] as const;

export type GenerationErrorCode = (typeof generationErrorCodes)[number];

export interface WorkoutReviewError {
  readonly status: 'error';
  readonly generationId: string | null;
  readonly code: GenerationErrorCode;
  /** User-facing message. */
  readonly message: string;
}

export type WorkoutReviewResponse = WorkoutReviewSuccess | WorkoutReviewError;

/* ------------------------------------------------------------------ */
/*  Server-side profile shape (loaded from DB, not sent from browser)   */
/* ------------------------------------------------------------------ */

export interface ServerTrainingProfile {
  readonly goal: string;
  readonly experience: string;
  readonly frequency: string;
  readonly typicalDurationMinutes: number;
  readonly environment: string;
  readonly programPreference: string;
  readonly hasCurrentDiscomfort: boolean;
}

/* ------------------------------------------------------------------ */
/*  Server-side catalog types                                          */
/* ------------------------------------------------------------------ */

export interface CatalogExerciseRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly exerciseFamilyId: string;
  readonly exerciseFamilySlug: string;
  readonly isActive: boolean;
  readonly version: number;
}

export interface CatalogMuscleRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly isActive: boolean;
}

export interface CatalogExerciseMuscleRow {
  readonly exerciseId: string;
  readonly muscleId: string;
  readonly role: 'primary' | 'secondary' | 'stabilizer';
  readonly contribution: number;
}

export interface CatalogExerciseEquipmentRow {
  readonly exerciseId: string;
  readonly equipmentId: string;
  readonly equipmentSlug: string;
  readonly requirement: 'required' | 'optional';
}

export interface CatalogEquipmentRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly isActive: boolean;
}

/* ------------------------------------------------------------------ */
/*  Equipment context → equipment ID mapping                           */
/* ------------------------------------------------------------------ */

/**
 * Maps a structured UI equipment context ID to an array of canonical
 * equipment slugs that should be available for filtering.
 */
export type EquipmentContextMap = Readonly<Record<string, readonly string[]>>;

/**
 * Maps a structured UI muscle option ID to a canonical muscle slug
 * used in the database catalog.
 */
export type MuscleIdMap = Readonly<Record<string, string>>;

/* ------------------------------------------------------------------ */
/*  Dependency injection ports                                         */
/* ------------------------------------------------------------------ */

export interface CatalogLoader {
  loadActiveCatalog(): Promise<{
    exercises: readonly CatalogExerciseRow[];
    muscles: readonly CatalogMuscleRow[];
    exerciseMuscles: readonly CatalogExerciseMuscleRow[];
    exerciseEquipment: readonly CatalogExerciseEquipmentRow[];
    equipment: readonly CatalogEquipmentRow[];
  }>;
}

export interface ProfileLoader {
  loadProfile(userId: string): Promise<ServerTrainingProfile | null>;
}

/* ------------------------------------------------------------------ */
/*  Orchestrator dependencies                                          */
/* ------------------------------------------------------------------ */

export interface WorkoutGenerationDependencies {
  readonly profileLoader: ProfileLoader;
  readonly catalogLoader: CatalogLoader;
  readonly equipmentContextMap: EquipmentContextMap;
  readonly muscleIdMap: MuscleIdMap;
  /** Correlation ID for observability. */
  readonly correlationId?: string;
}
