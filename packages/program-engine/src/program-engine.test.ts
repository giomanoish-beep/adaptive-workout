import { describe, expect, it } from 'vitest';
import {
  adaptPrescription,
  applyExerciseHistory,
  adherence,
  completeAdHoc,
  completeScheduled,
  currentProgramWeek,
  generateProgram,
  nextScheduledSession,
  ownerMatches,
  removeAdaptation,
  reviseProgram,
  type ProgramExerciseCandidate,
  type ProgramSetup,
  type SessionProgress,
} from './index.js';

const catalog: readonly ProgramExerciseCandidate[] = [
  item('bench', 'Bench Press', 'horizontal-press', ['barbell']),
  item('row', 'Cable Row', 'horizontal-pull', ['cable']),
  item('squat', 'Goblet Squat', 'squat', ['dumbbell']),
  item('rdl', 'Romanian Deadlift', 'hinge', ['barbell']),
  item('pulldown', 'Lat Pulldown', 'vertical-pull', ['cable']),
  item('press', 'Dumbbell Shoulder Press', 'vertical-press', ['dumbbell']),
  item('lunge', 'Reverse Lunge', 'single-leg', ['dumbbell']),
  item('curl', 'Dumbbell Curl', 'elbow-flexion', ['dumbbell']),
];

function item(
  id: string,
  name: string,
  movementPattern: string,
  equipment: readonly string[],
): ProgramExerciseCandidate {
  return { id, name, movementPattern, primaryMuscle: movementPattern, equipment };
}

function setup(overrides: Partial<ProgramSetup> = {}): ProgramSetup {
  return {
    goal: 'recomposition',
    experience: 'intermediate',
    daysPerWeek: 4,
    sessionDurationMinutes: 60,
    durationWeeks: 12,
    startDate: '2026-07-20',
    equipment: ['barbell', 'dumbbell', 'cable'],
    programPreference: 'app_decide',
    dislikedExerciseIds: [],
    restrictedMovementPatterns: [],
    ...overrides,
  };
}

describe('deterministic program generation', () => {
  it.each([8, 12, 16] as const)('supports %i weeks with weekly scheduling', (durationWeeks) => {
    const result = generateProgram(setup({ durationWeeks }), catalog);
    expect(result.schedule).toHaveLength(durationWeeks * 4);
    expect(result.schedule.at(-1)?.week).toBe(durationWeeks);
  });

  it.each([
    ['build_muscle', 8, 12, 120],
    ['gain_strength', 3, 6, 180],
    ['recomposition', 6, 12, 105],
    ['fat_loss_support', 10, 15, 75],
  ] as const)('uses goal-specific prescriptions for %s', (goal, min, max, rest) => {
    const first = generateProgram(setup({ goal }), catalog).templates[0]!.prescriptions[0]!;
    expect([first.repsMin, first.repsMax, first.restSeconds]).toEqual([min, max, rest]);
    expect(first.initialLoadKg).toBeNull();
    expect(first.calibrationStatus).toBe('calibration_required');
  });

  it.each([
    [2, 'Full Body'],
    [4, 'Upper Lower'],
    [5, 'Push Pull Legs'],
  ] as const)('selects a frequency-specific split for %i days', (daysPerWeek, split) =>
    expect(generateProgram(setup({ daysPerWeek }), catalog).split).toBe(split),
  );

  it('is stable, spaces recovery, and places reduced-load weeks', () => {
    const a = generateProgram(setup(), catalog);
    const b = generateProgram(setup(), [...catalog].reverse());
    expect(a).toEqual(b);
    expect(a.schedule.filter((row) => row.week === 4).every((row) => row.isDeload)).toBe(true);
    expect(a.schedule.slice(0, 4).map((row) => row.dayOfWeek)).toEqual([1, 2, 4, 6]);
  });

  it('filters unavailable equipment, dislikes, and restricted patterns', () => {
    const result = generateProgram(
      setup({
        equipment: ['dumbbell'],
        dislikedExerciseIds: ['curl'],
        restrictedMovementPatterns: ['squat'],
      }),
      catalog,
    );
    const ids = result.templates.flatMap((row) => row.prescriptions.map((item) => item.exerciseId));
    expect(ids).not.toContain('curl');
    expect(ids).not.toContain('squat');
    expect(ids).not.toContain('bench');
  });
});

