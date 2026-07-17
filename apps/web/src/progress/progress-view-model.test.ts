import { describe, expect, it } from 'vitest';
import {
  recentWorkouts,
  exerciseProgressions,
  defaultProgressViewMode as fixtureDefaultViewMode,
  type RecentWorkoutFixture,
} from './progress-fixtures';
import type { RecentWorkout } from './progress-types';
import {
  workoutCompletionPercent,
  workoutStatusLabel,
  formatTargetRir,
  isRirUnknown,
  trendLabel,
  recommendationLabel,
  isProgressViewMode,
} from './progress-view-model';

/**
 * Helper: convert a fixture workout to the RecentWorkout shape so
 * view-model helpers can be tested against legacy fixture data without
 * coupling the production screen to fixtures.
 */
function toRecentWorkout(f: RecentWorkoutFixture): RecentWorkout {
  return {
    sessionId: `fixture-${f.dateLabel}`,
    dateLabel: f.dateLabel,
    title: f.title,
    durationMinutes: f.durationMinutes,
    completedSets: f.completedSets,
    totalSets: f.totalSets,
    status: f.status,
    finishedAt: f.dateLabel,
  };
}

// ─── Fixture shape & integrity ──────────────────────────────────────

describe('recent workout fixtures', () => {
  it('has exactly four recent workout fixtures', () => {
    expect(recentWorkouts).toHaveLength(4);
  });

  it('first workout is Today / Chest + Back / 48 min / 16/16 completed', () => {
    const w = recentWorkouts[0] as RecentWorkoutFixture;
    expect(w.dateLabel).toBe('Today');
    expect(w.title).toBe('Chest + Back');
    expect(w.durationMinutes).toBe(48);
    expect(w.completedSets).toBe(16);
    expect(w.totalSets).toBe(16);
    expect(w.status).toBe('completed');
  });

  it('second workout is 2 days ago / Lower Body / partial (17/20)', () => {
    const w = recentWorkouts[1] as RecentWorkoutFixture;
    expect(w.dateLabel).toBe('2 days ago');
    expect(w.title).toBe('Lower Body');
    expect(w.status).toBe('partial');
    expect(w.completedSets).toBe(17);
    expect(w.totalSets).toBe(20);
  });

  it('third workout is 5 days ago / Shoulders + Arms / completed', () => {
    const w = recentWorkouts[2] as RecentWorkoutFixture;
    expect(w.dateLabel).toBe('5 days ago');
    expect(w.title).toBe('Shoulders + Arms');
    expect(w.status).toBe('completed');
    expect(w.completedSets).toBe(18);
    expect(w.totalSets).toBe(18);
  });

  it('fourth workout is 8 days ago / Upper Body / partial (14/16)', () => {
    const w = recentWorkouts[3] as RecentWorkoutFixture;
    expect(w.dateLabel).toBe('8 days ago');
    expect(w.title).toBe('Upper Body');
    expect(w.status).toBe('partial');
    expect(w.completedSets).toBe(14);
    expect(w.totalSets).toBe(16);
  });
});

// ─── Workout completion ──────────────────────────────────────────────

describe('workoutCompletionPercent', () => {
  it('returns 100 for a completed workout (16/16)', () => {
    expect(
      workoutCompletionPercent(toRecentWorkout(recentWorkouts[0] as RecentWorkoutFixture)),
    ).toBe(100);
  });

  it('returns 85 for 17/20', () => {
    expect(
      workoutCompletionPercent(toRecentWorkout(recentWorkouts[1] as RecentWorkoutFixture)),
    ).toBe(85);
  });

  it('returns 100 for 18/18', () => {
    expect(
      workoutCompletionPercent(toRecentWorkout(recentWorkouts[2] as RecentWorkoutFixture)),
    ).toBe(100);
  });

  it('returns 88 for 14/16', () => {
    expect(
      workoutCompletionPercent(toRecentWorkout(recentWorkouts[3] as RecentWorkoutFixture)),
    ).toBe(88);
  });

  it('returns 0 for 0 total sets', () => {
    const empty: RecentWorkout = {
      sessionId: 'empty',
      dateLabel: 'na',
      title: 'Empty',
      durationMinutes: 0,
      completedSets: 0,
      totalSets: 0,
      status: 'completed',
      finishedAt: '',
    };
    expect(workoutCompletionPercent(empty)).toBe(0);
  });
});

describe('workoutStatusLabel', () => {
  it('returns "Completed" for completed status', () => {
    expect(workoutStatusLabel('completed')).toBe('Completed');
  });

  it('returns "Partial" for partial status', () => {
    expect(workoutStatusLabel('partial')).toBe('Partial');
  });
});

// ─── Exercise progression fixtures ───────────────────────────────────

