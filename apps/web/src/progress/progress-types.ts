/**
 * CLOUD-003: Shared progress types for the Progress screen.
 *
 * Separated from progress-fixtures.ts so the production screen imports no
 * fixture data. These types represent real persisted data, not deterministic
 * test fixtures.
 */

// ─── Workout History ────────────────────────────────────────────────

export type WorkoutStatus = 'completed' | 'partial';

export interface RecentWorkout {
  readonly sessionId: string;
  readonly dateLabel: string;
  readonly title: string;
  readonly durationMinutes: number;
  readonly completedSets: number;
  readonly totalSets: number;
  readonly status: WorkoutStatus;
  /** ISO 8601 timestamp for deterministic ordering */
  readonly finishedAt: string;
}

// ─── Summary ─────────────────────────────────────────────────────────

export interface ProgressSummary {
  readonly totalWorkouts: number;
  readonly totalWorkingSets: number;
  readonly streakWeeks: number;
}

// ─── Exercise Progression ────────────────────────────────────────────

export type ProgressionTrendLabel =
  | 'Improving'
  | 'Stable'
  | 'Declining';

export type ProgressionRecommendationLabel =
  | 'Increase load'
  | 'Maintain load'
  | 'Reduce load'
  | 'Review deload'
  | 'Consider substitution'
  | 'Change rep range'
  | 'Not enough data';

export interface ExerciseProgression {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly currentWorkingWeightKg: number | null;
  readonly weightUnit: string | null;
  readonly recentPerformanceReps: number | null;
  readonly targetRir: number | null;
  readonly trend: ProgressionTrendLabel | null;
  readonly recommendation: ProgressionRecommendationLabel;
  readonly nextSuggestedWeightKg: number | null;
  /** Reason codes from the progression engine, for accessibility */
  readonly reasonCodes: readonly string[];
  /** Source exposure count used for the calculation */
  readonly sourceExposureCount: number | null;
  readonly calculatedAt: string | null;
  readonly engineVersion: string | null;
  readonly ruleSetVersion: string | null;
}

// ─── View Mode ───────────────────────────────────────────────────────

export type ProgressViewMode = 'history' | 'progression';

export const defaultProgressViewMode: ProgressViewMode = 'history';

// ─── Repository Result Types ─────────────────────────────────────────

export type ProgressLoadStatus =
  | 'loading'
  | 'loaded'
  | 'empty'
  | 'error'
  | 'refreshing';

export interface ProgressHistoryData {
  readonly status: 'loaded' | 'empty';
  readonly summary: ProgressSummary;
  readonly recentWorkouts: readonly RecentWorkout[];
}

export interface ProgressProgressionData {
  readonly status: 'loaded' | 'empty';
  readonly exerciseProgressions: readonly ExerciseProgression[];
}

export interface ProgressLoadError {
  readonly status: 'error';
  readonly message: string;
}

export type ProgressHistoryResult = ProgressHistoryData | ProgressLoadError;
export type ProgressProgressionResult = ProgressProgressionData | ProgressLoadError;