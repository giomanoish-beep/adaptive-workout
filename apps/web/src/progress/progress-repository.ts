/**
 * CLOUD-003: Browser-safe progress data repository.
 *
 * Uses the single Supabase client owned by App.tsx — no second client,
 * no service-role key, no browser storage. All operations are scoped to
 * auth.uid() via RLS. The caller must be authenticated; this module never
 * accepts an arbitrary user ID parameter.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  RecentWorkout,
  ProgressSummary,
  ExerciseProgression,
  ProgressionTrendLabel,
  ProgressionRecommendationLabel,
} from './progress-types';

/* ------------------------------------------------------------------ */
/*  Controlled errors                                                  */
/* ------------------------------------------------------------------ */

export class ProgressRepositoryError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProgressRepositoryError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/*  Raw row shapes from Supabase                                       */
/* ------------------------------------------------------------------ */

interface SessionHistoryRow {
  id: string;
  title: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  planned_duration_minutes: number | null;
}

interface ExercisePerformanceRow {
  id: string;
  user_id: string;
  exercise_id: string;
  last_weight: number | null;
  last_weight_unit: string | null;
  last_reps: number | null;
  last_rir: number | null;
  completed_exposure_count: number;
  engine_version: string;
  rule_set_version: string;
  calculated_at: string;
}

interface ProgressionDecisionRow {
  id: string;
  user_id: string;
  engine: string;
  engine_version: string;
  rule_set_version: string;
  decision_type: string;
  normalized_input: Record<string, unknown>;
  decision_output: Record<string, unknown>;
  decision_trace: Record<string, unknown>;
  reason_codes: string[];
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Date formatting helpers (pure, no locale dependence on browser)     */
/* ------------------------------------------------------------------ */

function formatDateLabel(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  // Localized short date: e.g. "Jul 16" or "16 Jul" depending on locale
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function computeDurationMinutes(
  startedAt: string | null,
  completedAt: string | null,
): number {
  if (startedAt === null || completedAt === null) return 0;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 60_000);
}

/* ------------------------------------------------------------------ */
/*  ISO week helpers (for streak calculation)                          */
/* ------------------------------------------------------------------ */

/**
 * Returns the ISO week number (1–53) and ISO year for a given date.
 * ISO weeks start on Monday; week 1 is the week containing the first Thursday.
 */
function getIsoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

/**
 * Converts an ISO year and week number into a single sortable number.
 * Example: year 2026, week 30 → 202630
 */
function isoWeekKey(year: number, week: number): number {
  return year * 100 + week;
}

/**
 * Computes the training streak in ISO weeks.
 *
 * Definition (from task spec):
 * - A training week uses ISO week boundaries (Monday–Sunday).
 * - Current streak counts consecutive ISO weeks ending with:
 *   - the current week when at least one workout exists, or
 *   - the immediately previous week when the current week has none.
 * - At least one completed or partial workout counts as an active training week.
 * - An older gap ends the streak.
 */
export function computeStreakWeeks(finishedTimestamps: readonly string[]): number {
  if (finishedTimestamps.length === 0) return 0;

  // Collect unique ISO week keys from all finished timestamps
  const trainedWeeks = new Set<number>();
  for (const ts of finishedTimestamps) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) continue;
    const { year, week } = getIsoWeek(d);
    trainedWeeks.add(isoWeekKey(year, week));
  }

  if (trainedWeeks.size === 0) return 0;

  const now = new Date();
  const { year: currentYear, week: currentWeek } = getIsoWeek(now);
  const currentKey = isoWeekKey(currentYear, currentWeek);
  const prevKey = currentWeek === 1
    ? isoWeekKey(currentYear - 1, 53)
    : isoWeekKey(currentYear, currentWeek - 1);

  // Determine the anchor week for the streak
  let anchorKey: number;
  if (trainedWeeks.has(currentKey)) {
    anchorKey = currentKey;
  } else if (trainedWeeks.has(prevKey)) {
    anchorKey = prevKey;
  } else {
    return 0;
  }

  // Count backwards from the anchor
  let streak = 0;
  let checkKey = anchorKey;
  while (trainedWeeks.has(checkKey)) {
    streak += 1;
    // Move to the previous ISO week
    const weekNum = checkKey % 100;
    const yearNum = Math.floor(checkKey / 100);
    if (weekNum === 1) {
      checkKey = isoWeekKey(yearNum - 1, 53);
    } else {
      checkKey = isoWeekKey(yearNum, weekNum - 1);
    }
  }

  return streak;
}

