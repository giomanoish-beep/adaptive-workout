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
  calculateExerciseMuscleSetContribution,
  constructDurationFittedWorkout,
  type DurationFittedWorkoutResult,
  type DurationFittedWorkoutSuccess,
  type WorkoutAllocationRuleSet,
  type WorkoutCandidateScoringRuleSet,
  type WorkoutDurationRuleSet,
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
const romanianDeadliftId = id('30000000-0000-0000-0000-000000000006', 'exercise');
const cablePullThroughId = id('30000000-0000-0000-0000-000000000007', 'exercise');
const seatedLegCurlId = id('30000000-0000-0000-0000-000000000008', 'exercise');
const squatId = id('30000000-0000-0000-0000-000000000009', 'exercise');
const secondPressId = id('30000000-0000-0000-0000-000000000010', 'exercise');
const inclineDumbbellPressId = id('30000000-0000-0000-0000-000000000011', 'exercise');
const straightArmPulldownId = id('30000000-0000-0000-0000-000000000012', 'exercise');
const horizontalPressId = id('40000000-0000-0000-0000-000000000001', 'exercise-family');
const chestIsolationId = id('40000000-0000-0000-0000-000000000002', 'exercise-family');
const verticalPullId = id('40000000-0000-0000-0000-000000000003', 'exercise-family');
const horizontalPullId = id('40000000-0000-0000-0000-000000000004', 'exercise-family');
const hipHingeId = id('40000000-0000-0000-0000-000000000005', 'exercise-family');
const hipExtensionId = id('40000000-0000-0000-0000-000000000006', 'exercise-family');
const kneeFlexionId = id('40000000-0000-0000-0000-000000000007', 'exercise-family');
const kneeDominantId = id('40000000-0000-0000-0000-000000000008', 'exercise-family');
const inclinePressId = id('40000000-0000-0000-0000-000000000009', 'exercise-family');
const shoulderExtensionId = id('40000000-0000-0000-0000-000000000010', 'exercise-family');

const names = new Map<ExerciseId, string>([
  [dumbbellBenchPressId, 'Dumbbell Bench Press'],
  [dumbbellFlyId, 'Dumbbell Fly'],
  [cableChestPressId, 'Cable Chest Press'],
  [latPulldownId, 'Lat Pulldown'],
  [seatedCableRowId, 'Seated Cable Row'],
  [romanianDeadliftId, 'Romanian Deadlift'],
  [cablePullThroughId, 'Cable Pull-Through'],
  [seatedLegCurlId, 'Seated Leg Curl'],
  [squatId, 'Back Squat'],
  [secondPressId, 'Second Chest Press'],
  [inclineDumbbellPressId, 'Incline Dumbbell Press'],
  [straightArmPulldownId, 'Straight-Arm Cable Pulldown'],
]);

