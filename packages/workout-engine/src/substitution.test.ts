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
  constructDurationFittedWorkout,
  estimateWorkoutDurationForExercises,
  substituteWorkoutExercise,
  type DurationFittedWorkoutSuccess,
  type WorkoutAllocationRuleSet,
  type WorkoutCandidateScoringRuleSet,
  type WorkoutDurationRuleSet,
  type WorkoutEngineInput,
  type WorkoutExerciseCandidate,
  type WorkoutSubstitutionEdge,
  type WorkoutSubstitutionReason,
  type WorkoutSubstitutionRequest,
  type WorkoutSubstitutionRuleSet,
  type WorkoutSubstitutionSuccess,
} from './index.js';

const chestId = id('10000000-0000-0000-0000-000000000001', 'muscle');
const backId = id('10000000-0000-0000-0000-000000000002', 'muscle');
const quadricepsId = id('10000000-0000-0000-0000-000000000003', 'muscle');
const hamstringsId = id('10000000-0000-0000-0000-000000000004', 'muscle');
const glutesId = id('10000000-0000-0000-0000-000000000005', 'muscle');
const barbellId = id('20000000-0000-0000-0000-000000000001', 'equipment');
const rackId = id('20000000-0000-0000-0000-000000000002', 'equipment');
const benchId = id('20000000-0000-0000-0000-000000000003', 'equipment');
const dumbbellId = id('20000000-0000-0000-0000-000000000004', 'equipment');
const cableId = id('20000000-0000-0000-0000-000000000005', 'equipment');
const smithId = id('20000000-0000-0000-0000-000000000006', 'equipment');
const plateLoadedId = id('20000000-0000-0000-0000-000000000007', 'equipment');
const machineId = id('20000000-0000-0000-0000-000000000008', 'equipment');
const bodyweightId = id('20000000-0000-0000-0000-000000000009', 'equipment');

const barbellBenchId = id('30000000-0000-0000-0000-000000000001', 'exercise');
const dumbbellBenchId = id('30000000-0000-0000-0000-000000000002', 'exercise');
const dumbbellFloorPressId = id('30000000-0000-0000-0000-000000000003', 'exercise');
const cableChestPressId = id('30000000-0000-0000-0000-000000000004', 'exercise');
const inclineDumbbellPressId = id('30000000-0000-0000-0000-000000000005', 'exercise');
const inclineSmithPressId = id('30000000-0000-0000-0000-000000000006', 'exercise');
const latPulldownId = id('30000000-0000-0000-0000-000000000007', 'exercise');
const plateLoadedPulldownId = id('30000000-0000-0000-0000-000000000008', 'exercise');
const assistedPullUpId = id('30000000-0000-0000-0000-000000000009', 'exercise');
const seatedCableRowId = id('30000000-0000-0000-0000-000000000010', 'exercise');
const chestSupportedRowId = id('30000000-0000-0000-0000-000000000011', 'exercise');
const backSquatId = id('30000000-0000-0000-0000-000000000012', 'exercise');
const hackSquatId = id('30000000-0000-0000-0000-000000000013', 'exercise');
const gobletSquatId = id('30000000-0000-0000-0000-000000000014', 'exercise');
const legPressId = id('30000000-0000-0000-0000-000000000015', 'exercise');
const romanianDeadliftId = id('30000000-0000-0000-0000-000000000016', 'exercise');
const dumbbellRomanianDeadliftId = id('30000000-0000-0000-0000-000000000017', 'exercise');
const cablePullThroughId = id('30000000-0000-0000-0000-000000000018', 'exercise');
const lowContributionPressId = id('30000000-0000-0000-0000-000000000019', 'exercise');

const horizontalPressId = id('40000000-0000-0000-0000-000000000001', 'exercise-family');
const inclinePressId = id('40000000-0000-0000-0000-000000000002', 'exercise-family');
const verticalPullId = id('40000000-0000-0000-0000-000000000003', 'exercise-family');
const horizontalPullId = id('40000000-0000-0000-0000-000000000004', 'exercise-family');
const kneeDominantId = id('40000000-0000-0000-0000-000000000005', 'exercise-family');
const hipHingeId = id('40000000-0000-0000-0000-000000000006', 'exercise-family');
const hipExtensionId = id('40000000-0000-0000-0000-000000000007', 'exercise-family');

