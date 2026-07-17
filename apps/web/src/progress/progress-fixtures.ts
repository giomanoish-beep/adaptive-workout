/**
 * Pure, React-free progress fixtures for the Progress / History screen
 * (WEB_APP-005). These are deterministic local fixtures only — they represent
 * the shape of future cloud-persisted history and progression-engine results
 * but are not real persisted data. No browser storage, no Supabase, no engine
 * imports.
 */

// ─── Workout History ────────────────────────────────────────────────

export type WorkoutStatus = 'completed' | 'partial';

export interface RecentWorkoutFixture {
  readonly dateLabel: string;
  readonly title: string;
  readonly durationMinutes: number;
  readonly completedSets: number;
  readonly totalSets: number;
  readonly status: WorkoutStatus;
}

/**
 * Four deterministic recent-workout fixtures matching the task spec exactly.
 * Ordered newest-first for chronological display.
 */
export const recentWorkouts: readonly RecentWorkoutFixture[] = [
  {
    dateLabel: 'Today',
    title: 'Chest + Back',
    durationMinutes: 48,
    completedSets: 16,
    totalSets: 16,
    status: 'completed',
  },
  {
    dateLabel: '2 days ago',
    title: 'Lower Body',
    durationMinutes: 61,
    completedSets: 17,
    totalSets: 20,
    status: 'partial',
  },
  {
    dateLabel: '5 days ago',
    title: 'Shoulders + Arms',
    durationMinutes: 52,
    completedSets: 18,
    totalSets: 18,
    status: 'completed',
  },
  {
    dateLabel: '8 days ago',
    title: 'Upper Body',
    durationMinutes: 57,
    completedSets: 14,
    totalSets: 16,
    status: 'partial',
  },
];

// ─── Summary ─────────────────────────────────────────────────────────

export interface ProgressSummary {
  readonly totalWorkouts: number;
  readonly totalWorkingSets: number;
  readonly streakWeeks: number;
}

export const progressSummary: ProgressSummary = {
  totalWorkouts: 12,
  totalWorkingSets: 184,
  streakWeeks: 3,
};

// ─── Exercise Progression ────────────────────────────────────────────

export type ProgressionTrendLabel = 'Improving' | 'Stable' | 'Declining';
export type ProgressionRecommendationLabel = 'Increase load' | 'Maintain load' | 'Reduce load';

export interface ExerciseProgressionFixture {
  readonly exerciseName: string;
  readonly currentWorkingWeightKg: number;
  readonly recentPerformanceReps: number;
  readonly targetRir: number | null;
  readonly trend: ProgressionTrendLabel;
  readonly recommendation: ProgressionRecommendationLabel;
  readonly nextSuggestedWeightKg: number;
}

/**
 * Four deterministic exercise-progression fixtures. These represent
 * authoritative progression-engine results — the browser never recalculates.
 *
 * Important RIR semantics:
 *  - `targetRir: null` means RIR is unknown → renders as "—" or "Unknown"
 *  - `targetRir: 0` is a valid observation → renders as "0"
 *  - Never conflate null with zero.
 */
export const exerciseProgressions: readonly ExerciseProgressionFixture[] = [
  {
    exerciseName: 'Dumbbell Bench Press',
    currentWorkingWeightKg: 32,
    recentPerformanceReps: 10,
    targetRir: 2,
    trend: 'Improving',
    recommendation: 'Increase load',
    nextSuggestedWeightKg: 34,
  },
  {
    exerciseName: 'Lat Pulldown',
    currentWorkingWeightKg: 70,
    recentPerformanceReps: 10,
    targetRir: 2,
    trend: 'Stable',
    recommendation: 'Maintain load',
    nextSuggestedWeightKg: 70,
  },
  {
    exerciseName: 'Seated Cable Row',
    currentWorkingWeightKg: 65,
    recentPerformanceReps: 12,
    targetRir: null,
    trend: 'Stable',
    recommendation: 'Maintain load',
    nextSuggestedWeightKg: 65,
  },
  {
    exerciseName: 'Incline Dumbbell Press',
    currentWorkingWeightKg: 28,
    recentPerformanceReps: 8,
    targetRir: 0,
    trend: 'Declining',
    recommendation: 'Reduce load',
    nextSuggestedWeightKg: 26,
  },
];

// ─── View Mode ───────────────────────────────────────────────────────

export type ProgressViewMode = 'history' | 'progression';

export const defaultProgressViewMode: ProgressViewMode = 'history';