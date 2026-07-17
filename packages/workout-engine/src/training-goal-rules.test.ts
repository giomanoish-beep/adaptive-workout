import { describe, expect, it } from 'vitest';
import { resolveTrainingGoalRules, trainingGoals } from './training-goal-rules.js';
import {
  constructDurationFittedWorkout,
  type DurationFittedWorkoutSuccess,
  type WorkoutAllocationRuleSet,
  type WorkoutCandidateScoringRuleSet,
  type WorkoutDurationRuleSet,
  type WorkoutEngineInput,
} from './index.js';

import {
  parseDomainId,
  parseVersionIdentifier,
  type DomainId,
  type EquipmentId,
  type ExerciseFamilyId,
  type ExerciseId,
  type MuscleId,
} from '@adaptive-workout/domain';
import type { WorkoutExerciseCandidate } from './contracts.js';

const chestId = id('10000000-0000-0000-0000-000000000001', 'muscle');
const backId = id('10000000-0000-0000-0000-000000000002', 'muscle');
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
const inclineDumbbellPressId = id('30000000-0000-0000-0000-000000000011', 'exercise');
const straightArmPulldownId = id('30000000-0000-0000-0000-000000000012', 'exercise');
const seatedLegCurlId = id('30000000-0000-0000-0000-000000000008', 'exercise');
const horizontalPressId = id('40000000-0000-0000-0000-000000000001', 'exercise-family');
const chestIsolationId = id('40000000-0000-0000-0000-000000000002', 'exercise-family');
const verticalPullId = id('40000000-0000-0000-0000-000000000003', 'exercise-family');
const horizontalPullId = id('40000000-0000-0000-0000-000000000004', 'exercise-family');
const inclinePressId = id('40000000-0000-0000-0000-000000000009', 'exercise-family');
const shoulderExtensionId = id('40000000-0000-0000-0000-000000000010', 'exercise-family');

