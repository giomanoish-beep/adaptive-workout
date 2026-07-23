/**
 * CLOUD-002: Browser-safe workout session persistence boundary.
 *
 * All Supabase writes for workout_sessions, workout_session_exercises, and
 * set_logs flow through this module. It uses the single Supabase client owned
 * by App.tsx — no second client, no service-role key, no browser storage.
 *
 * RLS is authoritative: every operation is scoped to auth.uid().
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  LoadPrescriptionKind,
  WorkoutReview,
  WorkoutReviewExercise,
} from '../workout/workout-review';
import type { LoggedSetValue } from '../active-workout/active-workout-validation';

/* ------------------------------------------------------------------ */
/*  Public return types                                                */
/* ------------------------------------------------------------------ */

export interface SessionRow {
  readonly id: string;
  readonly userId: string;
  readonly title: string | null;
  readonly origin: string;
  readonly status: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly plannedDurationMinutes: number | null;
  readonly createdAt: string;
}

export interface SessionExerciseRow {
  readonly id: string;
  readonly workoutSessionId: string;
  readonly plannedExerciseId: string | null;
  readonly position: number;
  readonly status: string;
  readonly plannedExerciseName: string;
  readonly plannedExerciseVersion: number | null;
  readonly plannedSets: number;
  readonly plannedRepsMin: number | null;
  readonly plannedRepsMax: number | null;
  readonly plannedRir: number | null;
  readonly plannedRestSeconds: number | null;
  readonly plannedLoadKind: LoadPrescriptionKind | null;
  readonly plannedLoadKg: number | null;
  readonly plannedLoadLabel: string | null;
  readonly plannedLoadIncrementKg: number | null;
}

export interface SetLogRow {
  readonly id: string;
  readonly workoutSessionExerciseId: string;
  readonly setNumber: number;
  readonly setType: string;
  readonly status: string;
  readonly weight: number | null;
  readonly weightUnit: string | null;
  readonly reps: number | null;
  readonly rir: number | null;
  readonly performedAt: string | null;
}

export interface LoadedSession {
  readonly session: SessionRow;
  readonly exercises: readonly SessionExerciseRow[];
  /** Map keyed by `${exerciseId}:${setNumber}` */
  readonly setLogs: ReadonlyMap<string, SetLogRow>;
}

export interface SessionCreateOptions {
  readonly origin?: 'generated' | 'programmed' | 'adapted';
  readonly scheduledProgramWorkoutId?: string;
  readonly programWorkoutId?: string;
  readonly programVersion?: number;
  readonly programWorkoutName?: string;
  readonly engineVersion?: string;
  readonly ruleSetVersion?: string;
}

/* ------------------------------------------------------------------ */
/*  Repository errors                                                  */
/* ------------------------------------------------------------------ */

export class WorkoutSessionError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'WorkoutSessionError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/*  Column mapping                                                     */
/* ------------------------------------------------------------------ */

function mapSessionRow(row: Record<string, unknown>): SessionRow {
  return {
    id: row['id'] as string,
    userId: row['user_id'] as string,
    title: (row['title'] as string | null) ?? null,
    origin: row['origin'] as string,
    status: row['status'] as string,
    startedAt: (row['started_at'] as string | null) ?? null,
    completedAt: (row['completed_at'] as string | null) ?? null,
    plannedDurationMinutes: (row['planned_duration_minutes'] as number | null) ?? null,
    createdAt: row['created_at'] as string,
  };
}

function mapExerciseRow(row: Record<string, unknown>): SessionExerciseRow {
  return {
    id: row['id'] as string,
    workoutSessionId: row['workout_session_id'] as string,
    plannedExerciseId: (row['planned_exercise_id'] as string | null) ?? null,
    position: row['position'] as number,
    status: row['status'] as string,
    plannedExerciseName: row['planned_exercise_name'] as string,
    plannedExerciseVersion: (row['planned_exercise_version'] as number | null) ?? null,
    plannedSets: row['planned_sets'] as number,
    plannedRepsMin: (row['planned_reps_min'] as number | null) ?? null,
    plannedRepsMax: (row['planned_reps_max'] as number | null) ?? null,
    plannedRir: (row['planned_rir'] as number | null) ?? null,
    plannedRestSeconds: (row['planned_rest_seconds'] as number | null) ?? null,
    plannedLoadKind: (row['planned_load_kind'] as LoadPrescriptionKind | null) ?? null,
    plannedLoadKg: (row['planned_load_kg'] as number | null) ?? null,
    plannedLoadLabel: (row['planned_load_label'] as string | null) ?? null,
    plannedLoadIncrementKg: (row['planned_load_increment'] as number | null) ?? null,
  };
}

