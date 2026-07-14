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
  allocateAndSelectWorkoutExercises,
  type WorkoutAllocationResult,
  type WorkoutAllocationRuleSet,
  type WorkoutAllocationSuccess,
  type WorkoutCandidateScoringRuleSet,
  type WorkoutEngineInput,
  type WorkoutExerciseCandidate,
} from './index.js';

const chestId = id('10000000-0000-0000-0000-000000000001', 'muscle');
const backId = id('10000000-0000-0000-0000-000000000002', 'muscle');
const hamstringsId = id('10000000-0000-0000-0000-000000000003', 'muscle');
const glutesId = id('10000000-0000-0000-0000-000000000004', 'muscle');
const quadricepsId = id('10000000-0000-0000-0000-000000000005', 'muscle');
const dumbbellId = id('20000000-0000-0000-0000-000000000001', 'equipment');
const benchId = id('20000000-0000-0000-0000-000000000002', 'equipment');
const cableId = id('20000000-0000-0000-0000-000000000003', 'equipment');
const barbellId = id('20000000-0000-0000-0000-000000000004', 'equipment');
const machineId = id('20000000-0000-0000-0000-000000000005', 'equipment');

const dumbbellBenchPressId = id('30000000-0000-0000-0000-000000000001', 'exercise');
const dumbbellFlyId = id('30000000-0000-0000-0000-000000000002', 'exercise');
const cableChestPressId = id('30000000-0000-0000-0000-000000000003', 'exercise');
const latPulldownId = id('30000000-0000-0000-0000-000000000004', 'exercise');
const seatedCableRowId = id('30000000-0000-0000-0000-000000000005', 'exercise');
const straightArmPulldownId = id('30000000-0000-0000-0000-000000000006', 'exercise');
const romanianDeadliftId = id('30000000-0000-0000-0000-000000000007', 'exercise');
const cablePullThroughId = id('30000000-0000-0000-0000-000000000008', 'exercise');
const seatedLegCurlId = id('30000000-0000-0000-0000-000000000009', 'exercise');
const squatId = id('30000000-0000-0000-0000-000000000010', 'exercise');
const secondPressId = id('30000000-0000-0000-0000-000000000011', 'exercise');

const horizontalPressId = id('40000000-0000-0000-0000-000000000001', 'exercise-family');
const chestIsolationId = id('40000000-0000-0000-0000-000000000002', 'exercise-family');
const verticalPullId = id('40000000-0000-0000-0000-000000000003', 'exercise-family');
const horizontalPullId = id('40000000-0000-0000-0000-000000000004', 'exercise-family');
const shoulderExtensionId = id('40000000-0000-0000-0000-000000000005', 'exercise-family');
const hipHingeId = id('40000000-0000-0000-0000-000000000006', 'exercise-family');
const hipExtensionId = id('40000000-0000-0000-0000-000000000007', 'exercise-family');
const kneeFlexionId = id('40000000-0000-0000-0000-000000000008', 'exercise-family');
const kneeDominantId = id('40000000-0000-0000-0000-000000000009', 'exercise-family');

const exerciseNames = new Map<ExerciseId, string>([
  [dumbbellBenchPressId, 'Dumbbell Bench Press'],
  [dumbbellFlyId, 'Dumbbell Fly'],
  [cableChestPressId, 'Cable Chest Press'],
  [latPulldownId, 'Lat Pulldown'],
  [seatedCableRowId, 'Seated Cable Row'],
  [straightArmPulldownId, 'Straight-Arm Cable Pulldown'],
  [romanianDeadliftId, 'Romanian Deadlift'],
  [cablePullThroughId, 'Cable Pull-Through'],
  [seatedLegCurlId, 'Seated Leg Curl'],
  [squatId, 'Back Squat'],
  [secondPressId, 'Second Chest Press'],
]);

