import { describe, expect, it } from 'vitest';
import { parseDomainId, parseVersionIdentifier, type DomainId } from '@adaptive-workout/domain';
import {
  filterWorkoutCandidates,
  type WorkoutCandidateRejectionCode,
  type WorkoutEngineInput,
  type WorkoutExerciseCandidate,
} from './index.js';

const chestId = domainId('10000000-0000-0000-0000-000000000001', 'muscle');
const backId = domainId('10000000-0000-0000-0000-000000000002', 'muscle');
const tricepsId = domainId('10000000-0000-0000-0000-000000000003', 'muscle');
const quadricepsId = domainId('10000000-0000-0000-0000-000000000004', 'muscle');
const dumbbellId = domainId('20000000-0000-0000-0000-000000000001', 'equipment');
const cableId = domainId('20000000-0000-0000-0000-000000000002', 'equipment');
const benchId = domainId('20000000-0000-0000-0000-000000000003', 'equipment');
const barbellId = domainId('20000000-0000-0000-0000-000000000004', 'equipment');
const dumbbellPressId = domainId('30000000-0000-0000-0000-000000000001', 'exercise');
const cableFlyId = domainId('30000000-0000-0000-0000-000000000002', 'exercise');
const cableRowId = domainId('30000000-0000-0000-0000-000000000003', 'exercise');
const squatId = domainId('30000000-0000-0000-0000-000000000004', 'exercise');
const inactivePressId = domainId('30000000-0000-0000-0000-000000000005', 'exercise');
const barbellPressId = domainId('30000000-0000-0000-0000-000000000006', 'exercise');
const horizontalPressId = domainId('40000000-0000-0000-0000-000000000001', 'exercise-family');
const chestIsolationId = domainId('40000000-0000-0000-0000-000000000002', 'exercise-family');
const horizontalPullId = domainId('40000000-0000-0000-0000-000000000003', 'exercise-family');
const kneeDominantId = domainId('40000000-0000-0000-0000-000000000004', 'exercise-family');