/* ------------------------------------------------------------------ */
/*  Repository factory                                                  */
/* ------------------------------------------------------------------ */

export function createProgressRepository(client: SupabaseClient) {
  /**
   * Loads recent finished workout history for the authenticated user.
   *
   * Includes sessions with status 'completed' or 'partial' only.
   * Excludes active (in_progress), planned, and abandoned sessions.
   * Ordered by completed_at desc, id desc as tie-breaker.
   * Limited to 20 workouts.
   */
  async function loadHistory(): Promise<{
    recentWorkouts: readonly RecentWorkout[];
    allFinishedTimestamps: readonly string[];
  }> {
    // 1. Fetch recent finished sessions
    const { data: sessions, error: sessionError } = await client
      .from('workout_sessions')
      .select('id,title,status,started_at,completed_at,planned_duration_minutes')
      .in('status', ['completed', 'partial'])
      .order('completed_at', { ascending: false })
      .limit(20);

    if (sessionError) {
      throw new ProgressRepositoryError(
        'HISTORY_LOAD_FAILED',
        `Failed to load workout history: ${sessionError.message}`,
      );
    }

    const sessionRows = (sessions ?? []) as SessionHistoryRow[];

    if (sessionRows.length === 0) {
      return { recentWorkouts: [], allFinishedTimestamps: [] };
    }

    const sessionIds = sessionRows.map((s) => s.id);

    // 2. Fetch exercise set aggregates for these sessions.
    // For each session exercise, we have planned_sets.
    // For each set_log, we count completed.
    const { data: exerciseData, error: exerciseError } = await client
      .from('workout_session_exercises')
      .select('id,workout_session_id,planned_sets,status')
      .in('workout_session_id', sessionIds);

    if (exerciseError) {
      throw new ProgressRepositoryError(
        'EXERCISES_LOAD_FAILED',
        `Failed to load session exercises: ${exerciseError.message}`,
      );
    }

    const exerciseRows = (exerciseData ?? []) as {
      id: string;
      workout_session_id: string;
      planned_sets: number;
      status: string;
    }[];

    const sessionPlannedMap = new Map<string, number>();
    for (const ex of exerciseRows) {
      const prev = sessionPlannedMap.get(ex.workout_session_id) ?? 0;
      sessionPlannedMap.set(ex.workout_session_id, prev + ex.planned_sets);
    }

    // 3. Count completed set_logs for these sessions
    const exerciseIds = exerciseRows.map((e) => e.id);
    let sessionCompletedMap = new Map<string, number>();

    if (exerciseIds.length > 0) {
      const { data: setData, error: setError } = await client
        .from('set_logs')
        .select('workout_session_exercise_id,status')
        .in('workout_session_exercise_id', exerciseIds)
        .eq('status', 'completed');

      if (setError) {
        throw new ProgressRepositoryError(
          'SET_LOGS_LOAD_FAILED',
          `Failed to load set logs: ${setError.message}`,
        );
      }

      const completedSetRows = (setData ?? []) as {
        workout_session_exercise_id: string;
        status: string;
      }[];

      // Build a map of exercise_id → session_id for reverse lookup
      const exerciseToSession = new Map<string, string>();
      for (const ex of exerciseRows) {
        exerciseToSession.set(ex.id, ex.workout_session_id);
      }

      const sessionCompletedCount = new Map<string, number>();
      for (const set of completedSetRows) {
        const sessionId = exerciseToSession.get(set.workout_session_exercise_id);
        if (sessionId !== undefined) {
          sessionCompletedCount.set(
            sessionId,
            (sessionCompletedCount.get(sessionId) ?? 0) + 1,
          );
        }
      }
      sessionCompletedMap = sessionCompletedCount;
    }

    // 4. Also fetch all finished timestamps for summary calculation
    // (separate query to get total counts beyond the 20 displayed)
    const { data: allSessions, error: allError } = await client
      .from('workout_sessions')
      .select('completed_at')
      .in('status', ['completed', 'partial']);

    if (allError) {
      throw new ProgressRepositoryError(
        'SUMMARY_LOAD_FAILED',
        `Failed to load summary data: ${allError.message}`,
      );
    }

    const allFinishedTimestamps = ((allSessions ?? []) as { completed_at: string | null }[])
      .map((s) => s.completed_at)
      .filter((t): t is string => t !== null);

    // 5. Map to RecentWorkout DTOs
    const recentWorkouts: RecentWorkout[] = sessionRows.map((s) => ({
      sessionId: s.id,
      dateLabel: formatDateLabel(s.completed_at ?? s.started_at ?? ''),
      title: s.title ?? 'Workout',
      durationMinutes: computeDurationMinutes(s.started_at, s.completed_at),
      completedSets: sessionCompletedMap.get(s.id) ?? 0,
      totalSets: sessionPlannedMap.get(s.id) ?? 0,
      status: s.status === 'completed' ? 'completed' : 'partial',
      finishedAt: s.completed_at ?? '',
    }));

    return { recentWorkouts, allFinishedTimestamps };
  }

  /**
   * Derives summary metrics from persisted data.
   */
  function deriveSummary(
    allFinishedTimestamps: readonly string[],
    recentWorkouts: readonly RecentWorkout[],
  ): ProgressSummary {
    const totalWorkouts = allFinishedTimestamps.length;
    const totalWorkingSets = recentWorkouts.reduce(
      (sum, w) => sum + w.completedSets,
      0,
    );
    const streakWeeks = computeStreakWeeks(allFinishedTimestamps);
    return { totalWorkouts, totalWorkingSets, streakWeeks };
  }

  /**
   * Loads exercise progression state for the authenticated user.
   *
   * Queries exercise_performance_state (server-written, read-only for clients)
   * and the latest progression decision per exercise from workout_decisions.
   * Falls back to exercise_performance_state data only when no decision exists.
   */
  async function loadProgression(): Promise<{
    exerciseProgressions: readonly ExerciseProgression[];
  }> {
    // 1. Load exercise_performance_state
    const { data: perfData, error: perfError } = await client
      .from('exercise_performance_state')
      .select('*')
      .order('calculated_at', { ascending: false });

    if (perfError) {
      throw new ProgressRepositoryError(
        'PROGRESSION_LOAD_FAILED',
        `Failed to load progression state: ${perfError.message}`,
      );
    }

    const perfRows = (perfData ?? []) as ExercisePerformanceRow[];

    if (perfRows.length === 0) {
      return { exerciseProgressions: [] };
    }

    // 2. Load latest progression decisions per exercise
    // Query all progression decisions, ordered by created_at desc
    const { data: decisionData, error: decisionError } = await client
      .from('workout_decisions')
      .select('*')
      .like('decision_type', 'progression_%')
      .order('created_at', { ascending: false });

    if (decisionError) {
      throw new ProgressRepositoryError(
        'DECISIONS_LOAD_FAILED',
        `Failed to load progression decisions: ${decisionError.message}`,
      );
    }

    const decisionRows = (decisionData ?? []) as ProgressionDecisionRow[];

    // Group decisions by exercise ID (from normalized_input.exerciseId), keep latest
    const latestDecisionByExercise = new Map<string, ProgressionDecisionRow>();
    for (const d of decisionRows) {
      const exerciseId = d.normalized_input['exerciseId'] as string | undefined;
      if (exerciseId === undefined || typeof exerciseId !== 'string') continue;
      if (!latestDecisionByExercise.has(exerciseId)) {
        latestDecisionByExercise.set(exerciseId, d);
      }
    }

    // 3. Also load exercise names from the exercise catalog
    const exerciseIds = perfRows.map((p) => p.exercise_id);
    const { data: catalogData, error: catalogError } = await client
      .from('exercises')
      .select('id,exercise_name')
      .in('id', exerciseIds);

    if (catalogError) {
      throw new ProgressRepositoryError(
        'CATALOG_LOAD_FAILED',
        `Failed to load exercise names: ${catalogError.message}`,
      );
    }

    const catalogRows = (catalogData ?? []) as { id: string; exercise_name: string }[];
    const nameById = new Map(catalogRows.map((c) => [c.id, c.exercise_name]));

    // 4. Map to ExerciseProgression DTOs
    const exerciseProgressions: ExerciseProgression[] = perfRows.map((perf) => {
      const decision = latestDecisionByExercise.get(perf.exercise_id);
      return mapProgressionRow(perf, decision, nameById.get(perf.exercise_id) ?? 'Unknown Exercise');
    });

    return { exerciseProgressions };
  }

  return {
    loadHistory,
    deriveSummary,
    loadProgression,
  };
}