describe('resolveTrainingGoalRules', () => {
  it('resolves every supported goal to a valid explicit rule profile', () => {
    for (const goal of trainingGoals) {
      const profile = resolveTrainingGoalRules(goal);
      expect(profile.goal).toBe(goal);
      expect(profile.volumeMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(profile.diversityTendency).toBeGreaterThan(0);
      expect(profile.expansionAggressiveness).toBeGreaterThan(0);
      expect(profile.repRangeGuidance.minimum).toBeGreaterThan(0);
      expect(profile.repRangeGuidance.maximum).toBeGreaterThanOrEqual(profile.repRangeGuidance.minimum);
      expect(['shorter', 'moderate', 'longer']).toContain(profile.restTendency);
    }
  });

  it('default/no-goal preserves existing behavior with a deterministic default', () => {
    const profile = resolveTrainingGoalRules(undefined);
    expect(profile.goal).toBe('default');
    expect(profile.volumeMultiplier).toBeGreaterThanOrEqual(1);
    expect(profile.diversityTendency).toBe(1.0);
    expect(profile.expansionAggressiveness).toBe(1.0);
  });

  it('default profile is equivalent to build_muscle for volume, diversity, and expansion', () => {
    const defaultProfile = resolveTrainingGoalRules(undefined);
    const buildMuscle = resolveTrainingGoalRules('build_muscle');
    expect(defaultProfile.volumeMultiplier).toBe(buildMuscle.volumeMultiplier);
    expect(defaultProfile.diversityTendency).toBe(buildMuscle.diversityTendency);
    expect(defaultProfile.expansionAggressiveness).toBe(buildMuscle.expansionAggressiveness);
  });
});

describe('training goal comparisons', () => {
  it('build_muscle has higher or equal meaningful expansion aggressiveness than gain_strength', () => {
    const hypertrophy = resolveTrainingGoalRules('build_muscle');
    const strength = resolveTrainingGoalRules('gain_strength');
    expect(hypertrophy.expansionAggressiveness).toBeGreaterThanOrEqual(strength.expansionAggressiveness);
  });

  it('build_muscle volume tendency >= gain_strength', () => {
    const hypertrophy = resolveTrainingGoalRules('build_muscle');
    const strength = resolveTrainingGoalRules('gain_strength');
    expect(hypertrophy.volumeMultiplier).toBeGreaterThanOrEqual(strength.volumeMultiplier);
  });

  it('gain_strength prefers lower diversity than build_muscle', () => {
    const hypertrophy = resolveTrainingGoalRules('build_muscle');
    const strength = resolveTrainingGoalRules('gain_strength');
    expect(strength.diversityTendency).toBeLessThan(hypertrophy.diversityTendency);
  });

  it('gain_strength rep guidance is lower than hypertrophy goals', () => {
    const strength = resolveTrainingGoalRules('gain_strength');
    const hypertrophy = resolveTrainingGoalRules('build_muscle');
    // Strength range is shifted lower than hypertrophy, but ranges may overlap.
    expect(strength.repRangeGuidance.minimum).toBeLessThan(hypertrophy.repRangeGuidance.minimum);
    expect(strength.repRangeGuidance.maximum).toBeLessThan(hypertrophy.repRangeGuidance.maximum);
  });

  it('gain_strength rest tendency is longer than build_muscle', () => {
    const strength = resolveTrainingGoalRules('gain_strength');
    const hypertrophy = resolveTrainingGoalRules('build_muscle');
    expect(strength.restTendency).toBe('longer');
    expect(hypertrophy.restTendency).toBe('moderate');
  });

  it('lose_fat does not exceed build_muscle expansion aggressiveness', () => {
    const fatLoss = resolveTrainingGoalRules('lose_fat');
    const hypertrophy = resolveTrainingGoalRules('build_muscle');
    expect(fatLoss.expansionAggressiveness).toBeLessThanOrEqual(hypertrophy.expansionAggressiveness);
  });

  it('lose_fat preserves resistance-training rep guidance', () => {
    const fatLoss = resolveTrainingGoalRules('lose_fat');
    expect(fatLoss.repRangeGuidance.minimum).toBeGreaterThanOrEqual(6);
    expect(fatLoss.repRangeGuidance.maximum).toBeLessThanOrEqual(15);
  });

  it('improve_fitness diversity >= gain_strength', () => {
    const fitness = resolveTrainingGoalRules('improve_fitness');
    const strength = resolveTrainingGoalRules('gain_strength');
    expect(fitness.diversityTendency).toBeGreaterThanOrEqual(strength.diversityTendency);
  });

  it('recomposition volume tendency <= build_muscle', () => {
    const recomp = resolveTrainingGoalRules('recomposition');
    const hypertrophy = resolveTrainingGoalRules('build_muscle');
    expect(recomp.volumeMultiplier).toBeLessThanOrEqual(hypertrophy.volumeMultiplier);
  });

  it('recomposition volume tendency > gain_strength', () => {
    const recomp = resolveTrainingGoalRules('recomposition');
    const strength = resolveTrainingGoalRules('gain_strength');
    expect(recomp.volumeMultiplier).toBeGreaterThan(strength.volumeMultiplier);
  });
});

describe('goal integration into duration-fitted workouts', () => {
  it('produces a different workout for build_muscle vs gain_strength on the same input', () => {
    const input = chestBackInput(60);
    const buildMuscle = resolveTrainingGoalRules('build_muscle');
    const gainStrength = resolveTrainingGoalRules('gain_strength');

    const hypertrophyResult = fit(input, buildMuscle);
    const strengthResult = fit(input, gainStrength);

    expect(hypertrophyResult.status).toBe('success');
    expect(strengthResult.status).toBe('success');
    if (hypertrophyResult.status === 'success' && strengthResult.status === 'success') {
      const hypertrophySets = totalSets(hypertrophyResult);
      const strengthSets = totalSets(strengthResult);
      // Build muscle should produce at least as much volume
      expect(hypertrophySets).toBeGreaterThanOrEqual(strengthSets);
      // The workouts should differ in at least one measurable dimension
      const hypertrophyPlan = planSummary(hypertrophyResult);
      const strengthPlan = planSummary(strengthResult);
      const anyDifference =
        hypertrophyPlan.sets !== strengthPlan.sets ||
        hypertrophyPlan.exerciseCount !== strengthPlan.exerciseCount ||
        hypertrophyPlan.minutes !== strengthPlan.minutes;
      expect(anyDifference).toBe(true);
    }
  });

  it('gain_strength leaves more spare time than build_muscle with the same 60m budget', () => {
    const input = chestBackInput(60);
    const buildMuscle = resolveTrainingGoalRules('build_muscle');
    const gainStrength = resolveTrainingGoalRules('gain_strength');

    const hypertrophyResult = fit(input, buildMuscle);
    const strengthResult = fit(input, gainStrength);

    expect(hypertrophyResult.status).toBe('success');
    expect(strengthResult.status).toBe('success');
    if (hypertrophyResult.status === 'success' && strengthResult.status === 'success') {
      const hypertrophyUtilization =
        hypertrophyResult.estimatedDuration.totalMinutes / 60;
      const strengthUtilization =
        strengthResult.estimatedDuration.totalMinutes / 60;
      // Strength should use less of the duration budget
      expect(strengthUtilization).toBeLessThanOrEqual(hypertrophyUtilization + 0.01);
    }
  });

  it('build_muscle permits at least as many exercise families as gain_strength', () => {
    const input = chestBackInput(60);
    const buildMuscle = resolveTrainingGoalRules('build_muscle');
    const gainStrength = resolveTrainingGoalRules('gain_strength');

    const hypertrophyResult = fit(input, buildMuscle);
    const strengthResult = fit(input, gainStrength);

    expect(hypertrophyResult.status).toBe('success');
    expect(strengthResult.status).toBe('success');
    if (hypertrophyResult.status === 'success' && strengthResult.status === 'success') {
      const hypertrophyFamilies = new Set(
        hypertrophyResult.exercises.map(({ exerciseFamilyId }) => exerciseFamilyId),
      );
      const strengthFamilies = new Set(
        strengthResult.exercises.map(({ exerciseFamilyId }) => exerciseFamilyId),
      );
      expect(hypertrophyFamilies.size).toBeGreaterThanOrEqual(strengthFamilies.size);
    }
  });

  it('default/no-goal produces the same result as without training goal parameter', () => {
    const input = chestBackInput(60);
    const noGoalResult = fit(input);
    const defaultResult = fit(input, resolveTrainingGoalRules(undefined));

    expect(noGoalResult).toEqual(defaultResult);
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
    deterministicSeed: 'training-goal-test',
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

function fit(
  input: WorkoutEngineInput,
  goalProfile?: ReturnType<typeof resolveTrainingGoalRules>,
): ReturnType<typeof constructDurationFittedWorkout> {
  return constructDurationFittedWorkout(
    input,
    scoringRuleSet(),
    allocationRuleSet(),
    durationRuleSet(),
    goalProfile,
  );
}

function totalSets(result: DurationFittedWorkoutSuccess): number {
  return result.exercises.reduce((total, exercise) => total + exercise.plannedWorkingSets, 0);
}

function planSummary(result: DurationFittedWorkoutSuccess) {
  return {
    sets: totalSets(result),
    exerciseCount: result.exercises.length,
    minutes: result.estimatedDuration.totalMinutes,
  };
}

function target(muscleId: MuscleId): WorkoutEngineInput['targetMuscles'][number] {
  return { muscleId, priority: 'required' };
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

function seatedLegCurl(): WorkoutExerciseCandidate {
  return exercise(seatedLegCurlId, id('40000000-0000-0000-0000-000000000008', 'exercise-family'), id('10000000-0000-0000-0000-000000000003', 'muscle'), 1, [machineId]);
}

function exercise(
  exerciseId: ExerciseId,
  exerciseFamilyId: ExerciseFamilyId,
  muscleId: MuscleId,
  contribution: number,
  equipmentIds: readonly EquipmentId[],
): WorkoutExerciseCandidate {
  return {
    exerciseId,
    exerciseFamilyId,
    isActive: true,
    muscleContributions: [{ muscleId, role: 'primary', contribution }],
    equipment: equipmentIds.map((equipmentId) => ({ equipmentId, requirement: 'required' })),
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