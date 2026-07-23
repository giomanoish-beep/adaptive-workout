import { describe, expect, it } from 'vitest';
import { productionExerciseCatalogImportPlan } from '@adaptive-workout/domain';
import {
  calculateExerciseMuscleSetContribution,
  constructDurationFittedWorkout,
  resolveTrainingGoalRules,
  type DurationFittedWorkoutSuccess,
  type TrainingGoal,
  type WorkoutAllocationRuleSet,
  type WorkoutCandidateScoringRuleSet,
  type WorkoutDurationRuleSet,
  type WorkoutEngineInput,
  type WorkoutExerciseCandidate,
} from '@adaptive-workout/workout-engine';
import type { EquipmentContextMap, MuscleIdMap } from './contracts.js';
import { mapCatalogToEngineCandidates, type CatalogMappingResult } from './catalog-mapping.js';
import {
  buildEngineInput,
  ORCHESTRATOR_CONTRACT_VERSION,
  ORCHESTRATOR_RULE_SET_VERSION,
} from './engine-input.js';

const STABLE_SESSION_DATE = '2026-07-23';
const USER_ID = '00000000-0000-4000-8000-000000009999';

const muscleIdMap: MuscleIdMap = {
  chest: 'chest',
  back: 'lats',
  shoulders: 'front-delts',
  biceps: 'biceps',
  triceps: 'triceps',
  quads: 'quadriceps',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  core: 'abs',
};

const equipmentContextMap: EquipmentContextMap = {
  'full-gym': [
    'barbell',
    'dumbbell',
    'cable',
    'bench',
    'smith-machine',
    'leg-press',
    'hack-squat',
    'plate-loaded-machine',
    'selectorized-machine',
    'bodyweight',
    'pull-up-station',
    'dip-station',
  ],
  'broad-commercial-gym': [
    'barbell',
    'dumbbell',
    'cable',
    'bench',
    'smith-machine',
    'leg-press',
    'plate-loaded-machine',
    'selectorized-machine',
    'bodyweight',
    'pull-up-station',
    'dip-station',
  ],
  'restricted-commercial-gym': ['dumbbell', 'bench', 'bodyweight'],
};

const catalog = productionCatalogFixture();