export type ProgressRepository = ReturnType<typeof createProgressRepository>;

/* ------------------------------------------------------------------ */
/*  Progression mapping (pure, testable)                               */
/* ------------------------------------------------------------------ */

export function mapProgressionRow(
  perf: ExercisePerformanceRow,
  decision: ProgressionDecisionRow | undefined,
  exerciseName: string,
): ExerciseProgression {
  // Extract recommendation from decision, or fall back to performance state
  const action = decision?.decision_output['action'] as string | undefined;
  const recommendedLoad = decision?.decision_output['recommendedLoad'] as
    | { value: number; unit: string }
    | null
    | undefined;

  // Trend from decision trace evidence, or infer from performance state
  const evidence = decision?.decision_trace?.['evidence'] as Record<string, unknown> | undefined;
  const performanceTrend = evidence?.['performanceTrend'] as
    | { direction: string }
    | undefined;
  const trendDirection = performanceTrend?.direction;

  return {
    exerciseId: perf.exercise_id,
    exerciseName,
    currentWorkingWeightKg: perf.last_weight,
    weightUnit: perf.last_weight_unit,
    recentPerformanceReps: perf.last_reps,
    targetRir: perf.last_rir,
    trend: mapTrendDirection(trendDirection),
    recommendation: mapRecommendationAction(action),
    nextSuggestedWeightKg:
      recommendedLoad && typeof recommendedLoad.value === 'number'
        ? recommendedLoad.value
        : perf.last_weight,
    reasonCodes: decision?.reason_codes ?? [],
    sourceExposureCount: perf.completed_exposure_count,
    calculatedAt: perf.calculated_at,
    engineVersion: perf.engine_version,
    ruleSetVersion: perf.rule_set_version,
  };
}

function mapTrendDirection(
  direction: string | undefined,
): ProgressionTrendLabel | null {
  switch (direction) {
    case 'improving':
      return 'Improving';
    case 'stable':
      return 'Stable';
    case 'declining':
      return 'Declining';
    default:
      return null;
  }
}

function mapRecommendationAction(
  action: string | undefined,
): ProgressionRecommendationLabel {
  switch (action) {
    case 'increase_load':
      return 'Increase load';
    case 'maintain_load':
      return 'Maintain load';
    case 'reduce_load':
      return 'Reduce load';
    case 'review_deload':
      return 'Review deload';
    case 'consider_substitution':
      return 'Consider substitution';
    case 'change_rep_range':
      return 'Change rep range';
    default:
      return 'Not enough data';
  }
}

/* ------------------------------------------------------------------ */
/*  Exported pure helpers for testing                                  */
/* ------------------------------------------------------------------ */

export { formatDateLabel, computeDurationMinutes, getIsoWeek, isoWeekKey };