import { describe, expect, it } from 'vitest';
import {
  parseDomainId,
  parseVersionIdentifier,
  type DomainId,
  type EngineVersion,
} from '@adaptive-workout/domain';
import {
  validateWorkoutEngineInput,
  workoutEngineFailureCodes,
  type WorkoutEngineFailure,
  type WorkoutEngineInput,
  type WorkoutInputValidationIssue,
} from './index';

const chestId = domainId('10000000-0000-0000-0000-000000000001', 'muscle');
const backId = domainId('10000000-0000-0000-0000-000000000002', 'muscle');
const legsId = domainId('10000000-0000-0000-0000-000000000003', 'muscle');
const dumbbellId = domainId('20000000-0000-0000-0000-000000000001', 'equipment');
const cableId = domainId('20000000-0000-0000-0000-000000000002', 'equipment');
const benchPressId = domainId('30000000-0000-0000-0000-000000000001', 'exercise');
const rowId = domainId('30000000-0000-0000-0000-000000000002', 'exercise');
const horizontalPressId = domainId('40000000-0000-0000-0000-000000000001', 'exercise-family');
const horizontalPullId = domainId('40000000-0000-0000-0000-000000000002', 'exercise-family');
const kneeDominantId = domainId('40000000-0000-0000-0000-000000000003', 'exercise-family');

describe('workout engine input validation', () => {
  it('rejects empty target muscles', () => {
    const result = validateWorkoutEngineInput({ ...validInput(), targetMuscles: [] });

    expect(validationCodes(result)).toContain('NO_TARGET_MUSCLES');
  });

  it('rejects duplicate target muscles', () => {
    const input = validInput();
    const result = validateWorkoutEngineInput({
      ...input,
      targetMuscles: [input.targetMuscles[0]!, input.targetMuscles[0]!],
    });

    expect(validationCodes(result)).toContain('DUPLICATE_TARGET_MUSCLE');
  });

  it('rejects target and excluded muscle collisions', () => {
    const result = validateWorkoutEngineInput({
      ...validInput(),
      excludedMuscleIds: [chestId],
    });

    expect(validationCodes(result)).toContain('TARGET_EXCLUDED_MUSCLE_COLLISION');
  });

  it.each([0, -10, Number.NaN])('rejects invalid duration %s', (availableDurationMinutes) => {
    const result = validateWorkoutEngineInput({ ...validInput(), availableDurationMinutes });

    expect(validationCodes(result)).toContain('INVALID_DURATION');
  });

  it('rejects duplicated available equipment', () => {
    const result = validateWorkoutEngineInput({
      ...validInput(),
      availableEquipmentIds: [dumbbellId, dumbbellId],
    });

    expect(validationCodes(result)).toContain('DUPLICATE_AVAILABLE_EQUIPMENT');
  });

  it('rejects equipment marked both available and unavailable', () => {
    const result = validateWorkoutEngineInput({
      ...validInput(),
      constraints: [
        {
          id: 'no-dumbbells',
          kind: 'unavailable_equipment',
          source: 'user',
          reasonCode: 'equipment_unavailable',
          equipmentIds: [dumbbellId],
        },
      ],
    });

    expect(validationCodes(result)).toContain('AVAILABLE_UNAVAILABLE_EQUIPMENT_COLLISION');
  });

  it('rejects duplicated excluded exercises', () => {
    const result = validateWorkoutEngineInput({
      ...validInput(),
      constraints: [
        {
          id: 'exclude-first',
          kind: 'excluded_exercises',
          source: 'user',
          reasonCode: 'user_exclusion',
          exerciseIds: [benchPressId],
        },
        {
          id: 'exclude-second',
          kind: 'excluded_exercises',
          source: 'preference',
          reasonCode: 'explicit_dislike',
          exerciseIds: [benchPressId],
        },
      ],
    });

    expect(validationCodes(result)).toContain('DUPLICATE_EXCLUDED_EXERCISE');
  });

  it('rejects contradictory family and exercise constraints', () => {
    const result = validateWorkoutEngineInput({
      ...validInput(),
      constraints: [
        {
          id: 'exclude-press',
          kind: 'excluded_exercise_families',
          source: 'system',
          reasonCode: 'family_excluded',
          exerciseFamilyIds: [horizontalPressId],
        },
        {
          id: 'prefer-press',
          kind: 'preferred_exercise_families',
          source: 'program',
          reasonCode: 'program_emphasis',
          exerciseFamilyIds: [horizontalPressId],
        },
        {
          id: 'exclude-bench',
          kind: 'excluded_exercises',
          source: 'user',
          reasonCode: 'user_exclusion',
          exerciseIds: [benchPressId],
        },
        {
          id: 'prefer-bench',
          kind: 'preferred_exercises',
          source: 'program',
          reasonCode: 'program_preference',
          exerciseIds: [benchPressId],
        },
      ],
    });

    expect(validationCodes(result)).toEqual(
      expect.arrayContaining([
        'CONTRADICTORY_FAMILY_CONSTRAINTS',
        'CONTRADICTORY_EXERCISE_CONSTRAINTS',
      ]),
    );
  });

  it('accepts a basic chest and back 45-minute request', () => {
    expect(validateWorkoutEngineInput(validInput())).toEqual({ ok: true, value: validInput() });
  });

  it('accepts a dumbbell-only request', () => {
    const input = validInput();
    const dumbbellOnly: WorkoutEngineInput = {
      ...input,
      targetMuscles: [{ muscleId: chestId, priority: 'required' }],
      availableEquipmentIds: [dumbbellId],
      exerciseCatalog: [input.exerciseCatalog[0]!],
    };

    expect(validateWorkoutEngineInput(dumbbellOnly).ok).toBe(true);
  });

  it('accepts generic movement-family restrictions without safety terminology', () => {
    const input: WorkoutEngineInput = {
      ...validInput(),
      constraints: [
        {
          id: 'exclude-knee-dominant',
          kind: 'excluded_exercise_families',
          source: 'safety',
          reasonCode: 'movement_pattern_excluded',
          exerciseFamilyIds: [kneeDominantId],
        },
        {
          id: 'limit-leg-volume',
          kind: 'muscle_volume_limit',
          source: 'system',
          reasonCode: 'volume_limit',
          muscleId: legsId,
          minimumWorkingSets: 0,
          maximumWorkingSets: 4,
        },
      ],
    };

    expect(validateWorkoutEngineInput(input).ok).toBe(true);
  });

  it('validates engine and rule-set version contracts', () => {
    const input = validInput();
    const invalid: WorkoutEngineInput = {
      ...input,
      version: { ...input.version, engineVersion: ' invalid version ' as EngineVersion },
    };

    expect(validationCodes(validateWorkoutEngineInput(invalid))).toContain('INVALID_VERSION');
    expect(validateWorkoutEngineInput(input).ok).toBe(true);
  });
});

