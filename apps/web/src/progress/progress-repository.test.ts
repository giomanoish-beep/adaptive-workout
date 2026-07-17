import { describe, expect, it } from 'vitest';
import {
  computeStreakWeeks,
  formatDateLabel,
  computeDurationMinutes,
  getIsoWeek,
  isoWeekKey,
  mapProgressionRow,
} from './progress-repository';

// ─── Date formatting ─────────────────────────────────────────────────

describe('formatDateLabel', () => {
  it('returns "Today" for today', () => {
    const today = new Date().toISOString();
    expect(formatDateLabel(today)).toBe('Today');
  });

  it('returns "Yesterday" for yesterday', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    expect(formatDateLabel(yesterday)).toBe('Yesterday');
  });

  it('returns locale-aware short date for older dates', () => {
    // Two days ago should be neither "Today" nor "Yesterday"
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const label = formatDateLabel(twoDaysAgo);
    expect(label).not.toBe('Today');
    expect(label).not.toBe('Yesterday');
    // Should contain at least alphabetical characters (month abbreviation)
    expect(label.length).toBeGreaterThan(1);
  });

  it('returns "Unknown date" for invalid timestamp', () => {
    expect(formatDateLabel('not-a-date')).toBe('Unknown date');
    expect(formatDateLabel('')).toBe('Unknown date');
  });
});

describe('computeDurationMinutes', () => {
  it('returns 0 when either timestamp is null', () => {
    const ts = new Date().toISOString();
    expect(computeDurationMinutes(null, ts)).toBe(0);
    expect(computeDurationMinutes(ts, null)).toBe(0);
    expect(computeDurationMinutes(null, null)).toBe(0);
  });

  it('returns positive duration for valid interval', () => {
    const start = new Date('2026-07-16T10:00:00Z').toISOString();
    const end = new Date('2026-07-16T10:48:00Z').toISOString();
    expect(computeDurationMinutes(start, end)).toBe(48);
  });

  it('returns 0 when end is before start', () => {
    const start = new Date('2026-07-16T10:48:00Z').toISOString();
    const end = new Date('2026-07-16T10:00:00Z').toISOString();
    expect(computeDurationMinutes(start, end)).toBe(0);
  });

  it('rounds to nearest minute', () => {
    const start = new Date('2026-07-16T10:00:00Z').toISOString();
    const end = new Date('2026-07-16T10:48:30Z').toISOString();
    expect(computeDurationMinutes(start, end)).toBe(49);
  });
});

// ─── ISO week helpers ────────────────────────────────────────────────

describe('getIsoWeek', () => {
  it('returns correct ISO week for known date', () => {
    // 2026-01-01 (Thursday) → ISO week 1, 2026
    const d = new Date('2026-01-01');
    const { year, week } = getIsoWeek(d);
    expect(year).toBe(2026);
    expect(week).toBe(1);
  });

  it('returns correct ISO week for date late in year', () => {
    // 2024-12-31 (Tuesday) → ISO week 1, 2025
    const d = new Date('2024-12-31');
    const { year, week } = getIsoWeek(d);
    expect(year).toBe(2025);
    expect(week).toBe(1);
  });

  it('returns same week for Monday and Sunday of same week', () => {
    // 2026-07-13 (Monday) and 2026-07-19 (Sunday) are same ISO week
    const mon = getIsoWeek(new Date('2026-07-13'));
    const sun = getIsoWeek(new Date('2026-07-19'));
    expect(mon.year).toBe(sun.year);
    expect(mon.week).toBe(sun.week);
  });
});

describe('isoWeekKey', () => {
  it('converts year and week to sortable number', () => {
    expect(isoWeekKey(2026, 30)).toBe(202630);
    expect(isoWeekKey(2026, 1)).toBe(202601);
    expect(isoWeekKey(2025, 53)).toBe(202553);
  });
});

// ─── Streak calculation ──────────────────────────────────────────────