describe('workout candidate filtering', () => {
  it('keeps chest candidates supported by commercial-gym equipment', () => {
    const result = filterWorkoutCandidates(baseInput());

    expect(eligibleIds(result)).toEqual([dumbbellPressId, cableFlyId, barbellPressId]);
  });

  it('keeps only fully equipped dumbbell chest candidates', () => {
    const input = baseInput();
    const result = filterWorkoutCandidates({
      ...input,
      availableEquipmentIds: [dumbbellId, benchId],
    });

    expect(eligibleIds(result)).toEqual([dumbbellPressId]);
    expect(rejectionCodes(result, cableFlyId)).toContain('MISSING_REQUIRED_EQUIPMENT');
  });

  it('keeps cable-only back candidates', () => {
    const input = baseInput();
    const result = filterWorkoutCandidates({
      ...input,
      targetMuscles: [{ muscleId: backId, priority: 'required' }],
      availableEquipmentIds: [cableId],
    });

    expect(eligibleIds(result)).toEqual([cableRowId]);
  });

  it('rejects a dumbbell press when its required bench is unavailable', () => {
    const input = baseInput();
    const result = filterWorkoutCandidates({
      ...input,
      availableEquipmentIds: [dumbbellId, cableId],
    });

    expect(rejectionCodes(result, dumbbellPressId)).toContain('MISSING_REQUIRED_EQUIPMENT');
  });

  it('applies explicit exercise exclusions', () => {
    const input = baseInput();
    const result = filterWorkoutCandidates({
      ...input,
      constraints: [
        {
          id: 'exclude-cable-fly',
          kind: 'excluded_exercises',
          source: 'user',
          reasonCode: 'exercise_excluded',
          exerciseIds: [cableFlyId],
        },
      ],
    });

    expect(rejectionCodes(result, cableFlyId)).toEqual(['EXCLUDED_EXERCISE']);
  });

  it('applies exercise-family exclusions', () => {
    const input = baseInput();
    const result = filterWorkoutCandidates({
      ...input,
      constraints: [
        {
          id: 'exclude-isolation',
          kind: 'excluded_exercise_families',
          source: 'program',
          reasonCode: 'family_excluded',
          exerciseFamilyIds: [chestIsolationId],
        },
      ],
    });

    expect(rejectionCodes(result, cableFlyId)).toEqual(['EXCLUDED_FAMILY']);
  });

  it('rejects candidates contributing to an excluded muscle', () => {
    const input = baseInput();
    const result = filterWorkoutCandidates({ ...input, excludedMuscleIds: [tricepsId] });

    expect(rejectionCodes(result, dumbbellPressId)).toContain('EXCLUDED_MUSCLE');
    expect(eligibleIds(result)).toContain(cableFlyId);
  });

  it('uses family taxonomy for generic movement-pattern restrictions', () => {
    const input = baseInput();
    const result = filterWorkoutCandidates({
      ...input,
      targetMuscles: [{ muscleId: quadricepsId, priority: 'required' }],
      constraints: [
        {
          id: 'restrict-knee-dominant',
          kind: 'excluded_exercise_families',
          source: 'safety',
          reasonCode: 'movement_pattern_excluded',
          exerciseFamilyIds: [kneeDominantId],
        },
      ],
    });

    expect(rejectionCodes(result, squatId)).toEqual(['RESTRICTED_MOVEMENT_PATTERN']);
  });

  it('does not hard-filter reduced-priority candidates', () => {
    const input = baseInput();
    const result = filterWorkoutCandidates({
      ...input,
      constraints: [
        {
          id: 'reduce-dumbbell-press',
          kind: 'reduced_exercise_priority',
          source: 'preference',
          reasonCode: 'lower_priority',
          exerciseIds: [dumbbellPressId],
        },
      ],
    });

    expect(eligibleIds(result)).toContain(dumbbellPressId);
  });

  it('rejects inactive exercises', () => {
    const result = filterWorkoutCandidates(baseInput());

    expect(rejectionCodes(result, inactivePressId)).toContain('INACTIVE_EXERCISE');
  });

  it('returns stable ordering independent of candidate input order', () => {
    const input = baseInput();
    const reversedInput = { ...input, exerciseCatalog: [...input.exerciseCatalog].reverse() };

    expect(filterWorkoutCandidates(reversedInput)).toEqual(filterWorkoutCandidates(input));
  });

  it('returns explicit controlled rejection reasons and versions', () => {
    const input = baseInput();
    const result = filterWorkoutCandidates(input);

    expect(rejectionCodes(result, cableRowId)).toEqual(['NO_TARGET_MUSCLE_RELEVANCE']);
    expect(result.contractVersion).toBe(input.contractVersion);
    expect(result.version).toBe(input.version);
  });

  it('returns an empty eligible list when every candidate is rejected', () => {
    const input = baseInput();
    const result = filterWorkoutCandidates({
      ...input,
      availableEquipmentIds: [],
      constraints: [
        {
          id: 'exclude-bodyweight-squat',
          kind: 'excluded_exercises',
          source: 'user',
          reasonCode: 'exercise_excluded',
          exerciseIds: [squatId],
        },
      ],
    });

    expect(result.eligibleCandidates).toEqual([]);
    expect(result.rejectedCandidates).toHaveLength(input.exerciseCatalog.length);
  });

  it('requires every required equipment item', () => {
    const input = baseInput();
    const result = filterWorkoutCandidates({
      ...input,
      availableEquipmentIds: [dumbbellId, cableId],
    });

    const rejection = result.rejectedCandidates.find(
      ({ candidate }) => candidate.exerciseId === dumbbellPressId,
    );
    expect(rejection?.reasons).toContainEqual({
      code: 'MISSING_REQUIRED_EQUIPMENT',
      relatedEquipmentIds: [benchId],
    });
  });

  it('distinguishes explicitly unavailable required equipment', () => {
    const input = baseInput();
    const result = filterWorkoutCandidates({
      ...input,
      availableEquipmentIds: [cableId, benchId],
      constraints: [
        {
          id: 'unavailable-dumbbells',
          kind: 'unavailable_equipment',
          source: 'user',
          reasonCode: 'equipment_unavailable',
          equipmentIds: [dumbbellId],
        },
      ],
    });

    expect(rejectionCodes(result, dumbbellPressId)).toContain('EXPLICITLY_UNAVAILABLE_EQUIPMENT');
  });

  it('rejects malformed catalog candidates before eligibility rules', () => {
    const input = baseInput();
    const invalidCandidate: WorkoutExerciseCandidate = {
      ...input.exerciseCatalog[0]!,
      muscleContributions: [],
    };
    const result = filterWorkoutCandidates({ ...input, exerciseCatalog: [invalidCandidate] });

    expect(result.rejectedCandidates[0]?.reasons).toEqual([
      {
        code: 'INVALID_CANDIDATE',
        invalidityCodes: ['NO_MUSCLE_CONTRIBUTIONS', 'NO_PRIMARY_MUSCLE'],
      },
    ]);
  });
});