describe('production catalog duration allocation', () => {
  it.each([
    { requestedMinutes: 45, expectedExerciseRange: [4, 6] },
    { requestedMinutes: 60, expectedExerciseRange: [5, 7] },
    { requestedMinutes: 75, expectedExerciseRange: [6, 8] },
    { requestedMinutes: 90, expectedExerciseRange: [6, 9] },
  ] as const)(
    'fits a $requestedMinutes-minute intermediate muscle-building full-gym workout',
    ({ requestedMinutes, expectedExerciseRange }) => {
      const result = workoutFor({
        goal: 'build_muscle',
        experienceLevel: 'intermediate',
        durationMinutes: requestedMinutes,
        targetMuscles: ['chest', 'back'],
        equipmentContext: 'full-gym',
      });
      const diagnostics = summarize(result, catalog);

      expect(diagnostics.exerciseCount).toBeGreaterThanOrEqual(expectedExerciseRange[0]);
      expect(diagnostics.exerciseCount).toBeLessThanOrEqual(expectedExerciseRange[1]);
      expect(diagnostics.workingSetCount).toBeGreaterThan(0);
      expect(diagnostics.estimated.totalMinutes).toBeLessThanOrEqual(requestedMinutes);
      if (
        !['maximum_useful_volume_reached', 'movement_pattern_constraint'].includes(
          diagnostics.stoppingReason,
        )
      ) {
        expect(diagnostics.utilization).toBeGreaterThanOrEqual(0.72);
      }
      expect(diagnostics.eligibleCandidateCount).toBeGreaterThan(diagnostics.exerciseCount);
      expect(diagnostics.stoppingReason).not.toBe('candidate_saturation');
      expect(diagnostics.muscleCoverage).toEqual(expect.arrayContaining(['chest', 'lats']));
      expect(diagnostics.movementPatternCoverage.length).toBeGreaterThanOrEqual(
        Math.min(4, diagnostics.exerciseCount),
      );
    },
  );

  it('does not produce less useful work as duration increases for identical inputs', () => {
    const results = [45, 60, 75, 90].map((durationMinutes) =>
      summarize(
        workoutFor({
          goal: 'build_muscle',
          experienceLevel: 'intermediate',
          durationMinutes,
          targetMuscles: ['chest', 'back'],
          equipmentContext: 'full-gym',
        }),
        catalog,
      ),
    );

    for (let index = 1; index < results.length; index += 1) {
      const previous = results[index - 1]!;
      const current = results[index]!;

      expect(current.workingSetCount).toBeGreaterThanOrEqual(previous.workingSetCount);
      expect(current.estimatedUsefulWorkSeconds).toBeGreaterThanOrEqual(
        previous.estimatedUsefulWorkSeconds,
      );
      if (current.workingSetCount === previous.workingSetCount) {
        expect(
          saturationEvidence(current.result, catalog).allUsefulExpansionBlockedByHardVolume,
        ).toBe(true);
      }
    }
  });

  it('proves 75- and 90-minute full-gym underfill is hard target-volume saturation', () => {
    const seventyFive = summarize(
      workoutFor({
        goal: 'build_muscle',
        experienceLevel: 'intermediate',
        durationMinutes: 75,
        targetMuscles: ['chest', 'back'],
        equipmentContext: 'full-gym',
      }),
      catalog,
    );
    const ninety = summarize(
      workoutFor({
        goal: 'build_muscle',
        experienceLevel: 'intermediate',
        durationMinutes: 90,
        targetMuscles: ['chest', 'back'],
        equipmentContext: 'full-gym',
      }),
      catalog,
    );

    expect(ninety.selectedExercises).toEqual(seventyFive.selectedExercises);
    expect(ninety.workingSetCount).toBe(seventyFive.workingSetCount);
    expect(ninety.estimated.totalSeconds).toBe(seventyFive.estimated.totalSeconds);

    for (const diagnostics of [seventyFive, ninety]) {
      const evidence = saturationEvidence(diagnostics.result, catalog);

      expect(diagnostics.stoppingReason).toBe('maximum_useful_volume_reached');
      expect(evidence.targetVolumes).toEqual([
        { muscle: 'chest', actual: 11.8, maximum: 12 },
        { muscle: 'lats', actual: 12, maximum: 12 },
      ]);
      expect(evidence.selectedSetRejectionBreakdown).toEqual({
        'hard_volume_max:chest': 1,
        'hard_volume_max:lats': 1,
      });
      expect(evidence.unselectedCandidateRejectionBreakdown).toEqual({
        'hard_volume_max:chest': 17,
        'hard_volume_max:lats': 16,
      });
      expect(evidence.unselectedTargetRelevantCandidateCount).toBe(33);
      expect(evidence.allUsefulExpansionBlockedByHardVolume).toBe(true);
      expect(evidence.movementPatternConstraintRejectCount).toBe(0);
    }
  });

  it('adds useful work at 90 minutes when hard target-volume capacity exists', () => {
    const relaxedAllocation = {
      ...allocationRuleSet(),
      maximumWorkingSetsPerMuscle: 16,
    };
    const seventyFive = summarize(
      workoutFor(
        {
          goal: 'build_muscle',
          experienceLevel: 'intermediate',
          durationMinutes: 75,
          targetMuscles: ['chest', 'back'],
          equipmentContext: 'full-gym',
        },
        relaxedAllocation,
      ),
      catalog,
    );
    const ninety = summarize(
      workoutFor(
        {
          goal: 'build_muscle',
          experienceLevel: 'intermediate',
          durationMinutes: 90,
          targetMuscles: ['chest', 'back'],
          equipmentContext: 'full-gym',
        },
        relaxedAllocation,
      ),
      catalog,
    );

    expect(ninety.workingSetCount).toBeGreaterThan(seventyFive.workingSetCount);
    expect(ninety.estimatedUsefulWorkSeconds).toBeGreaterThan(
      seventyFive.estimatedUsefulWorkSeconds,
    );
    expect(ninety.estimated.totalMinutes).toBeLessThanOrEqual(90);
    expect(ninety.stoppingReason).toBe('target_duration_reached');
  });

  it('documents restricted-equipment saturation instead of adding unsafe duplicates', () => {
    const result = workoutFor({
      goal: 'build_muscle',
      experienceLevel: 'beginner',
      durationMinutes: 75,
      targetMuscles: ['chest'],
      equipmentContext: 'restricted-commercial-gym',
    });
    const diagnostics = summarize(result, catalog);

    expect(diagnostics.eligibleCandidateCount).toBeLessThan(10);
    expect(diagnostics.exerciseCount).toBeLessThanOrEqual(diagnostics.eligibleCandidateCount);
    expect(new Set(diagnostics.selectedExercises).size).toBe(diagnostics.exerciseCount);
    expect([
      'candidate_saturation',
      'maximum_useful_volume_reached',
      'movement_pattern_constraint',
    ]).toContain(diagnostics.stoppingReason);
    expect(diagnostics.estimated.totalMinutes).toBeLessThanOrEqual(75);
  });

  it('keeps strength sessions more focused while using longer rest productively', () => {
    const hypertrophy = summarize(
      workoutFor({
        goal: 'build_muscle',
        experienceLevel: 'advanced',
        durationMinutes: 75,
        targetMuscles: ['chest', 'back', 'quads', 'hamstrings'],
        equipmentContext: 'broad-commercial-gym',
      }),
      catalog,
    );
    const strength = summarize(
      workoutFor({
        goal: 'gain_strength',
        experienceLevel: 'advanced',
        durationMinutes: 75,
        targetMuscles: ['chest', 'back', 'quads', 'hamstrings'],
        equipmentContext: 'broad-commercial-gym',
      }),
      catalog,
    );

    expect(strength.exerciseCount).toBeLessThanOrEqual(hypertrophy.exerciseCount);
    expect(strength.workingSetCount).toBeLessThanOrEqual(hypertrophy.workingSetCount);
    expect(averageRestSeconds(strength)).toBeGreaterThan(averageRestSeconds(hypertrophy));
    expect(strength.estimated.totalMinutes).toBeLessThanOrEqual(75);
    expect(strength.utilization).toBeGreaterThanOrEqual(0.45);
  });
});