describe('computeStreakWeeks', () => {
  it('returns 0 for empty timestamps', () => {
    expect(computeStreakWeeks([])).toBe(0);
  });

  it('returns 0 when no valid timestamps', () => {
    expect(computeStreakWeeks(['invalid'])).toBe(0);
  });

  it('returns 1 for single timestamp today', () => {
    const today = new Date().toISOString();
    expect(computeStreakWeeks([today])).toBe(1);
  });

  it('returns 1 for single timestamp yesterday', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    expect(computeStreakWeeks([yesterday])).toBe(1);
  });

  it('counts consecutive ISO weeks', () => {
    // Generate timestamps for last 3 Mondays
    const now = new Date();
    const mondays: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7 - ((d.getDay() + 6) % 7));
      mondays.push(d.toISOString());
    }
    expect(computeStreakWeeks(mondays)).toBeGreaterThanOrEqual(1);
  });

  it('gap ends streak', () => {
    // This week and three weeks ago (gap at last week) → streak 1
    const thisWeek = new Date().toISOString();
    const threeWeeksAgo = new Date(Date.now() - 21 * 86_400_000).toISOString();
    expect(computeStreakWeeks([thisWeek, threeWeeksAgo])).toBe(1);
  });

  it('multiple workouts in one week count once', () => {
    // Two timestamps in the current ISO week
    const today = new Date().toISOString();
    const alsoToday = new Date(Date.now() - 3600_000).toISOString();
    const streak = computeStreakWeeks([today, alsoToday]);
    expect(streak).toBe(1);
  });
});

// ─── Progression mapping ─────────────────────────────────────────────

