import { describe, expect, it } from 'vitest';
import {
  formatLoadPrescription,
  formatRepRange,
  totalReviewWorkingSets,
  workoutReviewFixture,
} from './workout-review';

const loadPrescription = {
  kind: 'external_numeric',
  suggestedLoadKg: 20,
  unit: 'kg',
  label: 'Estimated — confirm after first set',
  incrementKg: 2.5,
} as const;

describe('workout review fixture', () => {
  it('has the documented title, duration, and total working sets', () => {
    expect(workoutReviewFixture.title).toBe('Chest + Back');
    expect(workoutReviewFixture.estimatedDurationMinutes).toBe(45);
    expect(workoutReviewFixture.totalWorkingSets).toBe(16);
  });

  it('has exactly four exercises', () => {
    expect(workoutReviewFixture.exercises).toHaveLength(4);
  });

  it('totals 16 working sets across exercises', () => {
    expect(totalReviewWorkingSets(workoutReviewFixture)).toBe(16);
  });

  it('lists the four specified exercises in order', () => {
    expect(workoutReviewFixture.exercises.map((e) => e.name)).toEqual([
      'Dumbbell Bench Press',
      'Lat Pulldown',
      'Seated Cable Row',
      'Incline Dumbbell Press',
    ]);
    expect(workoutReviewFixture.exercises.every((e) => e.sets === 4)).toBe(true);
    expect(workoutReviewFixture.exercises.every((e) => e.rir === 2)).toBe(true);
  });

  it('carries the documented muscle volume', () => {
    expect(workoutReviewFixture.muscleVolume).toEqual([
      { muscle: 'Chest', volume: 7.6 },
      { muscle: 'Back', volume: 8.0 },
    ]);
  });
});

describe('review helpers', () => {
  it('formats a rep range with an en dash', () => {
    expect(formatRepRange({ minimum: 8, maximum: 10 })).toBe('8\u201310');
  });

  it('formats numeric and non-numeric load prescriptions for display', () => {
    expect(formatLoadPrescription(loadPrescription)).toBe(
      '20 kg · Estimated — confirm after first set',
    );
    expect(
      formatLoadPrescription({
        kind: 'bodyweight',
        suggestedLoadKg: null,
        unit: 'kg',
        label: 'Bodyweight',
        incrementKg: 0,
      }),
    ).toBe('Bodyweight');
  });

  it('totals sets for an arbitrary review', () => {
    expect(
      totalReviewWorkingSets({
        title: 't',
        estimatedDurationMinutes: 1,
        totalWorkingSets: 0,
        exercises: [
          {
            position: 1,
            name: 'a',
            sets: 3,
            reps: { minimum: 1, maximum: 2 },
            rir: 1,
            loadPrescription,
          },
          {
            position: 2,
            name: 'b',
            sets: 5,
            reps: { minimum: 1, maximum: 2 },
            rir: 1,
            loadPrescription,
          },
        ],
        muscleVolume: [],
      }),
    ).toBe(8);
  });
});