function workoutFor(
  config: {
    readonly goal: TrainingGoal;
    readonly experienceLevel: WorkoutEngineInput['experienceLevel'];
    readonly durationMinutes: number;
    readonly targetMuscles: readonly string[];
    readonly equipmentContext: string;
  },
  allocationRules: WorkoutAllocationRuleSet = allocationRuleSet(),
): DurationFittedWorkoutSuccess {
  const input = buildEngineInput(
    {
      targetMuscles: config.targetMuscles,
      durationMinutes: config.durationMinutes,
      equipmentContext: config.equipmentContext,
    },
    catalog,
    muscleIdMap,
    equipmentContextMap,
    USER_ID,
  );
  const stableInput: WorkoutEngineInput = {
    ...input,
    sessionDate: STABLE_SESSION_DATE,
    deterministicSeed: [
      config.goal,
      config.experienceLevel,
      config.durationMinutes,
      ...config.targetMuscles,
      config.equipmentContext,
    ].join(':'),
    goal: config.goal,
    experienceLevel: config.experienceLevel,
  };

  const result = constructDurationFittedWorkout(
    stableInput,
    scoringRuleSet(),
    allocationRules,
    durationRuleSet(),
    resolveTrainingGoalRules(config.goal),
  );
  if (result.status === 'failure') {
    throw new Error(`Expected a production-catalog workout: ${JSON.stringify(result)}`);
  }
  return result;
}