describe('progression, versions, and ownership', () => {
  const progress: readonly SessionProgress[] = [
    { scheduleKey: 'a', state: 'upcoming', scheduledDate: '2026-07-20' },
    { scheduleKey: 'b', state: 'skipped', scheduledDate: '2026-07-22' },
  ];

  it('advances only a scheduled session; ad-hoc completion is isolated', () => {
    expect(completeScheduled(progress, 'a')[0]?.state).toBe('completed');
    expect(completeAdHoc(progress)).toEqual(progress);
    expect(completeAdHoc(progress)).not.toBe(progress);
  });

  it('tracks week, next session, and adherence deterministically', () => {
    const generated = generateProgram(setup(), catalog);
    expect(currentProgramWeek('2026-07-20', '2026-08-04', 12)).toBe(3);
    expect(nextScheduledSession(generated.schedule, progress)?.scheduleKey).toBe(
      'week-1-session-1',
    );
    expect(adherence([{ ...progress[0]!, state: 'completed' }, progress[1]!])).toBe(50);
  });

  it('creates a revision without mutating the previous version', () => {
    const original = { revision: 1, program: { days: 3 }, reason: 'created' };
    const revised = reviseProgram(original, { days: 4 }, 'training_days_changed');
    expect(revised).toEqual({ revision: 2, program: { days: 4 }, reason: 'training_days_changed' });
    expect(original.program.days).toBe(3);
  });

  it('maps strict user ownership', () => {
    expect(ownerMatches('user-a', 'user-a')).toBe(true);
    expect(ownerMatches('user-a', 'user-b')).toBe(false);
    expect(ownerMatches('', '')).toBe(false);
  });

  it('creates returning-user prescriptions and preserves null versus zero RIR', () => {
    const base = generateProgram(setup(), catalog).templates[0]!.prescriptions[0]!;
    expect(
      applyExerciseHistory(base, { weightKg: 20, reps: 10, rir: 0, recommendedWeightKg: 22.5 })
        .recommendationReason,
    ).toContain('RIR 0');
    expect(
      applyExerciseHistory(base, { weightKg: 20, reps: 10, rir: null, recommendedWeightKg: 22.5 })
        .recommendationReason,
    ).toContain('Unknown');
    expect(applyExerciseHistory(base, null).initialLoadKg).toBeNull();
  });
});

describe('temporary discomfort adaptation', () => {
  const base = generateProgram(setup(), catalog).templates[0]!.prescriptions[0]!;
  const active = {
    id: 'adapt-1',
    affectedRegion: 'shoulder',
    affectedMovementPatterns: [base.movementPattern],
    severity: 'moderate' as const,
    startDate: '2026-07-20',
    endDate: null,
  };

  it('adapts an affected prescription and preserves/restores the base', () => {
    const adapted = adaptPrescription(base, active, catalog);
    expect(adapted.adapted).toBe(true);
    expect(adapted.effective?.exerciseId).not.toBe(base.exerciseId);
    expect(adapted.base).toBe(base);
    expect(removeAdaptation(adapted)).toBe(base);
  });

  it('preserves unaffected training and blocks severe restriction', () => {
    const unaffected = adaptPrescription(
      base,
      { ...active, affectedMovementPatterns: ['unknown'] },
      catalog,
    );
    expect(unaffected.effective).toBe(base);
    const stopped = adaptPrescription(base, { ...active, severity: 'severe' }, catalog);
    expect(stopped.effective).toBeNull();
    expect(stopped.reasonCodes).toContain('stop_training_seek_medical_advice');
  });
});