const names = new Map<ExerciseId, string>([
  [barbellBenchId, 'Barbell Bench Press'],
  [dumbbellBenchId, 'Dumbbell Bench Press'],
  [dumbbellFloorPressId, 'Dumbbell Floor Press'],
  [cableChestPressId, 'Cable Chest Press'],
  [inclineDumbbellPressId, 'Incline Dumbbell Press'],
  [inclineSmithPressId, 'Smith Machine Incline Press'],
  [latPulldownId, 'Lat Pulldown'],
  [plateLoadedPulldownId, 'Plate-Loaded Pulldown'],
  [assistedPullUpId, 'Assisted Pull-Up'],
  [seatedCableRowId, 'Seated Cable Row'],
  [chestSupportedRowId, 'Chest-Supported Dumbbell Row'],
  [backSquatId, 'Barbell Back Squat'],
  [hackSquatId, 'Hack Squat'],
  [gobletSquatId, 'Goblet Squat'],
  [legPressId, 'Leg Press'],
  [romanianDeadliftId, 'Romanian Deadlift'],
  [dumbbellRomanianDeadliftId, 'Dumbbell Romanian Deadlift'],
  [cablePullThroughId, 'Cable Pull-Through'],
]);

describe('deterministic workout substitutions', () => {
  it('replaces barbell bench press with an explicit dumbbell bench alternative', () => {
    const result = substitute(
      request(
        barbellBench(),
        [barbellBench(), dumbbellBench(), cableChestPress()],
        'manual_replacement',
        [],
        [edge(barbellBenchId, dumbbellBenchId, 0.95)],
      ),
    );

    expect(result.selectedReplacement.exerciseId).toBe(dumbbellBenchId);
  });

  it('excludes dumbbell bench when the bench is unavailable and permits floor press', () => {
    const result = substitute(
      request(
        dumbbellBench(),
        [dumbbellBench(), dumbbellFloorPress(), cableChestPress(), inclineDumbbellPress()],
        'equipment_unavailable',
        [benchId],
        [edge(dumbbellBenchId, dumbbellFloorPressId, 0.95)],
      ),
    );

    expect(result.selectedReplacement.exerciseId).toBe(dumbbellFloorPressId);
    expect(result.options.map(({ exerciseId }) => exerciseId)).not.toContain(
      inclineDumbbellPressId,
    );
  });

  it('replaces incline press with an explicit Smith alternative', () => {
    const result = substitute(
      request(
        inclineDumbbellPress(),
        [inclineDumbbellPress(), inclineSmithPress(), cableChestPress()],
        'manual_replacement',
        [],
        [edge(inclineDumbbellPressId, inclineSmithPressId, 0.9)],
      ),
    );

    expect(result.selectedReplacement.exerciseId).toBe(inclineSmithPressId);
  });

  it('replaces lat pulldown with a plate-loaded vertical pull', () => {
    const result = substitute(
      request(
        latPulldown(),
        [latPulldown(), plateLoadedPulldown(), assistedPullUp()],
        'manual_replacement',
        [],
        [edge(latPulldownId, plateLoadedPulldownId, 0.94)],
      ),
    );

    expect(result.selectedReplacement.exerciseId).toBe(plateLoadedPulldownId);
  });

  it('replaces seated cable row with a chest-supported row', () => {
    const result = substitute(
      request(
        seatedCableRow(),
        [seatedCableRow(), chestSupportedRow(), assistedPullUp()],
        'equipment_busy',
        [cableId],
        [edge(seatedCableRowId, chestSupportedRowId, 0.9)],
      ),
    );

    expect(result.selectedReplacement.exerciseId).toBe(chestSupportedRowId);
  });

  it('replaces squat when rack and barbell are unavailable', () => {
    const result = substitute(
      request(
        backSquat(),
        [backSquat(), hackSquat(), gobletSquat()],
        'equipment_unavailable',
        [barbellId, rackId],
        [edge(backSquatId, hackSquatId, 0.9)],
      ),
    );

    expect(result.selectedReplacement.exerciseId).toBe(hackSquatId);
  });

  it('replaces leg press deterministically', () => {
    const result = substitute(
      request(
        legPress(),
        [legPress(), hackSquat(), gobletSquat()],
        'equipment_busy',
        [machineId],
        [edge(legPressId, hackSquatId, 0.88)],
      ),
    );

    expect(result.selectedReplacement.exerciseId).toBe(hackSquatId);
  });

  it('replaces Romanian deadlift with a compatible alternative', () => {
    const result = substitute(
      request(
        romanianDeadlift(),
        [romanianDeadlift(), dumbbellRomanianDeadlift(), cablePullThrough()],
        'manual_replacement',
        [],
        [edge(romanianDeadliftId, dumbbellRomanianDeadliftId, 0.96)],
      ),
    );

    expect(result.selectedReplacement.exerciseId).toBe(dumbbellRomanianDeadliftId);
  });

  it('penalizes blocked busy equipment when alternatives exist', () => {
    const result = substitute(
      request(
        latPulldown(),
        [latPulldown(), plateLoadedPulldown(), assistedPullUp()],
        'equipment_busy',
        [cableId],
      ),
    );

    expect(result.selectedReplacement.exerciseId).not.toBe(latPulldownId);
    expect(result.selectedReplacement.evidence.requiresBlockedBusyEquipment).toBe(false);
  });

  it('strictly excludes unavailable required equipment', () => {
    const result = substitute(
      request(
        barbellBench(),
        [barbellBench(), dumbbellBench(), cableChestPress()],
        'equipment_unavailable',
        [benchId],
      ),
    );

    expect(result.options.map(({ exerciseId }) => exerciseId)).toEqual([cableChestPressId]);
  });

  it('never returns the disliked current exercise itself', () => {
    const result = substitute(
      request(
        dumbbellBench(),
        [dumbbellBench(), dumbbellFloorPress(), cableChestPress()],
        'user_dislike',
      ),
    );

    expect(result.options.map(({ exerciseId }) => exerciseId)).not.toContain(dumbbellBenchId);
  });

  it('penalizes replacement families already duplicated in the workout', () => {
    const replacementRequest = request(
      barbellBench(),
      [barbellBench(), dumbbellBench(), cableChestPress(), inclineDumbbellPress()],
      'manual_replacement',
    );
    const otherPress = replacementRequest.workout.exercises[0]!;
    const withDuplicateFamily: WorkoutSubstitutionRequest = {
      ...replacementRequest,
      workout: {
        ...replacementRequest.workout,
        exercises: [
          otherPress,
          {
            ...otherPress,
            position: 2,
            exerciseId: inclineDumbbellPressId,
            exerciseFamilyId: horizontalPressId,
          },
        ],
      },
    };
    const result = substitute(withDuplicateFamily);

    expect(
      result.options.find(({ exerciseId }) => exerciseId === dumbbellBenchId)?.reasonCodes,
    ).toContain('CURRENT_WORKOUT_FAMILY_REDUNDANCY');
  });

  it('ranks an explicit edge above a weaker generic match', () => {
    const result = substitute(
      request(
        barbellBench(),
        [barbellBench(), dumbbellBench(), cableChestPress()],
        'manual_replacement',
        [],
        [edge(barbellBenchId, dumbbellBenchId, 0.9)],
      ),
    );

    expect(result.options[0]?.exerciseId).toBe(dumbbellBenchId);
    expect(result.options[0]?.reasonCodes).toContain('EXPLICIT_SUBSTITUTION_EDGE');
  });

  it('never returns a hard-filtered explicit edge', () => {
    const result = substitute(
      request(
        dumbbellBench(),
        [dumbbellBench(), dumbbellFloorPress(), cableChestPress(), inclineDumbbellPress()],
        'equipment_unavailable',
        [benchId],
        [
          edge(dumbbellBenchId, cableChestPressId, 0.5),
          edge(dumbbellBenchId, inclineDumbbellPressId, 0.9),
        ],
      ),
    );

    expect(result.options.map(({ exerciseId }) => exerciseId)).not.toContain(
      inclineDumbbellPressId,
    );
  });

  it('preserves required target-muscle coverage', () => {
    const result = substitute(
      request(
        barbellBench(),
        [barbellBench(), lowContributionPress(), dumbbellBench()],
        'manual_replacement',
      ),
    );

    expect(result.options.map(({ exerciseId }) => exerciseId)).not.toContain(
      lowContributionPressId,
    );
    expect(
      result.updatedWorkout.muscleVolumeSummary[0]?.weightedWorkingSetContribution,
    ).toBeGreaterThanOrEqual(result.updatedWorkout.muscleVolumeSummary[0]?.minimumWorkingSets ?? 0);
  });

  it('reconciles muscle-volume summary after replacement', () => {
    const replacementRequest = request(
      barbellBench(),
      [barbellBench(), dumbbellBench()],
      'manual_replacement',
      [],
      [edge(barbellBenchId, dumbbellBenchId, 0.95)],
    );
    const result = substitute(replacementRequest);
    const sets = result.updatedWorkout.exercises[0]!.plannedWorkingSets;

    expect(result.updatedWorkout.muscleVolumeSummary[0]?.weightedWorkingSetContribution).toBe(sets);
  });

  it('reconciles estimated duration after replacement', () => {
    const replacementRequest = request(
      barbellBench(),
      [barbellBench(), dumbbellBench()],
      'manual_replacement',
      [],
      [edge(barbellBenchId, dumbbellBenchId, 0.95)],
    );
    const result = substitute(replacementRequest);
    const estimate = estimateWorkoutDurationForExercises(
      result.updatedWorkout.exercises.map(
        ({ exerciseId, plannedWorkingSets, restSecondsBetweenSets }) => ({
          exerciseId,
          workingSets: plannedWorkingSets,
          restSecondsBetweenSets,
        }),
      ),
      replacementRequest.engineInput,
      durationRuleSet(),
    );

    expect(result.updatedWorkout.estimatedDuration).toEqual(estimate);
  });

  it('preserves exercise position and working-set count', () => {
    const replacementRequest = request(
      barbellBench(),
      [barbellBench(), dumbbellBench()],
      'manual_replacement',
      [],
      [edge(barbellBenchId, dumbbellBenchId, 0.95)],
    );
    const result = substitute(replacementRequest);
    const original = replacementRequest.workout.exercises[0]!;
    const updated = result.updatedWorkout.exercises[0]!;

    expect(updated.position).toBe(original.position);
    expect(updated.plannedWorkingSets).toBe(original.plannedWorkingSets);
  });

  it('is independent of candidate input ordering', () => {
    const original = request(
      latPulldown(),
      [latPulldown(), plateLoadedPulldown(), assistedPullUp()],
      'manual_replacement',
      [],
      [edge(latPulldownId, plateLoadedPulldownId, 0.9)],
    );
    const reversed = {
      ...original,
      engineInput: {
        ...original.engineInput,
        exerciseCatalog: [...original.engineInput.exerciseCatalog].reverse(),
      },
    };

    expect(substitute(reversed)).toEqual(substitute(original));
  });

  it('returns a typed failure when no eligible replacement exists', () => {
    const result = substituteResult(
      request(dumbbellBench(), [dumbbellBench()], 'manual_replacement'),
    );

    expect(result).toMatchObject({ status: 'failure', code: 'NO_ELIGIBLE_REPLACEMENT' });
  });

  it('returns a typed failure when the current exercise is absent', () => {
    const replacementRequest = request(
      dumbbellBench(),
      [dumbbellBench(), dumbbellFloorPress()],
      'manual_replacement',
    );
    const result = substituteResult({
      ...replacementRequest,
      currentExerciseId: barbellBenchId,
    });

    expect(result).toMatchObject({
      status: 'failure',
      code: 'CURRENT_EXERCISE_NOT_IN_WORKOUT',
    });
  });

  it('returns a typed failure for an unsupported substitution reason', () => {
    const replacementRequest = request(
      dumbbellBench(),
      [dumbbellBench(), dumbbellFloorPress()],
      'manual_replacement',
    );
    const result = substituteResult({
      ...replacementRequest,
      reason: 'unsupported' as WorkoutSubstitutionReason,
    });

    expect(result).toMatchObject({
      status: 'failure',
      code: 'INVALID_SUBSTITUTION_REASON',
    });
  });

  it('rejects invalid substitution configuration', () => {
    const replacementRequest = request(
      dumbbellBench(),
      [dumbbellBench(), dumbbellFloorPress()],
      'manual_replacement',
    );
    const result = substituteResult(replacementRequest, {
      ...substitutionRuleSet(),
      maximumRankedOptions: 0,
    });

    expect(result).toMatchObject({
      status: 'failure',
      code: 'INVALID_SUBSTITUTION_CONFIGURATION',
    });
  });

  it('shows representative ranked substitution options', () => {
    expect(
      optionNames(
        substitute(
          request(
            dumbbellBench(),
            [dumbbellBench(), dumbbellFloorPress(), cableChestPress()],
            'equipment_unavailable',
            [benchId],
            [edge(dumbbellBenchId, dumbbellFloorPressId, 0.95)],
          ),
        ),
      ),
    ).toEqual(['Dumbbell Floor Press', 'Cable Chest Press']);
    expect(
      optionNames(
        substitute(
          request(
            latPulldown(),
            [latPulldown(), plateLoadedPulldown(), assistedPullUp()],
            'equipment_busy',
            [cableId],
            [edge(latPulldownId, plateLoadedPulldownId, 0.94)],
          ),
        ),
      ),
    ).toEqual(['Plate-Loaded Pulldown', 'Assisted Pull-Up']);
    expect(
      optionNames(
        substitute(
          request(
            backSquat(),
            [backSquat(), hackSquat(), gobletSquat()],
            'equipment_unavailable',
            [barbellId, rackId],
            [edge(backSquatId, hackSquatId, 0.9)],
          ),
        ),
      ),
    ).toEqual(['Hack Squat', 'Goblet Squat']);
    expect(
      optionNames(
        substitute(
          request(
            legPress(),
            [legPress(), hackSquat(), gobletSquat()],
            'equipment_busy',
            [machineId],
            [edge(legPressId, hackSquatId, 0.88)],
          ),
        ),
      ),
    ).toEqual(['Hack Squat', 'Goblet Squat']);
    expect(
      optionNames(
        substitute(
          request(
            romanianDeadlift(),
            [romanianDeadlift(), dumbbellRomanianDeadlift(), cablePullThrough()],
            'manual_replacement',
            [],
            [edge(romanianDeadliftId, dumbbellRomanianDeadliftId, 0.96)],
          ),
        ),
      ),
    ).toEqual(['Dumbbell Romanian Deadlift', 'Cable Pull-Through']);
  });
});