describe('workout volume allocation and exercise selection', () => {
  it('allocates chest and back working volume to both target areas', () => {
    const result = allocate(chestBackInput());

    expect(volume(result, chestId).weightedWorkingSetContribution).toBeGreaterThanOrEqual(6);
    expect(volume(result, backId).weightedWorkingSetContribution).toBeGreaterThanOrEqual(6);
  });

  it('does not require unrelated muscle coverage for chest-only requests', () => {
    const result = allocate(
      inputFor([target(chestId)], [dumbbellBenchPress(), dumbbellFly(), latPulldown()]),
    );

    expect(result.muscleVolumeSummary.map(({ muscleId }) => muscleId)).toEqual([chestId]);
  });

  it('keeps balanced chest and back targets balanced without explicit emphasis', () => {
    const result = allocate(chestBackInput());
    const chestVolume = volume(result, chestId).weightedWorkingSetContribution;
    const backVolume = volume(result, backId).weightedWorkingSetContribution;

    expect(Math.abs(chestVolume - backVolume)).toBeLessThanOrEqual(1);
  });

  it('increases allocation for an explicitly preferred muscle', () => {
    const input = chestBackInput();
    const result = allocate({
      ...input,
      constraints: [
        {
          id: 'prefer-back',
          kind: 'preferred_muscles',
          source: 'program',
          reasonCode: 'muscle_emphasis',
          muscleIds: [backId],
        },
      ],
    });

    expect(volume(result, backId).targetWorkingSets).toBeGreaterThan(
      volume(result, chestId).targetWorkingSets,
    );
    expect(volume(result, backId).weightedWorkingSetContribution).toBeGreaterThan(
      volume(result, chestId).weightedWorkingSetContribution,
    );
  });

  it('respects hard per-muscle maximums', () => {
    const input = inputFor([target(chestId)], [dumbbellBenchPress(), dumbbellFly()]);
    const result = allocate({
      ...input,
      constraints: [
        {
          id: 'chest-maximum',
          kind: 'muscle_volume_limit',
          source: 'system',
          reasonCode: 'volume_limit',
          muscleId: chestId,
          maximumWorkingSets: 4,
        },
      ],
    });

    expect(volume(result, chestId).weightedWorkingSetContribution).toBeLessThanOrEqual(4);
  });

  it('returns a typed failure for impossible minimum and maximum constraints', () => {
    const input = inputFor([target(chestId)], [dumbbellBenchPress()]);
    const result = allocateResult({
      ...input,
      constraints: [
        {
          id: 'chest-minimum-six',
          kind: 'muscle_volume_limit',
          source: 'program',
          reasonCode: 'minimum_volume',
          muscleId: chestId,
          minimumWorkingSets: 6,
          maximumWorkingSets: 6,
        },
        {
          id: 'chest-maximum-four',
          kind: 'muscle_volume_limit',
          source: 'system',
          reasonCode: 'maximum_volume',
          muscleId: chestId,
          maximumWorkingSets: 4,
        },
      ],
    });

    expect(result).toMatchObject({
      status: 'failure',
      code: 'IMPOSSIBLE_VOLUME_CONSTRAINTS',
      relatedMuscleIds: [chestId],
    });
  });

  it('generally selects the highest-ranked eligible candidate first', () => {
    const result = allocate(inputFor([target(chestId)], [dumbbellFly(), dumbbellBenchPress()]));

    expect(result.selectedExercises[0]?.exerciseId).toBe(dumbbellBenchPressId);
    expect(result.selectedExercises[0]?.reasonCodes).toContain('HIGH_RANKED_CANDIDATE');
  });

  it('avoids redundant same-family candidates when a useful alternative exists', () => {
    const result = allocate(
      inputFor([target(chestId)], [dumbbellBenchPress(), secondChestPress(), dumbbellFly()]),
    );

    expect(selectedIds(result)).toEqual([dumbbellBenchPressId, dumbbellFlyId]);
    expect(selectedIds(result)).not.toContain(secondPressId);
  });

  it('allows same-family selection when necessary for coverage', () => {
    const input = inputFor([target(chestId)], [dumbbellBenchPress(), secondChestPress()]);
    const result = allocate(input);

    expect(selectedIds(result)).toEqual([dumbbellBenchPressId, secondPressId]);
  });

  it('orders a higher-ranked compound movement before isolation work', () => {
    const result = allocate(inputFor([target(chestId)], [dumbbellFly(), dumbbellBenchPress()]));

    expect(selectedIds(result)).toEqual([dumbbellBenchPressId, dumbbellFlyId]);
  });

  it('produces a coherent dumbbell-only chest selection', () => {
    const input = inputFor(
      [target(chestId)],
      [dumbbellBenchPress(), dumbbellFly(), cableChestPress()],
      [dumbbellId, benchId],
    );
    const result = allocate(input);

    expect(namedSelection(result)).toEqual([
      'Dumbbell Bench Press — 4 sets',
      'Dumbbell Fly — 3 sets',
    ]);
  });

  it('produces a coherent cable-only back selection', () => {
    const input = inputFor(
      [target(backId)],
      [latPulldown(), seatedCableRow(), straightArmPulldown()],
      [cableId],
    );
    const result = allocate(input);

    expect(namedSelection(result)).toEqual(['Lat Pulldown — 3 sets', 'Seated Cable Row — 3 sets']);
  });

  it('covers hip-hinge, hip-extension, and knee-flexion families for posterior chain', () => {
    const result = allocate(posteriorChainInput(), {
      ...allocationRuleSet(),
      requiredMuscleTargetWorkingSets: 3,
      minimumDistinctExerciseFamilies: 3,
    });

    expect(result.selectedExercises.map(({ exerciseFamilyId }) => exerciseFamilyId)).toEqual(
      expect.arrayContaining([hipHingeId, hipExtensionId, kneeFlexionId]),
    );
  });

  it('keeps a posterior-chain session coherent after knee-dominant filtering', () => {
    const result = allocate(posteriorChainInput(true), {
      ...allocationRuleSet(),
      requiredMuscleTargetWorkingSets: 3,
      minimumDistinctExerciseFamilies: 3,
    });

    expect(selectedIds(result)).not.toContain(squatId);
    expect(namedSelection(result)).toEqual([
      'Romanian Deadlift — 4 sets',
      'Cable Pull-Through — 1 set',
      'Seated Leg Curl — 2 sets',
    ]);
  });

  it('is independent of candidate catalog input ordering', () => {
    const input = chestBackInput();
    const reversed = { ...input, exerciseCatalog: [...input.exerciseCatalog].reverse() };

    expect(allocate(reversed)).toEqual(allocate(input));
  });

  it('reconciles muscle-volume summaries with selected exercise sets', () => {
    const input = chestBackInput();
    const result = allocate(input);

    result.muscleVolumeSummary.forEach(({ muscleId, weightedWorkingSetContribution }) => {
      const reconstructed = result.selectedExercises.reduce((total, selectedExercise) => {
        const candidate = input.exerciseCatalog.find(
          ({ exerciseId }) => exerciseId === selectedExercise.exerciseId,
        );
        const muscle = candidate?.muscleContributions.find(
          (contribution) => contribution.muscleId === muscleId,
        );
        if (muscle === undefined || muscle.role === 'stabilizer') {
          return total;
        }
        const roleWeight = muscle.role === 'primary' ? 1 : 0.5;
        return total + selectedExercise.plannedWorkingSets * muscle.contribution * roleWeight;
      }, 0);

      expect(weightedWorkingSetContribution).toBe(reconstructed);
    });
  });

  it('never selects a candidate rejected by hard filtering', () => {
    const input = posteriorChainInput(true);
    const result = allocate(input, {
      ...allocationRuleSet(),
      requiredMuscleTargetWorkingSets: 3,
    });
    const rejectedIds = result.scoring.filtering.rejectedCandidates.map(
      ({ candidate }) => candidate.exerciseId,
    );

    expect(selectedIds(result)).not.toEqual(expect.arrayContaining(rejectedIds));
    expect(rejectedIds).toContain(squatId);
  });

  it('returns insufficient coverage when a required target has no eligible candidate', () => {
    const result = allocateResult(
      inputFor([target(chestId), target(backId)], [dumbbellBenchPress()]),
    );

    expect(result).toMatchObject({
      status: 'failure',
      code: 'INSUFFICIENT_TARGET_COVERAGE',
      relatedMuscleIds: [backId],
    });
  });

  it('returns a typed failure for an unsatisfied hard diversity minimum', () => {
    const result = allocateResult(
      inputFor([target(chestId)], [dumbbellBenchPress(), secondChestPress()]),
      { ...allocationRuleSet(), minimumDistinctExerciseFamilies: 2 },
    );

    expect(result).toMatchObject({ status: 'failure', code: 'NO_VIABLE_DIVERSE_SELECTION' });
  });

  it('returns a typed failure for invalid allocation configuration', () => {
    const result = allocateResult(chestBackInput(), {
      ...allocationRuleSet(),
      maximumWorkingSetsPerExercise: 0,
    });

    expect(result).toMatchObject({
      status: 'failure',
      code: 'INVALID_ALLOCATION_CONFIGURATION',
    });
  });

  it('shows the representative chest and back selection without enforcing duration yet', () => {
    expect(namedSelection(allocate(chestBackInput()))).toEqual([
      'Dumbbell Bench Press — 4 sets',
      'Lat Pulldown — 3 sets',
      'Seated Cable Row — 3 sets',
      'Dumbbell Fly — 3 sets',
    ]);
  });
});