describe('workout duration fitting', () => {
  it('estimates duration deterministically', () => {
    const input = chestBackInput(45);

    expect(construct(input)).toEqual(construct(input));
  });

  it('estimates more duration for more working sets', () => {
    const input = chestOnlyInput(60);
    const smaller = construct(input, {
      ...allocationRuleSet(),
      requiredMuscleTargetWorkingSets: 4,
    });
    const larger = construct(input, {
      ...allocationRuleSet(),
      requiredMuscleTargetWorkingSets: 6,
    });

    expect(totalSets(larger)).toBeGreaterThan(totalSets(smaller));
    expect(larger.estimatedDuration.totalSeconds).toBeGreaterThan(
      smaller.estimatedDuration.totalSeconds,
    );
  });

  it('accounts for additional exercise setup and transitions', () => {
    const oneExerciseInput = inputFor(
      60,
      [target(chestId)],
      [exercise(dumbbellBenchPressId, horizontalPressId, chestId, 1, [dumbbellId, benchId])],
    );
    const noExpansion = { ...durationRuleSet(), targetDurationUtilization: 0.01 };
    const oneExercise = construct(
      oneExerciseInput,
      {
        ...allocationRuleSet(),
        defaultWorkingSetsPerExercise: 6,
        maximumWorkingSetsPerExercise: 6,
      },
      noExpansion,
    );
    const twoExercises = construct(
      inputFor(
        60,
        [target(chestId)],
        [
          exercise(dumbbellBenchPressId, horizontalPressId, chestId, 1, [dumbbellId, benchId]),
          exercise(secondPressId, chestIsolationId, chestId, 1, [dumbbellId, benchId]),
        ],
      ),
      { ...allocationRuleSet(), minimumDistinctExerciseFamilies: 2 },
      noExpansion,
    );

    expect(totalSets(twoExercises)).toBe(totalSets(oneExercise));
    expect(twoExercises.exercises).toHaveLength(2);
    expect(twoExercises.estimatedDuration.totalSeconds).toBeGreaterThan(
      oneExercise.estimatedDuration.totalSeconds,
    );
  });

  it('accounts for longer rest guidance', () => {
    const input = chestOnlyInput(60);
    const normal = construct(input);
    const longerRest = construct(input, allocationRuleSet(), {
      ...durationRuleSet(),
      defaultRestSecondsBetweenSets: 150,
    });

    expect(longerRest.estimatedDuration.totalSeconds).toBeGreaterThan(
      normal.estimatedDuration.totalSeconds,
    );
  });

  it('preserves a workout already within duration', () => {
    const input = inputFor(60, [target(chestId)], [dumbbellBenchPress()]);
    const allocationRules = {
      ...allocationRuleSet(),
      requiredMuscleTargetWorkingSets: 4,
    };
    const allocation = allocateAndSelectWorkoutExercises(input, scoringRuleSet(), allocationRules);
    const fitted = construct(input, allocationRules, {
      ...durationRuleSet(),
      targetDurationUtilization: 0.01,
    });

    expect(allocation.status).toBe('success');
    if (allocation.status === 'success') {
      expect(
        fitted.exercises.map(({ exerciseId, plannedWorkingSets }) => ({
          exerciseId,
          plannedWorkingSets,
        })),
      ).toEqual(
        allocation.selectedExercises.map(({ exerciseId, plannedWorkingSets }) => ({
          exerciseId,
          plannedWorkingSets,
        })),
      );
    }
    expect(fitted.decisions).toEqual([]);
  });

  it('reduces an oversized workout deterministically', () => {
    const first = construct(chestBackInput(25));
    const second = construct(chestBackInput(25));

    expect(first).toEqual(second);
    expect(first.estimatedDuration.totalMinutes).toBeLessThanOrEqual(25);
    expect(first.decisions).toContainEqual(
      expect.objectContaining({ code: 'REDUCED_OPTIONAL_VOLUME' }),
    );
  });

  it('preserves required target-muscle coverage during reduction', () => {
    const result = construct(chestBackInput(30));

    result.muscleVolumeSummary.forEach((summary) => {
      expect(summary.weightedWorkingSetContribution).toBeGreaterThanOrEqual(
        summary.minimumWorkingSets,
      );
    });
  });

  it('does not starve one target in a balanced chest and back reduction', () => {
    const result = construct(chestBackInput(30));
    const chest = volume(result, chestId).weightedWorkingSetContribution;
    const back = volume(result, backId).weightedWorkingSetContribution;

    expect(Math.min(chest, back) / Math.max(chest, back)).toBeGreaterThanOrEqual(0.8);
  });

  it('returns a typed failure when required coverage cannot fit a short duration', () => {
    const result = constructResult(chestBackInput(5));

    expect(result).toMatchObject({
      status: 'failure',
      code: 'DURATION_CONSTRAINT_IMPOSSIBLE',
    });
  });

  it('produces a smaller 30-minute plan than a 60-minute equivalent', () => {
    const short = construct(chestBackInput(30));
    const long = construct(chestBackInput(60));

    expect(totalSets(short)).toBeLessThan(totalSets(long));
  });

  it('uses larger 30, 45, and 60 minute budgets for increasing useful volume', () => {
    const thirty = construct(chestBackInput(30));
    const fortyFive = construct(chestBackInput(45));
    const sixty = construct(chestBackInput(60));

    expect([totalSets(thirty), totalSets(fortyFive), totalSets(sixty)]).toEqual([12, 16, 21]);
    expect(fortyFive.estimatedDuration.totalMinutes).toBeGreaterThan(
      thirty.estimatedDuration.totalMinutes,
    );
    expect(sixty.estimatedDuration.totalMinutes).toBeGreaterThan(
      fortyFive.estimatedDuration.totalMinutes,
    );
  });

  it('never returns less volume for a longer identical request', () => {
    const results = [30, 45, 60].map((minutes) => construct(chestBackInput(minutes)));

    expect(totalSets(results[1]!)).toBeGreaterThanOrEqual(totalSets(results[0]!));
    expect(totalSets(results[2]!)).toBeGreaterThanOrEqual(totalSets(results[1]!));
  });

  it('expands the 60-minute plan beyond the prior 31-minute allocation', () => {
    const result = construct(chestBackInput(60));

    expect(totalSets(result)).toBe(21);
    expect(result.estimatedDuration.totalMinutes).toBeGreaterThan(31);
    expect(result.decisions).toContainEqual(
      expect.objectContaining({ code: 'ADDED_EXERCISE_FOR_DURATION_BUDGET' }),
    );
  });

  it('keeps duration expansion within hard per-muscle maximums', () => {
    const input = chestBackInput(60);
    const result = construct({
      ...input,
      constraints: [
        volumeMaximum('chest-maximum-eight', chestId, 8),
        volumeMaximum('back-maximum-eight', backId, 8),
      ],
    });

    expect(volume(result, chestId).weightedWorkingSetContribution).toBeLessThanOrEqual(8);
    expect(volume(result, backId).weightedWorkingSetContribution).toBeLessThanOrEqual(8);
  });

  it('preserves target-muscle balance during expansion', () => {
    const result = construct(chestBackInput(60));
    const chest = volume(result, chestId).weightedWorkingSetContribution;
    const back = volume(result, backId).weightedWorkingSetContribution;

    expect(Math.min(chest, back) / Math.max(chest, back)).toBeGreaterThanOrEqual(0.9);
  });

  it('does not expand with unrelated muscle work', () => {
    const result = construct(chestBackInput(60));

    expect(result.exercises.map(({ exerciseId }) => exerciseId)).not.toContain(seatedLegCurlId);
  });

  it('prefers a useful new family over a redundant press variant', () => {
    const result = construct(chestBackInput(60));
    const exerciseIds = result.exercises.map(({ exerciseId }) => exerciseId);

    expect(exerciseIds).toContain(dumbbellFlyId);
    expect(exerciseIds).not.toContain(cableChestPressId);
  });

  it('adds new exercises only with the practical minimum set count', () => {
    const result = construct(chestBackInput(60));
    const addedExerciseIds = result.decisions
      .filter(({ code }) => code === 'ADDED_EXERCISE_FOR_DURATION_BUDGET')
      .map(({ exerciseId }) => exerciseId);

    expect(addedExerciseIds).toHaveLength(2);
    addedExerciseIds.forEach((exerciseId) => {
      expect(
        result.exercises.find((exercise) => exercise.exerciseId === exerciseId)?.plannedWorkingSets,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  it('allows unused spare time when target muscles are saturated', () => {
    const input = chestBackInput(60);
    const result = construct({
      ...input,
      constraints: [
        volumeMaximum('chest-maximum-six', chestId, 6),
        volumeMaximum('back-maximum-six', backId, 6),
      ],
    });

    expect(result.status).toBe('success');
    expect(result.estimatedDuration.totalMinutes).toBeLessThan(60 * 0.8);
    expect(result.decisions.some(({ code }) => code.startsWith('ADDED_'))).toBe(false);
  });

  it('fits a chest and back request within 45 minutes', () => {
    const result = construct(chestBackInput(45));

    expect(result.estimatedDuration.totalMinutes).toBeLessThanOrEqual(45);
  });

  it('fits a dumbbell-only chest request within 45 minutes', () => {
    const result = construct(chestOnlyInput(45));

    expect(result.exercises.every(({ exerciseId }) => exerciseId !== cableChestPressId)).toBe(true);
    expect(result.estimatedDuration.totalMinutes).toBeLessThanOrEqual(45);
  });

  it('keeps a knee-dominant restricted posterior-chain workout coherent', () => {
    const result = construct(posteriorChainInput(45));

    expect(result.exercises.map(({ exerciseId }) => exerciseId)).not.toContain(squatId);
    expect(result.exercises.map(({ exerciseFamilyId }) => exerciseFamilyId)).toEqual(
      expect.arrayContaining([hipHingeId, hipExtensionId, kneeFlexionId]),
    );
  });

  it('removes isolated one-set prescriptions without increasing volume', () => {
    const input = chestOnlyInput(45);
    const constrained: WorkoutEngineInput = {
      ...input,
      constraints: [
        {
          id: 'chest-maximum-four',
          kind: 'muscle_volume_limit',
          source: 'system',
          reasonCode: 'volume_limit',
          muscleId: chestId,
          maximumWorkingSets: 4,
        },
      ],
    };
    const result = construct(constrained, allocationRuleSet(), {
      ...durationRuleSet(),
      targetDurationUtilization: 0.01,
    });

    expect(result.exercises.every(({ plannedWorkingSets }) => plannedWorkingSets >= 2)).toBe(true);
    expect(result.decisions).toContainEqual(
      expect.objectContaining({ code: 'REMOVED_SUBMINIMUM_EXERCISE' }),
    );
    expect(totalSets(result)).toBe(3);
  });

  it('is independent of candidate catalog input ordering', () => {
    const input = chestBackInput(30);
    const reversed = { ...input, exerciseCatalog: [...input.exerciseCatalog].reverse() };

    expect(construct(reversed)).toEqual(construct(input));
  });

  it('reconciles muscle-volume summaries after reductions', () => {
    const input = chestBackInput(30);
    const result = construct(input);

    result.muscleVolumeSummary.forEach(({ muscleId, weightedWorkingSetContribution }) => {
      const reconstructed = result.exercises.reduce((total, selected) => {
        const candidate = input.exerciseCatalog.find(
          ({ exerciseId }) => exerciseId === selected.exerciseId,
        );
        return (
          total +
          (candidate === undefined
            ? 0
            : calculateExerciseMuscleSetContribution(candidate, muscleId, allocationRuleSet()) *
              selected.plannedWorkingSets)
        );
      }, 0);
      expect(weightedWorkingSetContribution).toBe(reconstructed);
    });
  });

  it('rejects invalid versioned duration configuration', () => {
    const result = constructResult(chestOnlyInput(45), allocationRuleSet(), {
      ...durationRuleSet(),
      minimumWorkingSetsPerExercise: 1,
    });

    expect(result).toMatchObject({
      status: 'failure',
      code: 'INVALID_DURATION_CONFIGURATION',
    });
  });

  it('honors a stricter maximum-workout-duration constraint', () => {
    const input = chestBackInput(60);
    const result = construct({
      ...input,
      constraints: [
        {
          id: 'maximum-thirty-minutes',
          kind: 'maximum_workout_duration',
          source: 'program',
          reasonCode: 'duration_limit',
          maximumMinutes: 30,
        },
      ],
    });

    expect(result.maximumDurationMinutes).toBe(30);
    expect(result.estimatedDuration.totalMinutes).toBeLessThanOrEqual(30);
  });

  it('shows representative deterministic outputs', () => {
    expect(summary(construct(chestBackInput(30)))).toEqual({
      exercises: [
        'Dumbbell Bench Press — 3 sets',
        'Lat Pulldown — 3 sets',
        'Seated Cable Row — 3 sets',
        'Incline Dumbbell Press — 3 sets',
      ],
      estimatedMinutes: 28.5,
    });
    expect(summary(construct(chestBackInput(45)))).toEqual({
      exercises: [
        'Dumbbell Bench Press — 4 sets',
        'Lat Pulldown — 4 sets',
        'Seated Cable Row — 4 sets',
        'Incline Dumbbell Press — 4 sets',
      ],
      estimatedMinutes: 37.5,
    });
    expect(summary(construct(chestBackInput(60)))).toEqual({
      exercises: [
        'Dumbbell Bench Press — 4 sets',
        'Lat Pulldown — 4 sets',
        'Seated Cable Row — 4 sets',
        'Incline Dumbbell Press — 4 sets',
        'Dumbbell Fly — 2 sets',
        'Straight-Arm Cable Pulldown — 3 sets',
      ],
      estimatedMinutes: 49.75,
    });
    expect(summary(construct(chestOnlyInput(45)))).toEqual({
      exercises: ['Dumbbell Bench Press — 4 sets', 'Dumbbell Fly — 4 sets'],
      estimatedMinutes: 18.5,
    });
    expect(summary(construct(posteriorChainInput(45)))).toEqual({
      exercises: [
        'Romanian Deadlift — 4 sets',
        'Cable Pull-Through — 4 sets',
        'Seated Leg Curl — 4 sets',
      ],
      estimatedMinutes: 28,
    });
  });
});

function chestBackInput(minutes: number): WorkoutEngineInput {
  return inputFor(
    minutes,
    [target(chestId), target(backId)],
    [
      dumbbellBenchPress(),
      dumbbellFly(),
      cableChestPress(),
      latPulldown(),
      seatedCableRow(),
      inclineDumbbellPress(),
      straightArmPulldown(),
      seatedLegCurl(),
    ],
  );
}

function chestOnlyInput(minutes: number): WorkoutEngineInput {
  return inputFor(
    minutes,
    [target(chestId)],
    [dumbbellBenchPress(), dumbbellFly(), cableChestPress()],
    [dumbbellId, benchId],
  );
}

function posteriorChainInput(minutes: number): WorkoutEngineInput {
  const input = inputFor(
    minutes,
    [target(hamstringsId), target(glutesId)],
    [romanianDeadlift(), cablePullThrough(), seatedLegCurl(), squat()],
    [barbellId, cableId, machineId],
  );
  return {
    ...input,
    constraints: [
      {
        id: 'restrict-knee-dominant',
        kind: 'excluded_exercise_families',
        source: 'safety',
        reasonCode: 'movement_pattern_excluded',
        exerciseFamilyIds: [kneeDominantId],
      },
    ],
  };
}

function inputFor(
  minutes: number,
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
  return {
    contractVersion: version('workout-input-v1', 'contract'),
    sessionDate: '2026-07-14',
    deterministicSeed: 'unused-by-duration-fitting',
    origin: 'generated',
    goal: 'hypertrophy',
    experienceLevel: 'intermediate',
    targetMuscles,
    excludedMuscleIds: [],
    availableDurationMinutes: minutes,
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

function durationRuleSet(): WorkoutDurationRuleSet {
  return {
    contractVersion: version('workout-duration-v1', 'contract'),
    ruleSetVersion: version('workout-rules-v1', 'rule-set'),
    defaultSetExecutionSeconds: 45,
    defaultRestSecondsBetweenSets: 90,
    defaultExerciseSetupSeconds: 90,
    transitionSecondsBetweenExercises: 30,
    minimumWorkingSetsPerExercise: 2,
    targetDurationUtilization: 0.8,
    minimumExpansionBudgetSeconds: 120,
    preferredVolumeExpansionMultiplier: 1.6,
  };
}

function construct(
  input: WorkoutEngineInput,
  allocationRules = allocationRuleSet(),
  durationRules = durationRuleSet(),
): DurationFittedWorkoutSuccess {
  const result = constructDurationFittedWorkout(
    input,
    scoringRuleSet(),
    allocationRules,
    durationRules,
  );
  if (result.status === 'failure') {
    throw new Error(`Duration fitting failed: ${JSON.stringify(result)}`);
  }
  return result;
}

function constructResult(
  input: WorkoutEngineInput,
  allocationRules = allocationRuleSet(),
  durationRules = durationRuleSet(),
): DurationFittedWorkoutResult {
  return constructDurationFittedWorkout(input, scoringRuleSet(), allocationRules, durationRules);
}

function target(muscleId: MuscleId): WorkoutEngineInput['targetMuscles'][number] {
  return { muscleId, priority: 'required' };
}

function volumeMaximum(
  constraintId: string,
  muscleId: MuscleId,
  maximumWorkingSets: number,
): WorkoutEngineInput['constraints'][number] {
  return {
    id: constraintId,
    kind: 'muscle_volume_limit',
    source: 'system',
    reasonCode: 'volume_limit',
    muscleId,
    maximumWorkingSets,
  };
}

function dumbbellBenchPress(): WorkoutExerciseCandidate {
  return exercise(dumbbellBenchPressId, horizontalPressId, chestId, 1, [dumbbellId, benchId]);
}

function dumbbellFly(): WorkoutExerciseCandidate {
  return exercise(dumbbellFlyId, chestIsolationId, chestId, 0.8, [dumbbellId, benchId]);
}

function cableChestPress(): WorkoutExerciseCandidate {
  return exercise(cableChestPressId, horizontalPressId, chestId, 0.9, [cableId]);
}

function latPulldown(): WorkoutExerciseCandidate {
  return exercise(latPulldownId, verticalPullId, backId, 1, [cableId]);
}

function seatedCableRow(): WorkoutExerciseCandidate {
  return exercise(seatedCableRowId, horizontalPullId, backId, 1, [cableId]);
}

function inclineDumbbellPress(): WorkoutExerciseCandidate {
  return exercise(inclineDumbbellPressId, inclinePressId, chestId, 0.9, [dumbbellId, benchId]);
}

function straightArmPulldown(): WorkoutExerciseCandidate {
  return exercise(straightArmPulldownId, shoulderExtensionId, backId, 0.5, [cableId]);
}

function romanianDeadlift(): WorkoutExerciseCandidate {
  return multiMuscleExercise(
    romanianDeadliftId,
    hipHingeId,
    [
      { muscleId: hamstringsId, role: 'primary', contribution: 1 },
      { muscleId: glutesId, role: 'secondary', contribution: 1 },
    ],
    [barbellId],
  );
}

function cablePullThrough(): WorkoutExerciseCandidate {
  return multiMuscleExercise(
    cablePullThroughId,
    hipExtensionId,
    [
      { muscleId: glutesId, role: 'primary', contribution: 1 },
      { muscleId: hamstringsId, role: 'secondary', contribution: 0.5 },
    ],
    [cableId],
  );
}

function seatedLegCurl(): WorkoutExerciseCandidate {
  return exercise(seatedLegCurlId, kneeFlexionId, hamstringsId, 1, [machineId]);
}

function squat(): WorkoutExerciseCandidate {
  return multiMuscleExercise(
    squatId,
    kneeDominantId,
    [
      { muscleId: quadricepsId, role: 'primary', contribution: 1 },
      { muscleId: glutesId, role: 'secondary', contribution: 0.5 },
    ],
    [barbellId],
  );
}

function exercise(
  exerciseId: ExerciseId,
  exerciseFamilyId: ExerciseFamilyId,
  muscleId: MuscleId,
  contribution: number,
  equipmentIds: readonly EquipmentId[],
): WorkoutExerciseCandidate {
  return multiMuscleExercise(
    exerciseId,
    exerciseFamilyId,
    [{ muscleId, role: 'primary', contribution }],
    equipmentIds,
  );
}

function multiMuscleExercise(
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

function totalSets(result: DurationFittedWorkoutSuccess): number {
  return result.exercises.reduce((total, exercise) => total + exercise.plannedWorkingSets, 0);
}

function volume(result: DurationFittedWorkoutSuccess, muscleId: MuscleId) {
  const summary = result.muscleVolumeSummary.find((item) => item.muscleId === muscleId);
  if (summary === undefined) {
    throw new Error('Expected muscle volume summary was not found.');
  }
  return summary;
}

function summary(result: DurationFittedWorkoutSuccess) {
  return {
    exercises: result.exercises.map(
      ({ exerciseId, plannedWorkingSets }) =>
        `${names.get(exerciseId) ?? exerciseId} — ${plannedWorkingSets} ${plannedWorkingSets === 1 ? 'set' : 'sets'}`,
    ),
    estimatedMinutes: result.estimatedDuration.totalMinutes,
  };
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