function mapSetLogRow(row: Record<string, unknown>): SetLogRow {
  return {
    id: row['id'] as string,
    workoutSessionExerciseId: row['workout_session_exercise_id'] as string,
    setNumber: row['set_number'] as number,
    setType: row['set_type'] as string,
    status: row['status'] as string,
    weight: (row['weight'] as number | null) ?? null,
    weightUnit: (row['weight_unit'] as string | null) ?? null,
    reps: (row['reps'] as number | null) ?? null,
    rir: (row['rir'] as number | null) ?? null,
    performedAt: (row['performed_at'] as string | null) ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Repository implementation                                          */
/* ------------------------------------------------------------------ */

export function createWorkoutSessionRepository(client: SupabaseClient) {
  /**
   * Creates a session + all planned exercises in a sequential but
   * error-recoverable flow. If exercise insertion fails, the session is
   * deleted to avoid orphaned sessions.
   */
  async function createSession(
    review: WorkoutReview,
    options: SessionCreateOptions = {},
  ): Promise<{ sessionId: string; exercises: readonly SessionExerciseRow[] }> {
    // Derive authenticated user ID from the Supabase client.
    // Never accept ownership from the WorkoutReview or arbitrary caller input.
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();

    if (authError || !user) {
      throw new WorkoutSessionError('AUTH_REQUIRED', 'You must be signed in to start a workout.');
    }

    const userId = user.id;
    const now = new Date().toISOString();

    // 1. Insert session — include the authenticated user_id so RLS
    //    WITH CHECK (user_id = auth.uid()) passes.
    const { data: sessionData, error: sessionError } = await client
      .from('workout_sessions')
      .insert({
        user_id: userId,
        title: review.title,
        origin: options.origin ?? 'generated',
        status: 'in_progress',
        planned_duration_minutes: review.estimatedDurationMinutes,
        started_at: now,
        scheduled_program_workout_id: options.scheduledProgramWorkoutId ?? null,
        source_program_workout_id: options.programWorkoutId ?? null,
        source_program_version: options.programVersion ?? null,
        source_program_workout_name: options.programWorkoutName ?? null,
        workout_engine_version: options.engineVersion ?? null,
        workout_rule_set_version: options.ruleSetVersion ?? null,
        counts_for_program: options.scheduledProgramWorkoutId !== undefined,
      })
      .select(
        'id, user_id, title, origin, status, started_at, completed_at, planned_duration_minutes, created_at',
      )
      .single();

    if (sessionError || !sessionData) {
      throw new WorkoutSessionError(
        'SESSION_CREATE_FAILED',
        "We couldn't start your workout. Please try again.",
      );
    }

    const sessionId = sessionData['id'] as string;

    // 2. Insert planned exercises
    const exercises: SessionExerciseRow[] = [];
    for (const exercise of review.exercises) {
      const exerciseRow = toExerciseInsert(sessionId, exercise);
      const exerciseResult = await client
        .from('workout_session_exercises')
        .insert(exerciseRow)
        .select('*')
        .single();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Supabase .single() returns any-typed data
      const inserted = exerciseResult.data;
      const exerciseError = exerciseResult.error;

      if (exerciseError || !inserted) {
        // Cleanup: delete the session we just created
        await client.from('workout_sessions').delete().eq('id', sessionId);
        throw new WorkoutSessionError(
          'EXERCISE_CREATE_FAILED',
          "We couldn't start your workout. Please try again.",
        );
      }

      exercises.push(mapExerciseRow(inserted as Record<string, unknown>));
    }

    return { sessionId, exercises };
  }

  /** Loads an active session with exercises and set logs. */
  async function loadActiveSession(userId: string): Promise<LoadedSession | null> {
    // Find most recently started in_progress session
    const { data: sessions, error: sessionError } = await client
      .from('workout_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1);

    if (sessionError) {
      throw new WorkoutSessionError(
        'SESSION_LOAD_FAILED',
        "We couldn't load your workout session. Please try again.",
      );
    }

    if (!sessions || sessions.length === 0) return null;
    const session = mapSessionRow(sessions[0] as Record<string, unknown>);

    // Load exercises
    const { data: exerciseData, error: exerciseError } = await client
      .from('workout_session_exercises')
      .select('*')
      .eq('workout_session_id', session.id)
      .order('position', { ascending: true });

    if (exerciseError) {
      throw new WorkoutSessionError(
        'EXERCISES_LOAD_FAILED',
        "We couldn't load your workout session. Please try again.",
      );
    }

    const exercises = (exerciseData ?? []).map((row) =>
      mapExerciseRow(row as Record<string, unknown>),
    );

    // Load set logs
    const exerciseIds = exercises.map((e) => e.id);
    let setLogs: ReadonlyMap<string, SetLogRow> = new Map();
    if (exerciseIds.length > 0) {
      const { data: setData, error: setError } = await client
        .from('set_logs')
        .select('*')
        .in('workout_session_exercise_id', exerciseIds)
        .order('set_number', { ascending: true });

      if (setError) {
        throw new WorkoutSessionError(
          'SET_LOGS_LOAD_FAILED',
          "We couldn't load your workout session. Please try again.",
        );
      }

      setLogs = new Map(
        (setData ?? []).map((row) => {
          const log = mapSetLogRow(row as Record<string, unknown>);
          return [`${log.workoutSessionExerciseId}:${log.setNumber}`, log];
        }),
      );
    }

    return { session, exercises, setLogs };
  }

  /**
   * Upserts a set log. Uses deterministic identity: (workout_session_exercise_id, set_number).
   * On conflict, updates the existing row (idempotent).
   */
  async function upsertSetLog(
    workoutSessionExerciseId: string,
    setNumber: number,
    value: LoggedSetValue,
  ): Promise<SetLogRow> {
    const now = new Date().toISOString();

    const upsertResult = await client
      .from('set_logs')
      .upsert(
        {
          workout_session_exercise_id: workoutSessionExerciseId,
          set_number: setNumber,
          set_type: 'working',
          status: 'completed',
          weight: value.weight,
          weight_unit: 'kg',
          reps: value.reps,
          rir: value.rir,
          performed_at: now,
        },
        {
          onConflict: 'workout_session_exercise_id,set_number',
          ignoreDuplicates: false,
        },
      )
      .select('*')
      .single();

    if (upsertResult.error || !upsertResult.data) {
      throw new WorkoutSessionError(
        'SET_LOG_UPSERT_FAILED',
        "We couldn't save your set. Please try again.",
      );
    }

    return mapSetLogRow(upsertResult.data as Record<string, unknown>);
  }

  /**
   * Finishes a session: sets completed_at timestamp and determines final status.
   * - completed: all planned exercises are complete
   * - partial: explicitly finished but some planned sets remain incomplete
   */
  async function finishSession(
    sessionId: string,
    hasIncomplete: boolean,
    scheduledProgramWorkoutId?: string,
  ): Promise<SessionRow> {
    const now = new Date().toISOString();
    const status = hasIncomplete ? 'partial' : 'completed';

    const finishResult = await client
      .from('workout_sessions')
      .update({
        status,
        completed_at: now,
      })
      .eq('id', sessionId)
      .select('*')
      .single();

    if (finishResult.error || !finishResult.data) {
      throw new WorkoutSessionError(
        'SESSION_FINISH_FAILED',
        "We couldn't finish your workout. Please try again.",
      );
    }

    if (scheduledProgramWorkoutId) {
      const { error: scheduleError } = await client
        .from('program_scheduled_workouts')
        .update({
          status: 'completed',
          completed_session_id: sessionId,
          completed_at: now,
        })
        .eq('id', scheduledProgramWorkoutId);
      if (scheduleError) {
        throw new WorkoutSessionError(
          'PROGRAM_ADVANCE_FAILED',
          'Your workout was saved, but the program could not advance. Please retry.',
        );
      }
    }

    return mapSessionRow(finishResult.data as Record<string, unknown>);
  }

  return {
    createSession,
    loadActiveSession,
    upsertSetLog,
    finishSession,
  };
}

export type WorkoutSessionRepository = ReturnType<typeof createWorkoutSessionRepository>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toExerciseInsert(
  sessionId: string,
  exercise: WorkoutReviewExercise,
): Record<string, unknown> {
  // The deployed constraint requires the canonical ID and catalog version to
  // be present together. Local fixtures without either value use the name
  // snapshot only.
  const hasCatalogIdentity =
    typeof exercise.exerciseId === 'string' &&
    typeof exercise.exerciseVersion === 'number' &&
    Number.isInteger(exercise.exerciseVersion) &&
    exercise.exerciseVersion > 0;

  return {
    workout_session_id: sessionId,
    planned_exercise_id: hasCatalogIdentity ? exercise.exerciseId : null,
    position: exercise.position,
    status: 'planned',
    planned_exercise_name: exercise.name,
    planned_exercise_version: hasCatalogIdentity ? exercise.exerciseVersion : null,
    planned_sets: exercise.sets,
    planned_reps_min: exercise.reps.minimum,
    planned_reps_max: exercise.reps.maximum,
    planned_rir: exercise.rir,
    planned_rest_seconds: exercise.restSeconds ?? null,
    planned_load_kind: exercise.loadPrescription.kind,
    planned_load_kg: exercise.loadPrescription.suggestedLoadKg,
    planned_load_label: exercise.loadPrescription.label,
    planned_load_increment: exercise.loadPrescription.incrementKg,
  };
}