describe('exercise progression fixtures', () => {
  it('has exactly four exercise progression fixtures', () => {
    expect(exerciseProgressions).toHaveLength(4);
  });

  it('Dumbbell Bench Press: 32 kg / 10 reps / RIR 2 / Improving / Increase load / 34 kg', () => {
    const ex = exerciseProgressions[0]!;
    expect(ex.exerciseName).toBe('Dumbbell Bench Press');
    expect(ex.currentWorkingWeightKg).toBe(32);
    expect(ex.recentPerformanceReps).toBe(10);
    expect(ex.targetRir).toBe(2);
    expect(ex.trend).toBe('Improving');
    expect(ex.recommendation).toBe('Increase load');
    expect(ex.nextSuggestedWeightKg).toBe(34);
  });

  it('Lat Pulldown: 70 kg / RIR 2 / Stable / Maintain load / 70 kg', () => {
    const ex = exerciseProgressions[1]!;
    expect(ex.exerciseName).toBe('Lat Pulldown');
    expect(ex.currentWorkingWeightKg).toBe(70);
    expect(ex.targetRir).toBe(2);
    expect(ex.trend).toBe('Stable');
    expect(ex.recommendation).toBe('Maintain load');
    expect(ex.nextSuggestedWeightKg).toBe(70);
  });

  it('Seated Cable Row: RIR null (unknown) / Stable / Maintain load', () => {
    const ex = exerciseProgressions[2]!;
    expect(ex.exerciseName).toBe('Seated Cable Row');
    expect(ex.targetRir).toBeNull();
    expect(ex.trend).toBe('Stable');
    expect(ex.recommendation).toBe('Maintain load');
    expect(ex.nextSuggestedWeightKg).toBe(65);
  });

  it('Incline Dumbbell Press: 28 kg / RIR 0 / Declining / Reduce load / 26 kg', () => {
    const ex = exerciseProgressions[3]!;
    expect(ex.exerciseName).toBe('Incline Dumbbell Press');
    expect(ex.currentWorkingWeightKg).toBe(28);
    expect(ex.recentPerformanceReps).toBe(8);
    expect(ex.targetRir).toBe(0);
    expect(ex.trend).toBe('Declining');
    expect(ex.recommendation).toBe('Reduce load');
    expect(ex.nextSuggestedWeightKg).toBe(26);
  });
});

// ─── Trend labels ────────────────────────────────────────────────────

describe('trendLabel', () => {
  it('returns "Improving" for Improving', () => {
    expect(trendLabel('Improving')).toBe('Improving');
  });

  it('returns "Stable" for Stable', () => {
    expect(trendLabel('Stable')).toBe('Stable');
  });

  it('returns "Declining" for Declining', () => {
    expect(trendLabel('Declining')).toBe('Declining');
  });
});

// ─── Recommendation labels ───────────────────────────────────────────

describe('recommendationLabel', () => {
  it('returns "Increase load" for increase', () => {
    expect(recommendationLabel('Increase load')).toBe('Increase load');
  });

  it('returns "Maintain load" for maintain', () => {
    expect(recommendationLabel('Maintain load')).toBe('Maintain load');
  });

  it('returns "Reduce load" for reduce', () => {
    expect(recommendationLabel('Reduce load')).toBe('Reduce load');
  });
});

// ─── RIR formatting (null vs zero semantics) ─────────────────────────

describe('formatTargetRir', () => {
  it('renders null as em dash (unknown)', () => {
    expect(formatTargetRir(null)).toBe('\u2014');
  });

  it('renders 0 as "0"', () => {
    expect(formatTargetRir(0)).toBe('0');
  });

  it('renders 2 as "2"', () => {
    expect(formatTargetRir(2)).toBe('2');
  });

  it('renders null differently from RIR 0', () => {
    expect(formatTargetRir(null)).not.toBe('0');
    expect(formatTargetRir(null)).not.toBe(formatTargetRir(0));
  });
});

describe('isRirUnknown', () => {
  it('returns true for null RIR', () => {
    expect(isRirUnknown(null)).toBe(true);
  });

  it('returns false for RIR 0', () => {
    expect(isRirUnknown(0)).toBe(false);
  });

  it('returns false for RIR 2', () => {
    expect(isRirUnknown(2)).toBe(false);
  });
});

// ─── View mode ───────────────────────────────────────────────────────

describe('defaultProgressViewMode', () => {
  it('is "history"', () => {
    expect(fixtureDefaultViewMode).toBe('history');
  });
});

describe('isProgressViewMode', () => {
  it('accepts "history"', () => {
    expect(isProgressViewMode('history')).toBe(true);
  });

  it('accepts "progression"', () => {
    expect(isProgressViewMode('progression')).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isProgressViewMode('unknown')).toBe(false);
  });

  it('rejects null', () => {
    expect(isProgressViewMode(null)).toBe(false);
  });

  it('rejects numbers', () => {
    expect(isProgressViewMode(42)).toBe(false);
  });
});

// ─── Next suggested weight preserved ─────────────────────────────────

describe('next suggested weight', () => {
  it('Dumbbell Bench Press next weight is 34 kg', () => {
    expect(exerciseProgressions[0]!.nextSuggestedWeightKg).toBe(34);
  });

  it('Lat Pulldown next weight matches current (70 kg)', () => {
    expect(exerciseProgressions[1]!.nextSuggestedWeightKg).toBe(70);
  });

  it('Incline Dumbbell Press next weight is 26 kg (reduced from 28)', () => {
    expect(exerciseProgressions[3]!.nextSuggestedWeightKg).toBe(26);
  });
});