function chestBackInput(): WorkoutEngineInput {
  return inputFor(
    [target(chestId), target(backId)],
    [dumbbellBenchPress(), dumbbellFly(), latPulldown(), seatedCableRow()],
  );
}

function posteriorChainInput(restrictKneeDominant = false): WorkoutEngineInput {
  const input = inputFor(
    [target(hamstringsId), target(glutesId)],
    [romanianDeadlift(), cablePullThrough(), seatedLegCurl(), squat()],
    [barbellId, cableId, machineId],
  );
  return {
    ...input,
    constraints: restrictKneeDominant
      ? [
          {
            id: 'restrict-knee-dominant',
            kind: 'excluded_exercise_families',
            source: 'safety',
            reasonCode: 'movement_pattern_excluded',
            exerciseFamilyIds: [kneeDominantId],
          },
        ]
      : [],
  };
}

function inputFor(
  targetMuscles: WorkoutEngineInput['targetMuscles'],
  exerciseCatalog: readonly WorkoutExerciseCandidate[],
  availableEquipmentIds: readonly EquipmentId[] = [
    dumbbellId,
    benchId,
    cableId,
    barbellId,
    machineId,
  ],
): WorkoutEngineInput {
  const engineVersion = version('workout-engine-v1', 'engine');
  const ruleSetVersion = version('workout-rules-v1', 'rule-set');
  const contractVersion = version('workout-input-v1', 'contract');

  return {
    contractVersion,
    sessionDate: '2026-07-14',
    deterministicSeed: 'unused-by-allocation',
    origin: 'generated',
    goal: 'hypertrophy',
    experienceLevel: 'intermediate',
    targetMuscles,
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
      engineVersion,
      ruleSetVersion,
    },
  };
}

