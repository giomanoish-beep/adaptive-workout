import { describe, expect, it } from 'vitest';
import {
  parseDomainId,
  parseVersionIdentifier,
  type DomainId,
  type EquipmentId,
  type ExerciseFamilyId,
  type ExerciseId,
  type MuscleId,
} from '@adaptive-workout/domain';
import {
  rankWorkoutCandidates,
  validateWorkoutCandidateScoringRuleSet,
  type WorkoutCandidateScoringResult,
  type WorkoutCandidateScoringRuleSet,
  type WorkoutCandidateScoringValidationIssue,
  type WorkoutEngineInput,
  type WorkoutExerciseCandidate,
} from './index.js';

const chestId = domainId('10000000-0000-0000-0000-000000000001', 'muscle');
const backId = domainId('10000000-0000-0000-0000-000000000002', 'muscle');
const tricepsId = domainId('10000000-0000-0000-0000-000000000003', 'muscle');
const dumbbellId = domainId('20000000-0000-0000-0000-000000000001', 'equipment');
const cableId = domainId('20000000-0000-0000-0000-000000000002', 'equipment');
const benchId = domainId('20000000-0000-0000-0000-000000000003', 'equipment');
const firstExerciseId = domainId('30000000-0000-0000-0000-000000000001', 'exercise');
const secondExerciseId = domainId('30000000-0000-0000-0000-000000000002', 'exercise');
const inactiveExerciseId = domainId('30000000-0000-0000-0000-000000000003', 'exercise');
const pressFamilyId = domainId('40000000-0000-0000-0000-000000000001', 'exercise-family');
const isolationFamilyId = domainId('40000000-0000-0000-0000-000000000002', 'exercise-family');

