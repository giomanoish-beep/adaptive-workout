import { describe, expect, it } from 'vitest';
import {
  currentWeek,
  lastCompleted,
  nextWorkout,
  scheduledWorkoutReview,
} from './program-view-model';
import type { LoadedProgram } from './program-types';

const program = {
  id: 'p',
  revisionId: 'r',
  revision: 1,
  startDate: '2026-07-20',
  durationWeeks: 8,
  setup: {} as LoadedProgram['setup'],
  adaptations: [],
  generated: {
    name: 'Test',
    split: 'Full Body',
    engineVersion: '1',
    ruleSetVersion: '1',
    templates: [
      {
        templateKey: 't',
        name: 'Full Body',
        focus: ['chest'],
        expectedDurationMinutes: 45,
        prescriptions: [
          {
            exerciseId: 'e',
            exerciseName: 'Press',
            position: 1,
            movementPattern: 'horizontal-press',
            sets: 3,
            repsMin: 8,
            repsMax: 10,
            targetRir: 0,
            restSeconds: 90,
            initialLoadKg: null,
            calibrationStatus: 'calibration_required',
            recommendationReason: 'Calibrate.',
          },
        ],
      },
    ],
    schedule: [],
  },
  schedule: [
    {
      id: 's1',
      scheduleKey: '1',
      week: 1,
      dayOfWeek: 1,
      scheduledDate: '2026-07-20',
      originalScheduledDate: '2026-07-20',
      phase: 'foundation',
      isDeload: false,
      templateKey: 't',
      status: 'completed',
    },
    {
      id: 's2',
      scheduleKey: '2',
      week: 1,
      dayOfWeek: 4,
      scheduledDate: '2026-07-23',
      originalScheduledDate: '2026-07-23',
      phase: 'foundation',
      isDeload: false,
      templateKey: 't',
      status: 'upcoming',
    },
  ],
} satisfies LoadedProgram;

describe('program view projections', () => {
  it('derives week and next/last scheduled sessions', () => {
    expect(currentWeek(program, '2026-07-28')).toBe(2);
    expect(nextWorkout(program, '2026-07-20')?.id).toBe('s2');
    expect(lastCompleted(program)?.id).toBe('s1');
  });
  it('preserves numeric zero RIR in a scheduled review', () => {
    expect(scheduledWorkoutReview(program, program.schedule[1]!).exercises[0]?.rir).toBe(0);
  });
  it('does not mutate base prescriptions when applying a temporary adaptation', () => {
    const adapted = {
      ...program,
      adaptations: [
        {
          id: 'a',
          affectedRegion: 'shoulder',
          affectedMovementPatterns: ['horizontal-press'],
          severity: 'moderate' as const,
          startDate: '2026-07-20',
          reviewDate: null,
        },
      ],
    };
    expect(scheduledWorkoutReview(adapted, adapted.schedule[1]!).exercises[0]?.sets).toBe(2);
    expect(program.generated.templates[0]?.prescriptions[0]?.sets).toBe(3);
  });
});