function scoringRuleSet(): WorkoutCandidateScoringRuleSet {
  return {
    contractVersion: version('workout-scoring-v1', 'contract'),
    ruleSetVersion: version('workout-rules-v1', 'rule-set'),
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

function allocationRuleSet(): WorkoutAllocationRuleSet {
  return {
    contractVersion: version('workout-allocation-v1', 'contract'),
    ruleSetVersion: version('workout-rules-v1', 'rule-set'),
    minimumRequiredMuscleWorkingSets: 3,
    minimumPreferredMuscleWorkingSets: 2,
    requiredMuscleTargetWorkingSets: 6,
    preferredMuscleTargetWorkingSets: 4,
    preferredMuscleAdditionalWorkingSets: 2,
    defaultWorkingSetsPerExercise: 3,
    maximumWorkingSetsPerExercise: 4,
    maximumWorkingSetsPerMuscle: 10,
    maximumSelectedExercises: 8,
    minimumDistinctExerciseFamilies: 1,
    primarySetContribution: 1,
    secondarySetContribution: 0.5,
  };
}

function allocate(
  input: WorkoutEngineInput,
  allocationRules = allocationRuleSet(),
): WorkoutAllocationSuccess {
  const result = allocateResult(input, allocationRules);
  if (result.status === 'failure') {
    throw new Error(`Allocation failed: ${JSON.stringify(result)}`);
  }
  return result;
}

function allocateResult(
  input: WorkoutEngineInput,
  allocationRules = allocationRuleSet(),
): WorkoutAllocationResult {
  return allocateAndSelectWorkoutExercises(input, scoringRuleSet(), allocationRules);
}

function target(muscleId: MuscleId): WorkoutEngineInput['targetMuscles'][number] {
  return { muscleId, priority: 'required' };
}

function dumbbellBenchPress(): WorkoutExerciseCandidate {
  return exercise(
    dumbbellBenchPressId,
    horizontalPressId,
    [muscle(chestId, 'primary', 1)],
    [dumbbellId, benchId],
  );
}

function secondChestPress(): WorkoutExerciseCandidate {
  return exercise(
    secondPressId,
    horizontalPressId,
    [muscle(chestId, 'primary', 0.9)],
    [dumbbellId, benchId],
  );
}

function dumbbellFly(): WorkoutExerciseCandidate {
  return exercise(
    dumbbellFlyId,
    chestIsolationId,
    [muscle(chestId, 'primary', 0.8)],
    [dumbbellId, benchId],
  );
}

function cableChestPress(): WorkoutExerciseCandidate {
  return exercise(
    cableChestPressId,
    horizontalPressId,
    [muscle(chestId, 'primary', 0.9)],
    [cableId],
  );
}

function latPulldown(): WorkoutExerciseCandidate {
  return exercise(latPulldownId, verticalPullId, [muscle(backId, 'primary', 1)], [cableId]);
}

function seatedCableRow(): WorkoutExerciseCandidate {
  return exercise(seatedCableRowId, horizontalPullId, [muscle(backId, 'primary', 1)], [cableId]);
}

function straightArmPulldown(): WorkoutExerciseCandidate {
  return exercise(
    straightArmPulldownId,
    shoulderExtensionId,
    [muscle(backId, 'primary', 0.75)],
    [cableId],
  );
}

function romanianDeadlift(): WorkoutExerciseCandidate {
  return exercise(
    romanianDeadliftId,
    hipHingeId,
    [muscle(hamstringsId, 'primary', 1), muscle(glutesId, 'secondary', 1)],
    [barbellId],
  );
}

function cablePullThrough(): WorkoutExerciseCandidate {
  return exercise(
    cablePullThroughId,
    hipExtensionId,
    [muscle(glutesId, 'primary', 1), muscle(hamstringsId, 'secondary', 0.5)],
    [cableId],
  );
}

function seatedLegCurl(): WorkoutExerciseCandidate {
  return exercise(
    seatedLegCurlId,
    kneeFlexionId,
    [muscle(hamstringsId, 'primary', 1)],
    [machineId],
  );
}

function squat(): WorkoutExerciseCandidate {
  return exercise(
    squatId,
    kneeDominantId,
    [muscle(quadricepsId, 'primary', 1), muscle(glutesId, 'secondary', 0.5)],
    [barbellId],
  );
}

function exercise(
  exerciseId: ExerciseId,
  exerciseFamilyId: ExerciseFamilyId,
  muscleContributions: WorkoutExerciseCandidate['muscleContributions'],
  equipmentIds: readonly EquipmentId[],
): WorkoutExerciseCandidate {
  return {
    exerciseId,
    exerciseFamilyId,
    isActive: true,
    muscleContributions,
    equipment: equipmentIds.map((equipmentId) => ({ equipmentId, requirement: 'required' })),
  };
}

function muscle(
  muscleId: MuscleId,
  role: WorkoutExerciseCandidate['muscleContributions'][number]['role'],
  contribution: number,
): WorkoutExerciseCandidate['muscleContributions'][number] {
  return { muscleId, role, contribution };
}

function volume(result: WorkoutAllocationSuccess, muscleId: MuscleId) {
  const summary = result.muscleVolumeSummary.find((item) => item.muscleId === muscleId);
  if (summary === undefined) {
    throw new Error('Expected muscle volume summary was not found.');
  }
  return summary;
}

function selectedIds(result: WorkoutAllocationSuccess): readonly ExerciseId[] {
  return result.selectedExercises.map(({ exerciseId }) => exerciseId);
}

function namedSelection(result: WorkoutAllocationSuccess): readonly string[] {
  return result.selectedExercises.map(
    ({ exerciseId, plannedWorkingSets }) =>
      `${exerciseNames.get(exerciseId) ?? exerciseId} — ${plannedWorkingSets} ${plannedWorkingSets === 1 ? 'set' : 'sets'}`,
  );
}

function version<Kind extends string>(value: string, kind: Kind) {
  const result = parseVersionIdentifier(value, kind);
  if (!result.ok) {
    throw new Error(`Invalid ${kind} test version.`);
  }
  return result.value;
}

function id<EntityName extends string>(
  value: string,
  entityName: EntityName,
): DomainId<EntityName> {
  const result = parseDomainId(value, entityName);
  if (!result.ok) {
    throw new Error(`Invalid ${entityName} test ID.`);
  }
  return result.value;
}