function summarize(result: DurationFittedWorkoutSuccess, mapping: CatalogMappingResult) {
  const selectedExercises = result.exercises.map(
    ({ exerciseId, plannedWorkingSets }) =>
      `${mapping.exerciseIdToName.get(exerciseId) ?? exerciseId} (${plannedWorkingSets})`,
  );
  const exerciseCount = result.exercises.length;
  const workingSetCount = result.exercises.reduce(
    (total, exercise) => total + exercise.plannedWorkingSets,
    0,
  );
  const muscleCoverage = [
    ...new Set(
      result.muscleVolumeSummary
        .filter(({ weightedWorkingSetContribution }) => weightedWorkingSetContribution > 0)
        .map(({ muscleId }) => mapping.muscleIdToSlug.get(muscleId) ?? muscleId),
    ),
  ].sort();
  const movementPatternCoverage = [
    ...new Set(
      result.exercises.map(
        ({ exerciseFamilyId }) => mapping.familyIdToSlug.get(exerciseFamilyId) ?? exerciseFamilyId,
      ),
    ),
  ].sort();
  const addedExerciseCount = result.decisions.filter(
    ({ code }) => code === 'ADDED_EXERCISE_FOR_DURATION_BUDGET',
  ).length;

  return {
    selectedExercises,
    result,
    exerciseCount,
    workingSetCount,
    estimated: result.estimatedDuration,
    estimatedUsefulWorkSeconds:
      result.estimatedDuration.setExecutionSeconds + result.estimatedDuration.restSeconds,
    requestedMinutes: result.maximumDurationMinutes,
    utilization: result.estimatedDuration.totalMinutes / result.maximumDurationMinutes,
    eligibleCandidateCount: result.allocation.scoring.filtering.eligibleCandidates.length,
    addedExerciseCount,
    stoppingReason: result.durationExpansionStopReason,
    muscleCoverage,
    movementPatternCoverage,
  } as const;
}

function saturationEvidence(result: DurationFittedWorkoutSuccess, mapping: CatalogMappingResult) {
  const allocationRules = allocationRuleSet();
  const durationRules = durationRuleSet();
  const selectedExerciseIds = new Set(result.exercises.map(({ exerciseId }) => exerciseId));
  const selectedFamilyIds = new Set(
    result.exercises.map(({ exerciseFamilyId }) => exerciseFamilyId),
  );
  const targetMuscleIds = new Set(result.muscleVolumeSummary.map(({ muscleId }) => muscleId));
  const currentVolumes = new Map(
    result.muscleVolumeSummary.map(({ muscleId, weightedWorkingSetContribution }) => [
      muscleId,
      weightedWorkingSetContribution,
    ]),
  );
  const hardMaximums = new Map(
    result.muscleVolumeSummary.map(({ muscleId, maximumWorkingSets }) => [
      muscleId,
      maximumWorkingSets,
    ]),
  );
  const candidateById = new Map(
    result.allocation.scoring.rankedCandidates.map(({ candidate }) => [
      candidate.exerciseId,
      candidate,
    ]),
  );
  const selectedSetRejections = new Map<string, number>();
  const unselectedCandidateRejections = new Map<string, number>();

  for (const exercise of result.exercises) {
    if (exercise.plannedWorkingSets >= allocationRules.maximumWorkingSetsPerExercise) {
      continue;
    }
    const candidate = mustGet(candidateById, exercise.exerciseId);
    if (!isTargetRelevant(candidate, targetMuscleIds, allocationRules)) {
      continue;
    }
    increment(
      selectedSetRejections,
      classifyHardMaximumRejection(
        candidate,
        1,
        currentVolumes,
        hardMaximums,
        allocationRules,
        mapping,
      ) ?? 'accepted',
    );
  }

  for (const { candidate } of result.allocation.scoring.rankedCandidates) {
    if (selectedExerciseIds.has(candidate.exerciseId)) {
      continue;
    }
    if (!isTargetRelevant(candidate, targetMuscleIds, allocationRules)) {
      continue;
    }
    const hardMaximumRejection = classifyHardMaximumRejection(
      candidate,
      durationRules.minimumWorkingSetsPerExercise,
      currentVolumes,
      hardMaximums,
      allocationRules,
      mapping,
    );
    if (hardMaximumRejection !== undefined) {
      increment(unselectedCandidateRejections, hardMaximumRejection);
    } else if (selectedFamilyIds.has(candidate.exerciseFamilyId)) {
      increment(unselectedCandidateRejections, 'movement_pattern_constraint');
    } else {
      increment(unselectedCandidateRejections, 'accepted');
    }
  }

  const selectedSetRejectionBreakdown = Object.fromEntries(selectedSetRejections);
  const unselectedCandidateRejectionBreakdown = Object.fromEntries(unselectedCandidateRejections);
  const nonHardSelectedRejections = [...selectedSetRejections.keys()].filter(
    (reason) => !reason.startsWith('hard_volume_max:'),
  );
  const nonHardCandidateRejections = [...unselectedCandidateRejections.keys()].filter(
    (reason) => !reason.startsWith('hard_volume_max:'),
  );

  return {
    targetVolumes: result.muscleVolumeSummary.map(
      ({ muscleId, weightedWorkingSetContribution, maximumWorkingSets }) => ({
        muscle: mapping.muscleIdToSlug.get(muscleId) ?? muscleId,
        actual: weightedWorkingSetContribution,
        maximum: maximumWorkingSets,
      }),
    ),
    selectedSetRejectionBreakdown,
    unselectedCandidateRejectionBreakdown,
    unselectedTargetRelevantCandidateCount: Object.values(
      unselectedCandidateRejectionBreakdown,
    ).reduce((total, count) => total + count, 0),
    allUsefulExpansionBlockedByHardVolume:
      nonHardSelectedRejections.length === 0 && nonHardCandidateRejections.length === 0,
    movementPatternConstraintRejectCount:
      unselectedCandidateRejectionBreakdown['movement_pattern_constraint'] ?? 0,
  } as const;
}

