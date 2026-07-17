/**
 * Pure, React-free view-model helpers for the Progress screen.
 * All functions are deterministic projections over the progress types.
 * No side effects, no browser storage, no engine calls.
 *
 * CLOUD-003: Updated to use progress-types.ts (real data) instead of
 * progress-fixtures.ts.
 */

import type {
  RecentWorkout,
  WorkoutStatus,
  ProgressionTrendLabel,
  ProgressionRecommendationLabel,
  ProgressViewMode,
} from './progress-types';

// ─── Workout completion ──────────────────────────────────────────────

/**
 * Returns the completion percentage for a workout as an integer
 * between 0 and 100. 16/16 → 100; 17/20 → 85.
 */
export function workoutCompletionPercent(workout: RecentWorkout): number {
  if (workout.totalSets === 0) return 0;
  return Math.round((workout.completedSets / workout.totalSets) * 100);
}

/**
 * Returns the human-readable status label for a workout.
 * "completed" → "Completed"; "partial" → "Partial".
 */
export function workoutStatusLabel(status: WorkoutStatus): string {
  return status === 'completed' ? 'Completed' : 'Partial';
}

// ─── RIR formatting ──────────────────────────────────────────────────

/**
 * Formats a target RIR value for display, preserving null vs. zero semantics:
 *  - `null` → "—" (unknown)
 *  - `0` → "0" (valid observation)
 *  - other → the number as a string
 */
export function formatTargetRir(rir: number | null): string {
  if (rir === null) return '\u2014';
  return String(rir);
}

/**
 * Returns true when the RIR value represents unknown (null), used for
 * conditional rendering where null and zero need different treatment.
 */
export function isRirUnknown(rir: number | null): rir is null {
  return rir === null;
}

// ─── Trend / recommendation labels ───────────────────────────────────

/** Maps a progression trend direction to a presentable label. */
export function trendLabel(trend: ProgressionTrendLabel): string {
  return trend;
}

/** Maps a progression recommendation to a presentable label. */
export function recommendationLabel(rec: ProgressionRecommendationLabel): string {
  return rec;
}

// ─── View mode validation ────────────────────────────────────────────

const validViewModes: readonly ProgressViewMode[] = ['history', 'progression'];

/**
 * Returns true if the value is a recognised ProgressViewMode.
 */
export function isProgressViewMode(value: unknown): value is ProgressViewMode {
  return (
    typeof value === 'string' &&
    (validViewModes as readonly string[]).includes(value)
  );
}