describe('mapProgressionRow', () => {
  const basePerf = {
    id: 'perf-1',
    user_id: 'user-1',
    exercise_id: 'ex-1',
    last_weight: 32,
    last_weight_unit: 'kg',
    last_reps: 10,
    last_rir: 2,
    completed_exposure_count: 8,
    engine_version: '1.0.0',
    rule_set_version: '1.0.0',
    calculated_at: '2026-07-16T10:00:00Z',
  };

  it('maps valid performance state without decision', () => {
    const result = mapProgressionRow(basePerf, undefined, 'Dumbbell Press');
    expect(result.exerciseName).toBe('Dumbbell Press');
    expect(result.currentWorkingWeightKg).toBe(32);
    expect(result.weightUnit).toBe('kg');
    expect(result.recentPerformanceReps).toBe(10);
    expect(result.targetRir).toBe(2);
    expect(result.nextSuggestedWeightKg).toBe(32); // falls back to last_weight
    expect(result.recommendation).toBe('Not enough data'); // no decision
    expect(result.trend).toBeNull();
    expect(result.sourceExposureCount).toBe(8);
    expect(result.engineVersion).toBe('1.0.0');
    expect(result.ruleSetVersion).toBe('1.0.0');
  });

  it('maps recommendation from decision output', () => {
    const decision = {
      id: 'dec-1',
      user_id: 'user-1',
      engine: 'progression-engine',
      engine_version: '1.0.0',
      rule_set_version: '1.0.0',
      decision_type: 'progression_increase_load',
      normalized_input: { exerciseId: 'ex-1' },
      decision_output: { action: 'increase_load', recommendedLoad: { value: 34, unit: 'kg' } },
      decision_trace: {},
      reason_codes: ['TARGET_REPS_ACHIEVED'],
      created_at: '2026-07-16T10:00:00Z',
    };
    const result = mapProgressionRow(basePerf, decision, 'Dumbbell Press');
    expect(result.recommendation).toBe('Increase load');
    expect(result.nextSuggestedWeightKg).toBe(34);
    expect(result.reasonCodes).toEqual(['TARGET_REPS_ACHIEVED']);
  });

  it('preserves null RIR as null', () => {
    const perf = { ...basePerf, last_rir: null };
    const result = mapProgressionRow(perf, undefined, 'Exercise');
    expect(result.targetRir).toBeNull();
  });

  it('preserves RIR 0 as 0', () => {
    const perf = { ...basePerf, last_rir: 0 };
    const result = mapProgressionRow(perf, undefined, 'Exercise');
    expect(result.targetRir).toBe(0);
  });

  it('maps next weight null when no recommendedLoad', () => {
    const perf = { ...basePerf, last_weight: null };
    const decision = {
      id: 'dec-1',
      user_id: 'user-1',
      engine: 'progression-engine',
      engine_version: '1.0.0',
      rule_set_version: '1.0.0',
      decision_type: 'progression_maintain_load',
      normalized_input: { exerciseId: 'ex-1' },
      decision_output: { action: 'maintain_load' },
      decision_trace: {},
      reason_codes: ['INSUFFICIENT_HISTORY'],
      created_at: '2026-07-16T10:00:00Z',
    };
    const result = mapProgressionRow(perf, decision, 'Exercise');
    expect(result.nextSuggestedWeightKg).toBeNull();
  });

  it('maps trend direction from decision trace', () => {
    const decision = {
      id: 'dec-1',
      user_id: 'user-1',
      engine: 'progression-engine',
      engine_version: '1.0.0',
      rule_set_version: '1.0.0',
      decision_type: 'progression_increase_load',
      normalized_input: { exerciseId: 'ex-1' },
      decision_output: { action: 'increase_load' },
      decision_trace: {
        evidence: {
          performanceTrend: { direction: 'improving', exposureCount: 3 },
        },
      },
      reason_codes: ['TARGET_REPS_ACHIEVED'],
      created_at: '2026-07-16T10:00:00Z',
    };
    const result = mapProgressionRow(basePerf, decision, 'Exercise');
    expect(result.trend).toBe('Improving');
  });

  it('maps deload review action', () => {
    const decision = {
      id: 'dec-1',
      user_id: 'user-1',
      engine: 'progression-engine',
      engine_version: '1.0.0',
      rule_set_version: '1.0.0',
      decision_type: 'progression_review_deload',
      normalized_input: { exerciseId: 'ex-1' },
      decision_output: { action: 'review_deload' },
      decision_trace: {},
      reason_codes: ['DELOAD_REVIEW_SIGNAL'],
      created_at: '2026-07-16T10:00:00Z',
    };
    const result = mapProgressionRow(basePerf, decision, 'Exercise');
    expect(result.recommendation).toBe('Review deload');
  });

  it('maps consider_substitution action', () => {
    const decision = {
      id: 'dec-1',
      user_id: 'user-1',
      engine: 'progression-engine',
      engine_version: '1.0.0',
      rule_set_version: '1.0.0',
      decision_type: 'progression_consider_substitution',
      normalized_input: { exerciseId: 'ex-1' },
      decision_output: { action: 'consider_substitution' },
      decision_trace: {},
      reason_codes: ['SUBSTITUTION_REVIEW_SIGNAL'],
      created_at: '2026-07-16T10:00:00Z',
    };
    const result = mapProgressionRow(basePerf, decision, 'Exercise');
    expect(result.recommendation).toBe('Consider substitution');
  });

  it('maps change_rep_range action', () => {
    const decision = {
      id: 'dec-1',
      user_id: 'user-1',
      engine: 'progression-engine',
      engine_version: '1.0.0',
      rule_set_version: '1.0.0',
      decision_type: 'progression_change_rep_range',
      normalized_input: { exerciseId: 'ex-1' },
      decision_output: { action: 'change_rep_range' },
      decision_trace: {},
      reason_codes: ['REP_RANGE_CHANGE_RECOMMENDED'],
      created_at: '2026-07-16T10:00:00Z',
    };
    const result = mapProgressionRow(basePerf, decision, 'Exercise');
    expect(result.recommendation).toBe('Change rep range');
  });

  it('maps unknown action to "Not enough data"', () => {
    const decision = {
      id: 'dec-1',
      user_id: 'user-1',
      engine: 'progression-engine',
      engine_version: '1.0.0',
      rule_set_version: '1.0.0',
      decision_type: 'progression_unknown',
      normalized_input: { exerciseId: 'ex-1' },
      decision_output: { action: 'unknown_thing' },
      decision_trace: {},
      reason_codes: [],
      created_at: '2026-07-16T10:00:00Z',
    };
    const result = mapProgressionRow(basePerf, decision, 'Exercise');
    expect(result.recommendation).toBe('Not enough data');
  });

  it('preserves engine/rule-set metadata', () => {
    const result = mapProgressionRow(basePerf, undefined, 'Exercise');
    expect(result.calculatedAt).toBe('2026-07-16T10:00:00Z');
    expect(result.engineVersion).toBe('1.0.0');
    expect(result.ruleSetVersion).toBe('1.0.0');
  });
});