function request(
  current: WorkoutExerciseCandidate,
  candidates: readonly WorkoutExerciseCandidate[],
  reason: WorkoutSubstitutionReason,
  blockedEquipmentIds: readonly EquipmentId[] = [],
  substitutionEdges: readonly WorkoutSubstitutionEdge[] = [],
): WorkoutSubstitutionRequest {
  const workoutInput = inputFor([current], primaryMuscleId(current));
  const workout = constructWorkout(workoutInput);
  return {
    contractVersion: version('workout-substitution-request-v1', 'contract'),
    workout,
    engineInput: { ...workoutInput, exerciseCatalog: candidates },
    currentExerciseId: current.exerciseId,
    reason,
    blockedEquipmentIds,
    substitutionEdges,
  };
}

function constructWorkout(input: WorkoutEngineInput): DurationFittedWorkoutSuccess {
  const result = constructDurationFittedWorkout(
    input,
    scoringRuleSet(),
    allocationRuleSet(),
    durationRuleSet(),
  );
  if (result.status === 'failure') {
    throw new Error(`Workout fixture failed: ${JSON.stringify(result)}`);
  }
  return result;
}

function inputFor(
  exerciseCatalog: readonly WorkoutExerciseCandidate[],
  targetMuscleId: MuscleId,
): WorkoutEngineInput {
  const engineVersion = version('workout-engine-v1', 'engine');
  const ruleSetVersion = version('workout-rules-v1', 'rule-set');
  return {
    contractVersion: version('workout-input-v1', 'contract'),
    sessionDate: '2026-07-14',
    deterministicSeed: 'substitution-fixture',
    origin: 'adapted',
    goal: 'hypertrophy',
    experienceLevel: 'intermediate',
    targetMuscles: [{ muscleId: targetMuscleId, priority: 'required' }],
    excludedMuscleIds: [],
    availableDurationMinutes: 45,
    availableEquipmentIds: [
      barbellId,
      rackId,
      benchId,
      dumbbellId,
      cableId,
      smithId,
      plateLoadedId,
      machineId,
      bodyweightId,
    ],
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

function substitutionRuleSet(): WorkoutSubstitutionRuleSet {
  return {
    contractVersion: version('workout-substitution-v1', 'contract'),
    ruleSetVersion: version('workout-rules-v1', 'rule-set'),
    maximumAdjustmentMagnitude: 200,
    baseCandidateScoreWeight: 1,
    explicitEdgeCompatibilityWeight: 100,
    targetRoleCompatibilityWeight: 20,
    sameFamilyBonus: 10,
    existingFamilyRedundancyPenalty: 15,
    busyEquipmentPenalty: 50,
    userDislikeSameFamilyPenalty: 20,
    difficultySameFamilyPenalty: 15,
    prescriptionCompatibilityThreshold: 0.8,
    maximumRankedOptions: 5,
    allowFallbackCandidates: true,
  };
}

function substitute(
  replacementRequest: WorkoutSubstitutionRequest,
  rules = substitutionRuleSet(),
): WorkoutSubstitutionSuccess {
  const result = substituteResult(replacementRequest, rules);
  if (result.status === 'failure') {
    throw new Error(`Substitution failed: ${JSON.stringify(result)}`);
  }
  return result;
}

function substituteResult(
  replacementRequest: WorkoutSubstitutionRequest,
  rules = substitutionRuleSet(),
) {
  return substituteWorkoutExercise(
    replacementRequest,
    scoringRuleSet(),
    allocationRuleSet(),
    durationRuleSet(),
    rules,
  );
}

function edge(
  sourceExerciseId: ExerciseId,
  replacementExerciseId: ExerciseId,
  compatibilityScore: number,
): WorkoutSubstitutionEdge {
  return {
    sourceExerciseId,
    replacementExerciseId,
    reasonCode: 'catalog_substitution',
    compatibilityScore,
    isActive: true,
  };
}

function barbellBench() {
  return exercise(barbellBenchId, horizontalPressId, chestId, 1, [barbellId, benchId]);
}

function dumbbellBench() {
  return exercise(dumbbellBenchId, horizontalPressId, chestId, 1, [dumbbellId, benchId]);
}

function dumbbellFloorPress() {
  return exercise(dumbbellFloorPressId, horizontalPressId, chestId, 0.9, [dumbbellId]);
}

function cableChestPress() {
  return exercise(cableChestPressId, horizontalPressId, chestId, 0.85, [cableId]);
}

function inclineDumbbellPress() {
  return exercise(inclineDumbbellPressId, inclinePressId, chestId, 1, [dumbbellId, benchId]);
}

function inclineSmithPress() {
  return exercise(inclineSmithPressId, inclinePressId, chestId, 0.95, [smithId, benchId]);
}

function latPulldown() {
  return exercise(latPulldownId, verticalPullId, backId, 1, [cableId]);
}

function plateLoadedPulldown() {
  return exercise(plateLoadedPulldownId, verticalPullId, backId, 0.95, [plateLoadedId]);
}

function assistedPullUp() {
  return exercise(assistedPullUpId, verticalPullId, backId, 0.85, [machineId]);
}

function seatedCableRow() {
  return exercise(seatedCableRowId, horizontalPullId, backId, 1, [cableId]);
}

function chestSupportedRow() {
  return exercise(chestSupportedRowId, horizontalPullId, backId, 0.9, [dumbbellId, benchId]);
}

function backSquat() {
  return exercise(backSquatId, kneeDominantId, quadricepsId, 1, [barbellId, rackId]);
}

function hackSquat() {
  return exercise(hackSquatId, kneeDominantId, quadricepsId, 0.95, [plateLoadedId]);
}

function gobletSquat() {
  return exercise(gobletSquatId, kneeDominantId, quadricepsId, 0.8, [dumbbellId]);
}

function legPress() {
  return exercise(legPressId, kneeDominantId, quadricepsId, 1, [machineId]);
}

function romanianDeadlift() {
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

function dumbbellRomanianDeadlift() {
  return multiMuscleExercise(
    dumbbellRomanianDeadliftId,
    hipHingeId,
    [
      { muscleId: hamstringsId, role: 'primary', contribution: 0.95 },
      { muscleId: glutesId, role: 'secondary', contribution: 0.9 },
    ],
    [dumbbellId],
  );
}

function cablePullThrough() {
  return multiMuscleExercise(
    cablePullThroughId,
    hipExtensionId,
    [
      { muscleId: hamstringsId, role: 'primary', contribution: 0.8 },
      { muscleId: glutesId, role: 'secondary', contribution: 1 },
    ],
    [cableId],
  );
}

function lowContributionPress() {
  return exercise(lowContributionPressId, horizontalPressId, chestId, 0.5, [cableId]);
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

function primaryMuscleId(candidate: WorkoutExerciseCandidate): MuscleId {
  const primary = candidate.muscleContributions.find(({ role }) => role === 'primary');
  if (primary === undefined) {
    throw new Error('Substitution fixture requires a primary muscle.');
  }
  return primary.muscleId;
}

function optionNames(result: WorkoutSubstitutionSuccess): readonly string[] {
  return result.options.map(({ exerciseId }) => names.get(exerciseId) ?? exerciseId);
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