function baseInput(): WorkoutEngineInput {
  const engineVersion = parseVersionIdentifier('workout-engine-v1', 'engine');
  const ruleSetVersion = parseVersionIdentifier('workout-rules-v1', 'rule-set');
  const contractVersion = parseVersionIdentifier('workout-input-v1', 'contract');

  if (!engineVersion.ok || !ruleSetVersion.ok || !contractVersion.ok) {
    throw new Error('Workout engine test versions must be valid.');
  }

  return {
    contractVersion: contractVersion.value,
    sessionDate: '2026-07-14',
    deterministicSeed: 'filter-request-001',
    origin: 'generated',
    goal: 'hypertrophy',
    experienceLevel: 'intermediate',
    targetMuscles: [{ muscleId: chestId, priority: 'required' }],
    excludedMuscleIds: [],
    availableDurationMinutes: 45,
    availableEquipmentIds: [dumbbellId, cableId, benchId, barbellId],
    exerciseCatalog: [
      candidate(dumbbellPressId, horizontalPressId, chestId, [dumbbellId, benchId], {
        secondaryMuscleId: tricepsId,
      }),
      candidate(cableFlyId, chestIsolationId, chestId, [cableId]),
      candidate(cableRowId, horizontalPullId, backId, [cableId]),
      candidate(squatId, kneeDominantId, quadricepsId, []),
      candidate(inactivePressId, horizontalPressId, chestId, [barbellId, benchId], {
        isActive: false,
      }),
      candidate(barbellPressId, horizontalPressId, chestId, [barbellId, benchId]),
    ],
    recentMuscleTraining: [],
    recentExerciseExposures: [],
    exercisePreferences: [],
    constraints: [],
    version: {
      engineName: 'adaptive-workout-engine',
      engineVersion: engineVersion.value,
      ruleSetVersion: ruleSetVersion.value,
    },
  };
}

function candidate(
  exerciseId: WorkoutExerciseCandidate['exerciseId'],
  exerciseFamilyId: WorkoutExerciseCandidate['exerciseFamilyId'],
  primaryMuscleId: WorkoutExerciseCandidate['muscleContributions'][number]['muscleId'],
  requiredEquipmentIds: readonly WorkoutExerciseCandidate['equipment'][number]['equipmentId'][],
  options: {
    readonly isActive?: boolean;
    readonly secondaryMuscleId?: WorkoutExerciseCandidate['muscleContributions'][number]['muscleId'];
  } = {},
): WorkoutExerciseCandidate {
  return {
    exerciseId,
    exerciseFamilyId,
    isActive: options.isActive ?? true,
    muscleContributions: [
      { muscleId: primaryMuscleId, role: 'primary', contribution: 1 },
      ...(options.secondaryMuscleId
        ? [{ muscleId: options.secondaryMuscleId, role: 'secondary' as const, contribution: 0.5 }]
        : []),
    ],
    equipment: requiredEquipmentIds.map((equipmentId) => ({
      equipmentId,
      requirement: 'required',
    })),
  };
}

function eligibleIds(result: ReturnType<typeof filterWorkoutCandidates>) {
  return result.eligibleCandidates.map(({ exerciseId }) => exerciseId);
}

function rejectionCodes(
  result: ReturnType<typeof filterWorkoutCandidates>,
  exerciseId: WorkoutExerciseCandidate['exerciseId'],
): readonly WorkoutCandidateRejectionCode[] {
  return (
    result.rejectedCandidates
      .find(({ candidate }) => candidate.exerciseId === exerciseId)
      ?.reasons.map(({ code }) => code) ?? []
  );
}

function domainId<EntityName extends string>(
  value: string,
  entityName: EntityName,
): DomainId<EntityName> {
  const result = parseDomainId(value, entityName);
  if (!result.ok) {
    throw new Error(`Invalid ${entityName} test ID.`);
  }
  return result.value;
}