function isTargetRelevant(
  candidate: WorkoutExerciseCandidate,
  targetMuscleIds: ReadonlySet<string>,
  allocationRules: WorkoutAllocationRuleSet,
): boolean {
  return [...targetMuscleIds].some(
    (muscleId) => calculateExerciseMuscleSetContribution(candidate, muscleId, allocationRules) > 0,
  );
}

function classifyHardMaximumRejection(
  candidate: WorkoutExerciseCandidate,
  additionalSets: number,
  currentVolumes: ReadonlyMap<string, number>,
  hardMaximums: ReadonlyMap<string, number>,
  allocationRules: WorkoutAllocationRuleSet,
  mapping: CatalogMappingResult,
): string | undefined {
  for (const [muscleId, maximum] of hardMaximums) {
    const added =
      calculateExerciseMuscleSetContribution(candidate, muscleId, allocationRules) * additionalSets;
    if ((currentVolumes.get(muscleId) ?? 0) + added > maximum + Number.EPSILON) {
      return `hard_volume_max:${mapping.muscleIdToSlug.get(muscleId) ?? muscleId}`;
    }
  }
  return undefined;
}

function increment(counts: Map<string, number>, reason: string): void {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

function averageRestSeconds(diagnostics: ReturnType<typeof summarize>): number {
  const restIntervals = diagnostics.workingSetCount - diagnostics.exerciseCount;
  return restIntervals > 0 ? diagnostics.estimated.restSeconds / restIntervals : 0;
}

function productionCatalogFixture(): CatalogMappingResult {
  const plan = productionExerciseCatalogImportPlan;
  const muscleIds = new Map(
    plan.muscles.map((muscle, index) => [muscle.slug, stableUuid(1, index)]),
  );
  const equipmentIds = new Map(
    plan.equipment.map((equipment, index) => [equipment.slug, stableUuid(2, index)]),
  );
  const familyIds = new Map(
    plan.exerciseFamilies.map((family, index) => [family.slug, stableUuid(3, index)]),
  );
  const exerciseIds = new Map(
    plan.exercises.map((exercise, index) => [exercise.slug, stableUuid(4, index)]),
  );

  return mapCatalogToEngineCandidates(
    plan.exercises.map((exercise) => ({
      id: mustGet(exerciseIds, exercise.slug),
      slug: exercise.slug,
      name: exercise.name,
      exerciseFamilyId: mustGet(familyIds, exercise.exerciseFamilySlug),
      exerciseFamilySlug: exercise.exerciseFamilySlug,
      isActive: exercise.isActive,
      version: exercise.version,
    })),
    plan.muscles.map((muscle) => ({
      id: mustGet(muscleIds, muscle.slug),
      slug: muscle.slug,
      name: muscle.name,
      isActive: muscle.isActive,
    })),
    plan.exerciseMuscles.map((exerciseMuscle) => ({
      exerciseId: mustGet(exerciseIds, exerciseMuscle.exerciseSlug),
      muscleId: mustGet(muscleIds, exerciseMuscle.muscleSlug),
      role: exerciseMuscle.role,
      contribution: exerciseMuscle.contribution,
    })),
    plan.exerciseEquipment.map((exerciseEquipment) => ({
      exerciseId: mustGet(exerciseIds, exerciseEquipment.exerciseSlug),
      equipmentId: mustGet(equipmentIds, exerciseEquipment.equipmentSlug),
      equipmentSlug: exerciseEquipment.equipmentSlug,
      requirement: exerciseEquipment.requirement,
    })),
    plan.equipment.map((equipment) => ({
      id: mustGet(equipmentIds, equipment.slug),
      slug: equipment.slug,
      name: equipment.name,
      isActive: equipment.isActive,
    })),
  );
}

function stableUuid(namespace: number, index: number): string {
  return `00000000-0000-4000-8000-${String(namespace * 1000 + index).padStart(12, '0')}`;
}

function mustGet<T>(map: ReadonlyMap<string, T>, key: string): T {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Missing production catalog fixture key: ${key}`);
  }
  return value;
}

function scoringRuleSet(): WorkoutCandidateScoringRuleSet {
  return {
    contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
    ruleSetVersion: ORCHESTRATOR_RULE_SET_VERSION,
    maximumComponentMagnitude: 6.0,
    relevance: {
      primaryRoleWeight: 2.0,
      secondaryRoleWeight: 1.0,
      requiredTargetWeight: 3.0,
      preferredTargetWeight: 1.5,
    },
    adjustments: {
      userLikeBonus: 1.0,
      userDislikePenalty: 1.0,
      reducedPriorityPenalty: 1.0,
      preferredExerciseBonus: 0.5,
      preferredFamilyBonus: 0.5,
      preferredMuscleBonus: 1.0,
      templatePrescriptionBonus: 1.5,
    },
    recency: {
      windowDays: 14,
      maximumPenalty: 1.5,
    },
  };
}

function allocationRuleSet(): WorkoutAllocationRuleSet {
  return {
    contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
    ruleSetVersion: ORCHESTRATOR_RULE_SET_VERSION,
    minimumRequiredMuscleWorkingSets: 4,
    minimumPreferredMuscleWorkingSets: 2,
    requiredMuscleTargetWorkingSets: 6,
    preferredMuscleTargetWorkingSets: 4,
    preferredMuscleAdditionalWorkingSets: 2,
    defaultWorkingSetsPerExercise: 3,
    maximumWorkingSetsPerExercise: 5,
    maximumWorkingSetsPerMuscle: 12,
    maximumSelectedExercises: 10,
    minimumDistinctExerciseFamilies: 2,
    primarySetContribution: 1.0,
    secondarySetContribution: 0.6,
  };
}

function durationRuleSet(): WorkoutDurationRuleSet {
  return {
    contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
    ruleSetVersion: ORCHESTRATOR_RULE_SET_VERSION,
    defaultSetExecutionSeconds: 45,
    defaultRestSecondsBetweenSets: 90,
    defaultExerciseSetupSeconds: 45,
    transitionSecondsBetweenExercises: 45,
    minimumWorkingSetsPerExercise: 2,
    targetDurationUtilization: 0.85,
    minimumExpansionBudgetSeconds: 180,
    preferredVolumeExpansionMultiplier: 1.6,
  };
}