describe('workout candidate scoring', () => {
  it('ranks stronger target-muscle contribution above weaker relevance', () => {
    const input = baseInput([
      candidate(firstExerciseId, pressFamilyId, chestId, 1),
      candidate(secondExerciseId, isolationFamilyId, chestId, 0.5),
    ]);

    expect(rankedIds(rank(input))).toEqual([firstExerciseId, secondExerciseId]);
  });

  it('ranks primary target relevance above equivalent secondary relevance', () => {
    const primary = candidate(firstExerciseId, pressFamilyId, chestId, 1);
    const secondary: WorkoutExerciseCandidate = {
      ...candidate(secondExerciseId, isolationFamilyId, tricepsId, 1),
      muscleContributions: [
        { muscleId: tricepsId, role: 'primary', contribution: 1 },
        { muscleId: chestId, role: 'secondary', contribution: 1 },
      ],
    };

    expect(rankedIds(rank(baseInput([secondary, primary])))).toEqual([
      firstExerciseId,
      secondExerciseId,
    ]);
  });

  it('applies requested target-muscle emphasis', () => {
    const first = candidate(firstExerciseId, pressFamilyId, chestId, 1);
    const second = candidate(secondExerciseId, isolationFamilyId, backId, 1);
    const input = baseInput([first, second]);
    const result = rank({
      ...input,
      targetMuscles: [
        { muscleId: chestId, priority: 'preferred' },
        { muscleId: backId, priority: 'required' },
      ],
    });

    expect(rankedIds(result)).toEqual([secondExerciseId, firstExerciseId]);
  });

  it('raises an explicitly liked exercise', () => {
    const input = equalCandidatesInput();
    const result = rank({
      ...input,
      exercisePreferences: [{ exerciseId: secondExerciseId, preference: 'like' }],
    });

    expect(rankedIds(result)[0]).toBe(secondExerciseId);
    expect(scoreFor(result, secondExerciseId).reasonCodes).toContain('USER_LIKE');
  });

  it('lowers a disliked exercise without hard-filtering it', () => {
    const input = equalCandidatesInput();
    const result = rank({
      ...input,
      exercisePreferences: [{ exerciseId: firstExerciseId, preference: 'dislike' }],
    });

    expect(rankedIds(result)).toEqual([secondExerciseId, firstExerciseId]);
    expect(result.rankedCandidates).toHaveLength(2);
    expect(scoreFor(result, firstExerciseId).reasonCodes).toContain('USER_DISLIKE');
  });

  it('lowers candidates with an explicit reduced-priority constraint', () => {
    const input = equalCandidatesInput();
    const result = rank({
      ...input,
      constraints: [
        {
          id: 'reduce-first',
          kind: 'reduced_exercise_priority',
          source: 'preference',
          reasonCode: 'lower_priority',
          exerciseIds: [firstExerciseId],
        },
      ],
    });

    expect(rankedIds(result)).toEqual([secondExerciseId, firstExerciseId]);
    expect(scoreFor(result, firstExerciseId).reasonCodes).toContain('REDUCED_PRIORITY');
  });

  it('raises explicitly preferred exercises', () => {
    const input = equalCandidatesInput();
    const result = rank({
      ...input,
      constraints: [
        {
          id: 'prefer-second',
          kind: 'preferred_exercises',
          source: 'program',
          reasonCode: 'exercise_preferred',
          exerciseIds: [secondExerciseId],
        },
      ],
    });

    expect(rankedIds(result)[0]).toBe(secondExerciseId);
    expect(scoreFor(result, secondExerciseId).reasonCodes).toContain('PREFERRED_EXERCISE');
  });

  it('raises candidates in a preferred exercise family', () => {
    const input = equalCandidatesInput();
    const result = rank({
      ...input,
      constraints: [
        {
          id: 'prefer-isolation',
          kind: 'preferred_exercise_families',
          source: 'program',
          reasonCode: 'family_preferred',
          exerciseFamilyIds: [isolationFamilyId],
        },
      ],
    });

    expect(rankedIds(result)[0]).toBe(secondExerciseId);
    expect(scoreFor(result, secondExerciseId).reasonCodes).toContain('PREFERRED_FAMILY');
  });

  it('penalizes recent repeated exposure', () => {
    const input = equalCandidatesInput();
    const result = rank({
      ...input,
      recentExerciseExposures: [
        {
          exerciseId: firstExerciseId,
          lastPerformedAt: '2026-07-13T10:00:00.000Z',
          completedWorkingSets: 4,
        },
      ],
    });

    expect(rankedIds(result)).toEqual([secondExerciseId, firstExerciseId]);
    expect(scoreFor(result, firstExerciseId).reasonCodes).toContain('RECENT_EXPOSURE');
  });

  it('does not penalize exposure outside the configured recency window', () => {
    const input = equalCandidatesInput();
    const result = rank({
      ...input,
      recentExerciseExposures: [
        {
          exerciseId: firstExerciseId,
          lastPerformedAt: '2026-06-01T10:00:00.000Z',
          completedWorkingSets: 4,
        },
      ],
    });

    expect(scoreFor(result, firstExerciseId).reasonCodes).not.toContain('RECENT_EXPOSURE');
  });

  it('strongly prefers a compatible template-prescribed exercise', () => {
    const input = equalCandidatesInput();
    const result = rank({
      ...input,
      programPrescription: {
        programId: domainId('50000000-0000-0000-0000-000000000001', 'program'),
        programWorkoutId: domainId('60000000-0000-0000-0000-000000000001', 'program-workout'),
        programVersion: 1,
        exercises: [
          {
            position: 1,
            exerciseId: secondExerciseId,
            targetSets: 3,
            targetReps: { minimum: 8, maximum: 12 },
          },
        ],
      },
    });

    expect(rankedIds(result)[0]).toBe(secondExerciseId);
    expect(scoreFor(result, secondExerciseId).reasonCodes).toContain('TEMPLATE_PRESCRIPTION');
  });

  it('never sends hard-filtered candidates into scoring', () => {
    const active = candidate(firstExerciseId, pressFamilyId, chestId, 1);
    const inactive = {
      ...candidate(inactiveExerciseId, pressFamilyId, chestId, 1),
      isActive: false,
    };
    const result = rank(baseInput([inactive, active]));

    expect(rankedIds(result)).toEqual([firstExerciseId]);
    expect(result.filtering.rejectedCandidates[0]?.candidate.exerciseId).toBe(inactiveExerciseId);
  });

  it('produces identical deterministic ranks for identical inputs', () => {
    const input = equalCandidatesInput();

    expect(rank(input)).toEqual(rank(input));
  });

  it('does not depend on candidate input ordering', () => {
    const input = equalCandidatesInput();
    const reversed = { ...input, exerciseCatalog: [...input.exerciseCatalog].reverse() };

    expect(rank(reversed)).toEqual(rank(input));
  });

  it('reconciles every component total with the final score', () => {
    const input = equalCandidatesInput();
    const result = rank({
      ...input,
      exercisePreferences: [{ exerciseId: firstExerciseId, preference: 'like' }],
      recentExerciseExposures: [
        {
          exerciseId: firstExerciseId,
          lastPerformedAt: '2026-07-12',
          completedWorkingSets: 3,
        },
      ],
    });

    result.rankedCandidates.forEach(({ finalScore, components }) => {
      expect(finalScore).toBe(components.reduce((total, component) => total + component.score, 0));
    });
  });

  it('rejects invalid scoring configuration', () => {
    const ruleSet = scoringRuleSet();
    const invalid = {
      ...ruleSet,
      adjustments: { ...ruleSet.adjustments, userLikeBonus: -1 },
    };
    const result = validateWorkoutCandidateScoringRuleSet(invalid);

    expect(scoringValidationCodes(result)).toContain('INVALID_ADJUSTMENT');
  });

  it('ranks dumbbell-only chest candidates deterministically', () => {
    const input = baseInput([
      candidate(firstExerciseId, pressFamilyId, chestId, 1, [dumbbellId, benchId]),
      candidate(secondExerciseId, isolationFamilyId, chestId, 0.75, [dumbbellId]),
    ]);

    expect(rankedIds(rank(input))).toEqual([firstExerciseId, secondExerciseId]);
  });

  it('ranks cable-only back candidates deterministically', () => {
    const input = baseInput(
      [
        candidate(firstExerciseId, pressFamilyId, backId, 0.8, [cableId]),
        candidate(secondExerciseId, isolationFamilyId, backId, 1, [cableId]),
      ],
      backId,
      [cableId],
    );

    expect(rankedIds(rank(input))).toEqual([secondExerciseId, firstExerciseId]);
  });
});