describe('workout engine failure contracts', () => {
  it('enumerates expected non-throwing generation failures', () => {
    expect(workoutEngineFailureCodes).toEqual(
      expect.arrayContaining([
        'NO_TARGET_MUSCLES',
        'INVALID_DURATION',
        'UNSATISFIABLE_EQUIPMENT_CONSTRAINTS',
        'NO_ELIGIBLE_EXERCISES',
        'REQUIRED_MUSCLE_COVERAGE_UNSATISFIED',
        'DURATION_CONSTRAINT_IMPOSSIBLE',
        'CONTRADICTORY_CONSTRAINTS',
      ]),
    );

    const failure: WorkoutEngineFailure = {
      status: 'failure',
      contractVersion: validInput().contractVersion,
      code: 'NO_ELIGIBLE_EXERCISES',
      message: 'No exercise candidates remain.',
      reasonCodes: ['all_candidates_excluded'],
      relatedConstraintIds: ['exclude-press'],
      version: validInput().version,
    };

    expect(JSON.parse(JSON.stringify(failure))).toEqual(failure);
  });
});

function validInput(): WorkoutEngineInput {
  const engineVersion = parseVersionIdentifier('workout-engine-v1', 'engine');
  const ruleSetVersion = parseVersionIdentifier('workout-rules-v1', 'rule-set');
  const contractVersion = parseVersionIdentifier('workout-input-v1', 'contract');

  if (!engineVersion.ok || !ruleSetVersion.ok || !contractVersion.ok) {
    throw new Error('Workout engine test versions must be valid.');
  }

  return {
    contractVersion: contractVersion.value,
    subjectUserId: domainId('50000000-0000-0000-0000-000000000001', 'user'),
    sessionDate: '2026-07-14',
    deterministicSeed: 'request-001',
    origin: 'generated',
    goal: 'hypertrophy',
    experienceLevel: 'intermediate',
    targetMuscles: [
      { muscleId: chestId, priority: 'required' },
      { muscleId: backId, priority: 'required' },
    ],
    excludedMuscleIds: [],
    availableDurationMinutes: 45,
    availableEquipmentIds: [dumbbellId, cableId],
    exerciseCatalog: [
      {
        exerciseId: benchPressId,
        exerciseFamilyId: horizontalPressId,
        isActive: true,
        muscleContributions: [{ muscleId: chestId, role: 'primary', contribution: 1 }],
        equipment: [{ equipmentId: dumbbellId, requirement: 'required' }],
        durationEstimate: { setupSeconds: 60, perSetSeconds: 45 },
      },
      {
        exerciseId: rowId,
        exerciseFamilyId: horizontalPullId,
        isActive: true,
        muscleContributions: [{ muscleId: backId, role: 'primary', contribution: 1 }],
        equipment: [{ equipmentId: cableId, requirement: 'required' }],
        durationEstimate: { setupSeconds: 45, perSetSeconds: 45 },
      },
    ],
    recentMuscleTraining: [],
    recentExerciseExposures: [],
    exercisePreferences: [],
    constraints: [],
    version: {
      engineName: 'workout-engine',
      engineVersion: engineVersion.value,
      ruleSetVersion: ruleSetVersion.value,
    },
  };
}

function domainId<EntityName extends string>(
  value: string,
  entityName: EntityName,
): DomainId<EntityName> {
  const result = parseDomainId(value, entityName);

  if (!result.ok) {
    throw new Error(`Workout engine test ${entityName} ID must be valid.`);
  }

  return result.value;
}

function validationCodes(result: ReturnType<typeof validateWorkoutEngineInput>): readonly string[] {
  if (result.ok) {
    return [];
  }

  const issues = result.error.details?.issues as readonly WorkoutInputValidationIssue[] | undefined;
  return issues?.map(({ code }) => code) ?? [];
}
