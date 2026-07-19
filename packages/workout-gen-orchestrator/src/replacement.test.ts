import { describe, expect, it } from 'vitest';
import type {
  WorkoutEngineInput,
  WorkoutExerciseCandidate,
} from '@adaptive-workout/workout-engine';
import type { ReplaceWorkoutExerciseRequest } from './contracts';
import { selectReplacementCandidate } from './replacement';

describe('selectReplacementCandidate', () => {
  it('prefers the same family and primary muscle', () => {
    expect(
      select([
        candidate('current', 'press', 'chest'),
        candidate('same', 'press', 'chest'),
        candidate('other', 'fly', 'chest'),
      ])?.exerciseId,
    ).toBe('same');
  });

  it('excludes unavailable equipment', () => {
    expect(
      select([
        candidate('current', 'press', 'chest'),
        candidate('barbell', 'press', 'chest', 'barbell'),
        candidate('dumbbell', 'press', 'chest', 'dumbbell'),
      ])?.exerciseId,
    ).toBe('dumbbell');
  });

  it('excludes restricted exercises through deterministic constraints', () => {
    const input = engine([
      candidate('current', 'press', 'chest'),
      candidate('restricted', 'press', 'chest'),
      candidate('allowed', 'press', 'chest'),
    ]);
    const constrained: WorkoutEngineInput = {
      ...input,
      constraints: [
        {
          id: 'restriction-1',
          kind: 'excluded_exercises',
          source: 'safety',
          reasonCode: 'restricted_movement',
          exerciseIds: ['restricted'],
        } as WorkoutEngineInput['constraints'][number],
      ],
    };
    expect(selectReplacementCandidate(request(), constrained)?.exerciseId).toBe('allowed');
  });

  it('returns null when no valid substitute exists', () => {
    expect(select([candidate('current', 'press', 'chest')])).toBeNull();
  });

  it('does not cycle immediately to a previous replacement', () => {
    expect(
      select(
        [
          candidate('current', 'press', 'chest'),
          candidate('previous', 'press', 'chest'),
          candidate('next', 'press', 'chest'),
        ],
        ['previous'],
      )?.exerciseId,
    ).toBe('next');
  });
});

function select(candidates: readonly WorkoutExerciseCandidate[], excluded: readonly string[] = []) {
  return selectReplacementCandidate(request(excluded), engine(candidates));
}

function request(excludedReplacementIds: readonly string[] = []): ReplaceWorkoutExerciseRequest {
  return {
    action: 'replace_exercise',
    targetMuscles: ['chest'],
    durationMinutes: 45,
    equipmentContext: 'dumbbells-only',
    currentExerciseId: 'current',
    workoutExerciseIds: ['current'],
    excludedReplacementIds,
  };
}

function engine(candidates: readonly WorkoutExerciseCandidate[]): WorkoutEngineInput {
  return {
    contractVersion: 'workout-generation-contract-v1',
    sessionDate: '2026-07-18',
    deterministicSeed: 'replacement-test',
    origin: 'generated',
    goal: 'general_fitness',
    experienceLevel: 'intermediate',
    targetMuscles: [{ muscleId: 'chest', priority: 'required' }],
    excludedMuscleIds: [],
    availableDurationMinutes: 45,
    availableEquipmentIds: ['dumbbell'],
    exerciseCatalog: candidates,
    recentMuscleTraining: [],
    recentExerciseExposures: [],
    exercisePreferences: [],
    constraints: [],
    version: {
      engineName: 'replacement-test',
      engineVersion: 'workout-engine-v1',
      ruleSetVersion: 'workout-generation-rules-v8',
    },
  } as WorkoutEngineInput;
}

function candidate(
  id: string,
  family: string,
  muscle: string,
  equipment = 'dumbbell',
): WorkoutExerciseCandidate {
  return {
    exerciseId: id,
    exerciseFamilyId: family,
    isActive: true,
    muscleContributions: [{ muscleId: muscle, role: 'primary', contribution: 1 }],
    equipment: [{ equipmentId: equipment, requirement: 'required' }],
  } as WorkoutExerciseCandidate;
}