function equalCandidatesInput(): WorkoutEngineInput {
  return baseInput([
    candidate(firstExerciseId, pressFamilyId, chestId, 1),
    candidate(secondExerciseId, isolationFamilyId, chestId, 1),
  ]);
}

function baseInput(
  exerciseCatalog: readonly WorkoutExerciseCandidate[],
  targetMuscleId: MuscleId = chestId,
  availableEquipmentIds: readonly EquipmentId[] = [dumbbellId, benchId, cableId],
): WorkoutEngineInput {
  const engineVersion = parseVersionIdentifier('workout-engine-v1', 'engine');
  const ruleSetVersion = parseVersionIdentifier('workout-rules-v1', 'rule-set');
  const contractVersion = parseVersionIdentifier('workout-input-v1', 'contract');

  if (!engineVersion.ok || !ruleSetVersion.ok || !contractVersion.ok) {
    throw new Error('Workout engine test versions must be valid.');
  }

  return {
    contractVersion: contractVersion.value,
    sessionDate: '2026-07-14',
    deterministicSeed: 'unused-by-scoring',
    origin: 'generated',
    goal: 'hypertrophy',
    experienceLevel: 'intermediate',
    targetMuscles: [{ muscleId: targetMuscleId, priority: 'required' }],
    excludedMuscleIds: [],
    availableDurationMinutes: 45,
    availableEquipmentIds,
    exerciseCatalog,
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

function scoringRuleSet(): WorkoutCandidateScoringRuleSet {
  const contractVersion = parseVersionIdentifier('workout-scoring-v1', 'contract');
  const ruleSetVersion = parseVersionIdentifier('workout-rules-v1', 'rule-set');
  if (!contractVersion.ok || !ruleSetVersion.ok) {
    throw new Error('Workout scoring test versions must be valid.');
  }

  return {
    contractVersion: contractVersion.value,
    ruleSetVersion: ruleSetVersion.value,
    maximumComponentMagnitude: 100,
    relevance: {
      primaryRoleWeight: 10,
      secondaryRoleWeight: 5,
      requiredTargetWeight: 1,
      preferredTargetWeight: 0.75,
    },
    adjustments: {
      userLikeBonus: 3,
      userDislikePenalty: 4,
      reducedPriorityPenalty: 3,
      preferredExerciseBonus: 4,
      preferredFamilyBonus: 2,
      preferredMuscleBonus: 1,
      templatePrescriptionBonus: 8,
    },
    recency: { windowDays: 14, maximumPenalty: 5 },
  };
}

function candidate(
  exerciseId: ExerciseId,
  exerciseFamilyId: ExerciseFamilyId,
  targetMuscleId: MuscleId,
  contribution: number,
  equipmentIds: readonly EquipmentId[] = [dumbbellId, benchId],
): WorkoutExerciseCandidate {
  return {
    exerciseId,
    exerciseFamilyId,
    isActive: true,
    muscleContributions: [{ muscleId: targetMuscleId, role: 'primary', contribution }],
    equipment: equipmentIds.map((equipmentId) => ({
      equipmentId,
      requirement: 'required',
    })),
  };
}

function rank(input: WorkoutEngineInput): WorkoutCandidateScoringResult {
  const result = rankWorkoutCandidates(input, scoringRuleSet());
  if (!result.ok) {
    throw new Error(`Scoring failed: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function rankedIds(result: WorkoutCandidateScoringResult): readonly ExerciseId[] {
  return result.rankedCandidates.map(
    ({ candidate: scoredCandidate }) => scoredCandidate.exerciseId,
  );
}

function scoreFor(result: WorkoutCandidateScoringResult, exerciseId: ExerciseId) {
  const scoredCandidate = result.rankedCandidates.find(
    ({ candidate: rankedCandidate }) => rankedCandidate.exerciseId === exerciseId,
  );
  if (scoredCandidate === undefined) {
    throw new Error('Expected scored candidate was not found.');
  }
  return scoredCandidate;
}

function scoringValidationCodes(
  result: ReturnType<typeof validateWorkoutCandidateScoringRuleSet>,
): readonly string[] {
  if (result.ok) {
    return [];
  }
  return (
    (
      result.error.details?.issues as readonly WorkoutCandidateScoringValidationIssue[] | undefined
    )?.map(({ code }) => code) ?? []
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
