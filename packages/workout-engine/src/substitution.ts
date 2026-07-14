import {
  parseVersionIdentifier,
  type ContractVersion,
  type EquipmentId,
  type ExerciseFamilyId,
  type ExerciseId,
  type MuscleId,
  type RuleSetVersion,
} from '@adaptive-workout/domain';
import {
  calculateExerciseMuscleSetContribution,
  validateWorkoutAllocationRuleSet,
  type AllocatedMuscleVolumeSummary,
  type WorkoutAllocationRuleSet,
} from './allocation.js';
import type { WorkoutConstraint } from './constraints.js';
import type { WorkoutEngineInput, WorkoutExerciseCandidate } from './contracts.js';
import {
  estimateExerciseDurationSeconds,
  estimateWorkoutDurationForExercises,
  validateWorkoutDurationRuleSet,
  type DurationFittedWorkoutSuccess,
  type FittedWorkoutExercise,
  type WorkoutDurationBreakdown,
  type WorkoutDurationRuleSet,
} from './duration.js';
import {
  rankWorkoutCandidates,
  validateWorkoutCandidateScoringRuleSet,
  type WorkoutCandidateScoringRuleSet,
} from './scoring.js';

export const workoutSubstitutionReasons = [
  'equipment_busy',
  'equipment_unavailable',
  'user_dislike',
  'discomfort_constraint',
  'exercise_too_difficult',
  'manual_replacement',
] as const;

export type WorkoutSubstitutionReason = (typeof workoutSubstitutionReasons)[number];

export interface WorkoutSubstitutionEdge {
  readonly sourceExerciseId: ExerciseId;
  readonly replacementExerciseId: ExerciseId;
  readonly reasonCode: string;
  readonly compatibilityScore: number;
  readonly isActive: boolean;
}

export interface WorkoutSubstitutionRequest {
  readonly contractVersion: ContractVersion;
  readonly workout: DurationFittedWorkoutSuccess;
  readonly engineInput: WorkoutEngineInput;
  readonly currentExerciseId: ExerciseId;
  readonly reason: WorkoutSubstitutionReason;
  readonly blockedEquipmentIds: readonly EquipmentId[];
  readonly substitutionEdges: readonly WorkoutSubstitutionEdge[];
}

export interface WorkoutSubstitutionRuleSet {
  readonly contractVersion: ContractVersion;
  readonly ruleSetVersion: RuleSetVersion;
  readonly maximumAdjustmentMagnitude: number;
  readonly baseCandidateScoreWeight: number;
  readonly explicitEdgeCompatibilityWeight: number;
  readonly targetRoleCompatibilityWeight: number;
  readonly sameFamilyBonus: number;
  readonly existingFamilyRedundancyPenalty: number;
  readonly busyEquipmentPenalty: number;
  readonly userDislikeSameFamilyPenalty: number;
  readonly difficultySameFamilyPenalty: number;
  readonly prescriptionCompatibilityThreshold: number;
  readonly maximumRankedOptions: number;
  readonly allowFallbackCandidates: boolean;
}

export const workoutSubstitutionValidationCodes = [
  'INVALID_SUBSTITUTION_CONTRACT_VERSION',
  'INVALID_SUBSTITUTION_RULE_SET_VERSION',
  'RULE_SET_VERSION_MISMATCH',
  'INVALID_ADJUSTMENT_BOUND',
  'INVALID_WEIGHT_OR_ADJUSTMENT',
  'INVALID_PRESCRIPTION_THRESHOLD',
  'INVALID_OPTION_LIMIT',
  'EXPLICIT_EDGE_WEIGHT_TOO_WEAK',
] as const;

export type WorkoutSubstitutionValidationCode = (typeof workoutSubstitutionValidationCodes)[number];

export interface WorkoutSubstitutionValidationIssue {
  readonly code: WorkoutSubstitutionValidationCode;
  readonly path: string;
}

export const workoutSubstitutionScoreReasonCodes = [
  'BASE_ENGINE_SCORE',
  'EXPLICIT_SUBSTITUTION_EDGE',
  'TARGET_ROLE_COMPATIBILITY',
  'SAME_FAMILY_COMPATIBILITY',
  'CURRENT_WORKOUT_FAMILY_REDUNDANCY',
  'BLOCKED_BUSY_EQUIPMENT',
  'REASON_SAME_FAMILY_PENALTY',
] as const;

export type WorkoutSubstitutionScoreReasonCode =
  (typeof workoutSubstitutionScoreReasonCodes)[number];

export interface WorkoutSubstitutionScoreComponent {
  readonly code: WorkoutSubstitutionScoreReasonCode;
  readonly score: number;
}

export interface WorkoutSubstitutionCompatibilityEvidence {
  readonly explicitEdgeCompatibility?: number;
  readonly targetRoleCompatibility: number;
  readonly sameExerciseFamily: boolean;
  readonly duplicatesCurrentWorkoutFamily: boolean;
  readonly requiresBlockedBusyEquipment: boolean;
  readonly preservesPrescriptionIntent: boolean;
}

export interface RankedWorkoutSubstitutionOption {
  readonly rank: number;
  readonly exerciseId: ExerciseId;
  readonly exerciseFamilyId: ExerciseFamilyId;
  readonly finalScore: number;
  readonly components: readonly WorkoutSubstitutionScoreComponent[];
  readonly reasonCodes: readonly WorkoutSubstitutionScoreReasonCode[];
  readonly evidence: WorkoutSubstitutionCompatibilityEvidence;
}

export interface SubstitutedWorkoutPlan {
  readonly exercises: readonly FittedWorkoutExercise[];
  readonly muscleVolumeSummary: readonly AllocatedMuscleVolumeSummary[];
  readonly estimatedDuration: WorkoutDurationBreakdown;
  readonly maximumDurationMinutes: number;
}

export interface WorkoutSubstitutionDecision {
  readonly reason: WorkoutSubstitutionReason;
  readonly replacedExerciseId: ExerciseId;
  readonly replacementExerciseId: ExerciseId;
  readonly preservedPosition: number;
  readonly preservedWorkingSets: number;
  readonly preservedPrescriptionIntent: boolean;
}

export interface WorkoutSubstitutionSuccess {
  readonly status: 'success';
  readonly requestContractVersion: ContractVersion;
  readonly substitutionContractVersion: ContractVersion;
  readonly engineVersion: WorkoutEngineInput['version'];
  readonly substitutionRuleSetVersion: RuleSetVersion;
  readonly options: readonly RankedWorkoutSubstitutionOption[];
  readonly selectedReplacement: RankedWorkoutSubstitutionOption;
  readonly updatedWorkout: SubstitutedWorkoutPlan;
  readonly decision: WorkoutSubstitutionDecision;
}

export const workoutSubstitutionFailureCodes = [
  'CURRENT_EXERCISE_NOT_IN_WORKOUT',
  'INVALID_SUBSTITUTION_REASON',
  'INVALID_SUBSTITUTION_REQUEST',
  'INVALID_SUBSTITUTION_CONFIGURATION',
  'NO_ELIGIBLE_REPLACEMENT',
  'REPLACEMENT_BREAKS_REQUIRED_COVERAGE',
  'REPLACEMENT_VIOLATES_VOLUME_CONSTRAINT',
  'REPLACEMENT_VIOLATES_DURATION_CONSTRAINT',
] as const;

export type WorkoutSubstitutionFailureCode = (typeof workoutSubstitutionFailureCodes)[number];

export const workoutSubstitutionFailureReasonCodes = [
  'current_exercise_missing',
  'unsupported_substitution_reason',
  'invalid_substitution_request',
  'invalid_substitution_configuration',
  'current_exercise_missing_from_catalog',
  'workout_exercise_missing_from_catalog',
  'no_hard_eligible_replacement',
  'all_replacements_violate_workout_invariants',
] as const;

export type WorkoutSubstitutionFailureReasonCode =
  (typeof workoutSubstitutionFailureReasonCodes)[number];

export interface WorkoutSubstitutionFailure {
  readonly status: 'failure';
  readonly code: WorkoutSubstitutionFailureCode;
  readonly reasonCodes: readonly WorkoutSubstitutionFailureReasonCode[];
  readonly currentExerciseId: ExerciseId;
  readonly requestContractVersion: ContractVersion;
  readonly substitutionContractVersion: ContractVersion;
  readonly engineVersion: WorkoutEngineInput['version'];
  readonly substitutionRuleSetVersion: RuleSetVersion;
}

export type WorkoutSubstitutionResult = WorkoutSubstitutionSuccess | WorkoutSubstitutionFailure;

interface ValidatedReplacement {
  readonly option: Omit<RankedWorkoutSubstitutionOption, 'rank'>;
  readonly updatedWorkout: SubstitutedWorkoutPlan;
}

type ReplacementViolation = 'coverage' | 'volume' | 'duration';

export function validateWorkoutSubstitutionRuleSet(
  ruleSet: WorkoutSubstitutionRuleSet,
  expectedRuleSetVersion?: RuleSetVersion,
): readonly WorkoutSubstitutionValidationIssue[] {
  const issues: WorkoutSubstitutionValidationIssue[] = [];

  if (!parseVersionIdentifier(ruleSet.contractVersion, 'contract').ok) {
    issues.push({
      code: 'INVALID_SUBSTITUTION_CONTRACT_VERSION',
      path: 'contractVersion',
    });
  }
  if (!parseVersionIdentifier(ruleSet.ruleSetVersion, 'rule-set').ok) {
    issues.push({
      code: 'INVALID_SUBSTITUTION_RULE_SET_VERSION',
      path: 'ruleSetVersion',
    });
  }
  if (expectedRuleSetVersion !== undefined && ruleSet.ruleSetVersion !== expectedRuleSetVersion) {
    issues.push({ code: 'RULE_SET_VERSION_MISMATCH', path: 'ruleSetVersion' });
  }
  if (!isPositiveFinite(ruleSet.maximumAdjustmentMagnitude)) {
    issues.push({ code: 'INVALID_ADJUSTMENT_BOUND', path: 'maximumAdjustmentMagnitude' });
  }

  const adjustments = [
    ['baseCandidateScoreWeight', ruleSet.baseCandidateScoreWeight],
    ['explicitEdgeCompatibilityWeight', ruleSet.explicitEdgeCompatibilityWeight],
    ['targetRoleCompatibilityWeight', ruleSet.targetRoleCompatibilityWeight],
    ['sameFamilyBonus', ruleSet.sameFamilyBonus],
    ['existingFamilyRedundancyPenalty', ruleSet.existingFamilyRedundancyPenalty],
    ['busyEquipmentPenalty', ruleSet.busyEquipmentPenalty],
    ['userDislikeSameFamilyPenalty', ruleSet.userDislikeSameFamilyPenalty],
    ['difficultySameFamilyPenalty', ruleSet.difficultySameFamilyPenalty],
  ] as const;
  adjustments.forEach(([path, value]) => {
    if (!isBoundedNonNegative(value, ruleSet.maximumAdjustmentMagnitude)) {
      issues.push({ code: 'INVALID_WEIGHT_OR_ADJUSTMENT', path });
    }
  });
  if (
    ruleSet.explicitEdgeCompatibilityWeight <=
    ruleSet.sameFamilyBonus + ruleSet.targetRoleCompatibilityWeight
  ) {
    issues.push({
      code: 'EXPLICIT_EDGE_WEIGHT_TOO_WEAK',
      path: 'explicitEdgeCompatibilityWeight',
    });
  }
  if (
    !Number.isFinite(ruleSet.prescriptionCompatibilityThreshold) ||
    ruleSet.prescriptionCompatibilityThreshold < 0 ||
    ruleSet.prescriptionCompatibilityThreshold > 1
  ) {
    issues.push({
      code: 'INVALID_PRESCRIPTION_THRESHOLD',
      path: 'prescriptionCompatibilityThreshold',
    });
  }
  if (!Number.isInteger(ruleSet.maximumRankedOptions) || ruleSet.maximumRankedOptions <= 0) {
    issues.push({ code: 'INVALID_OPTION_LIMIT', path: 'maximumRankedOptions' });
  }

  return issues;
}

export function substituteWorkoutExercise(
  request: WorkoutSubstitutionRequest,
  scoringRuleSet: WorkoutCandidateScoringRuleSet,
  allocationRuleSet: WorkoutAllocationRuleSet,
  durationRuleSet: WorkoutDurationRuleSet,
  substitutionRuleSet: WorkoutSubstitutionRuleSet,
): WorkoutSubstitutionResult {
  const currentWorkoutExercise = request.workout.exercises.find(
    ({ exerciseId }) => exerciseId === request.currentExerciseId,
  );
  if (currentWorkoutExercise === undefined) {
    return substitutionFailure('CURRENT_EXERCISE_NOT_IN_WORKOUT', request, substitutionRuleSet, [
      'current_exercise_missing',
    ]);
  }
  if (!(workoutSubstitutionReasons as readonly string[]).includes(request.reason)) {
    return substitutionFailure('INVALID_SUBSTITUTION_REASON', request, substitutionRuleSet, [
      'unsupported_substitution_reason',
    ]);
  }
  if (!isValidRequest(request)) {
    return substitutionFailure('INVALID_SUBSTITUTION_REQUEST', request, substitutionRuleSet, [
      'invalid_substitution_request',
    ]);
  }
  if (
    validateWorkoutSubstitutionRuleSet(
      substitutionRuleSet,
      request.engineInput.version.ruleSetVersion,
    ).length > 0 ||
    !validateWorkoutCandidateScoringRuleSet(
      scoringRuleSet,
      request.engineInput.version.ruleSetVersion,
    ).ok ||
    validateWorkoutAllocationRuleSet(allocationRuleSet, request.engineInput.version.ruleSetVersion)
      .length > 0 ||
    validateWorkoutDurationRuleSet(durationRuleSet, request.engineInput.version.ruleSetVersion)
      .length > 0
  ) {
    return substitutionFailure('INVALID_SUBSTITUTION_CONFIGURATION', request, substitutionRuleSet, [
      'invalid_substitution_configuration',
    ]);
  }

  const currentCandidate = request.engineInput.exerciseCatalog.find(
    ({ exerciseId }) => exerciseId === request.currentExerciseId,
  );
  if (currentCandidate === undefined) {
    return substitutionFailure('INVALID_SUBSTITUTION_REQUEST', request, substitutionRuleSet, [
      'current_exercise_missing_from_catalog',
    ]);
  }
  if (!workoutCandidatesAreComplete(request)) {
    return substitutionFailure('INVALID_SUBSTITUTION_REQUEST', request, substitutionRuleSet, [
      'workout_exercise_missing_from_catalog',
    ]);
  }

  const scoringInput = buildSubstitutionScoringInput(
    request,
    currentCandidate,
    substitutionRuleSet,
  );
  const scoringResult = rankWorkoutCandidates(scoringInput, scoringRuleSet);
  if (!scoringResult.ok || scoringResult.value.rankedCandidates.length === 0) {
    return substitutionFailure('NO_ELIGIBLE_REPLACEMENT', request, substitutionRuleSet, [
      'no_hard_eligible_replacement',
    ]);
  }

  const explicitEdges = new Map(
    request.substitutionEdges
      .filter((edge) => edge.isActive && edge.sourceExerciseId === request.currentExerciseId)
      .map((edge) => [edge.replacementExerciseId, edge]),
  );
  const otherFamilyIds = new Set(
    request.workout.exercises
      .filter(({ exerciseId }) => exerciseId !== request.currentExerciseId)
      .map(({ exerciseFamilyId }) => exerciseFamilyId),
  );
  const violations = new Set<ReplacementViolation>();
  const validReplacements: ValidatedReplacement[] = [];

  scoringResult.value.rankedCandidates.forEach((scored) => {
    const edge = explicitEdges.get(scored.candidate.exerciseId);
    const components = substitutionComponents(
      request,
      currentCandidate,
      scored.candidate,
      scored.finalScore,
      edge,
      otherFamilyIds,
      substitutionRuleSet,
    ).sort(compareComponents);
    const evidence = compatibilityEvidence(
      request,
      currentCandidate,
      scored.candidate,
      edge,
      otherFamilyIds,
      substitutionRuleSet,
    );
    const option = {
      exerciseId: scored.candidate.exerciseId,
      exerciseFamilyId: scored.candidate.exerciseFamilyId,
      finalScore: components.reduce((total, component) => total + component.score, 0),
      components,
      reasonCodes: uniqueComponentCodes(components),
      evidence,
    };
    const updated = replaceAndValidateWorkout(
      request,
      currentWorkoutExercise,
      scored.candidate,
      scored.rank,
      scored.finalScore,
      evidence.preservesPrescriptionIntent,
      allocationRuleSet,
      durationRuleSet,
    );
    if ('violation' in updated) {
      violations.add(updated.violation);
    } else {
      validReplacements.push({ option, updatedWorkout: updated.workout });
    }
  });

  if (validReplacements.length === 0) {
    return substitutionFailure(violationFailureCode(violations), request, substitutionRuleSet, [
      'all_replacements_violate_workout_invariants',
    ]);
  }

  const ranked = validReplacements.sort(
    (left, right) =>
      right.option.finalScore - left.option.finalScore ||
      left.option.exerciseId.localeCompare(right.option.exerciseId),
  );
  const rankedOptions = ranked
    .slice(0, substitutionRuleSet.maximumRankedOptions)
    .map<RankedWorkoutSubstitutionOption>((replacement, index) => ({
      rank: index + 1,
      ...replacement.option,
    }));
  const selectedReplacement = rankedOptions[0]!;
  const selectedWorkout = ranked.find(
    ({ option }) => option.exerciseId === selectedReplacement.exerciseId,
  )!.updatedWorkout;

  return {
    status: 'success',
    requestContractVersion: request.contractVersion,
    substitutionContractVersion: substitutionRuleSet.contractVersion,
    engineVersion: request.engineInput.version,
    substitutionRuleSetVersion: substitutionRuleSet.ruleSetVersion,
    options: rankedOptions,
    selectedReplacement,
    updatedWorkout: selectedWorkout,
    decision: {
      reason: request.reason,
      replacedExerciseId: request.currentExerciseId,
      replacementExerciseId: selectedReplacement.exerciseId,
      preservedPosition: currentWorkoutExercise.position,
      preservedWorkingSets: currentWorkoutExercise.plannedWorkingSets,
      preservedPrescriptionIntent: selectedReplacement.evidence.preservesPrescriptionIntent,
    },
  };
}

function buildSubstitutionScoringInput(
  request: WorkoutSubstitutionRequest,
  currentCandidate: WorkoutExerciseCandidate,
  ruleSet: WorkoutSubstitutionRuleSet,
): WorkoutEngineInput {
  const selectedExerciseIds = new Set(
    request.workout.exercises.map(({ exerciseId }) => exerciseId),
  );
  const explicitReplacementIds = new Set(
    request.substitutionEdges
      .filter((edge) => edge.isActive && edge.sourceExerciseId === request.currentExerciseId)
      .map(({ replacementExerciseId }) => replacementExerciseId),
  );
  const targetPriorities = new Map(
    request.engineInput.targetMuscles.map((target) => [target.muscleId, target.priority]),
  );
  const targetMuscles = currentCandidate.muscleContributions
    .filter(({ muscleId, role }) => role !== 'stabilizer' && targetPriorities.has(muscleId))
    .map(({ muscleId }) => ({ muscleId, priority: targetPriorities.get(muscleId)! }))
    .sort((left, right) => left.muscleId.localeCompare(right.muscleId));
  const blockedEquipment = new Set(request.blockedEquipmentIds);
  const unavailableConstraint: WorkoutConstraint[] =
    request.reason === 'equipment_unavailable' && request.blockedEquipmentIds.length > 0
      ? [
          {
            id: uniqueConstraintId(request, 'substitution-unavailable-equipment'),
            kind: 'unavailable_equipment',
            source: 'user',
            reasonCode: 'equipment_unavailable',
            equipmentIds: [...request.blockedEquipmentIds].sort(),
          },
        ]
      : [];

  return {
    ...request.engineInput,
    targetMuscles,
    availableEquipmentIds:
      request.reason === 'equipment_unavailable'
        ? request.engineInput.availableEquipmentIds.filter(
            (equipmentId) => !blockedEquipment.has(equipmentId),
          )
        : request.engineInput.availableEquipmentIds,
    exerciseCatalog: request.engineInput.exerciseCatalog.filter(
      ({ exerciseId }) =>
        !selectedExerciseIds.has(exerciseId) &&
        (ruleSet.allowFallbackCandidates || explicitReplacementIds.has(exerciseId)),
    ),
    constraints: [...request.engineInput.constraints, ...unavailableConstraint],
  };
}

function uniqueConstraintId(request: WorkoutSubstitutionRequest, baseId: string): string {
  const existingIds = new Set(request.engineInput.constraints.map(({ id }) => id));
  let candidateId = baseId;
  let suffix = 2;
  while (existingIds.has(candidateId)) {
    candidateId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return candidateId;
}

function substitutionComponents(
  request: WorkoutSubstitutionRequest,
  current: WorkoutExerciseCandidate,
  replacement: WorkoutExerciseCandidate,
  baseScore: number,
  edge: WorkoutSubstitutionEdge | undefined,
  otherFamilyIds: ReadonlySet<ExerciseFamilyId>,
  ruleSet: WorkoutSubstitutionRuleSet,
): WorkoutSubstitutionScoreComponent[] {
  const sameFamily = current.exerciseFamilyId === replacement.exerciseFamilyId;
  const components: WorkoutSubstitutionScoreComponent[] = [
    { code: 'BASE_ENGINE_SCORE', score: baseScore * ruleSet.baseCandidateScoreWeight },
    {
      code: 'TARGET_ROLE_COMPATIBILITY',
      score: targetRoleCompatibility(current, replacement) * ruleSet.targetRoleCompatibilityWeight,
    },
  ];
  if (edge !== undefined) {
    components.push({
      code: 'EXPLICIT_SUBSTITUTION_EDGE',
      score: edge.compatibilityScore * ruleSet.explicitEdgeCompatibilityWeight,
    });
  }
  if (sameFamily) {
    components.push({ code: 'SAME_FAMILY_COMPATIBILITY', score: ruleSet.sameFamilyBonus });
  }
  if (otherFamilyIds.has(replacement.exerciseFamilyId)) {
    components.push({
      code: 'CURRENT_WORKOUT_FAMILY_REDUNDANCY',
      score: -ruleSet.existingFamilyRedundancyPenalty,
    });
  }
  if (
    request.reason === 'equipment_busy' &&
    requiredEquipmentIds(replacement).some((equipmentId) =>
      request.blockedEquipmentIds.includes(equipmentId),
    )
  ) {
    components.push({ code: 'BLOCKED_BUSY_EQUIPMENT', score: -ruleSet.busyEquipmentPenalty });
  }
  if (sameFamily && request.reason === 'user_dislike') {
    components.push({
      code: 'REASON_SAME_FAMILY_PENALTY',
      score: -ruleSet.userDislikeSameFamilyPenalty,
    });
  }
  if (sameFamily && request.reason === 'exercise_too_difficult') {
    components.push({
      code: 'REASON_SAME_FAMILY_PENALTY',
      score: -ruleSet.difficultySameFamilyPenalty,
    });
  }
  return components;
}

function compatibilityEvidence(
  request: WorkoutSubstitutionRequest,
  current: WorkoutExerciseCandidate,
  replacement: WorkoutExerciseCandidate,
  edge: WorkoutSubstitutionEdge | undefined,
  otherFamilyIds: ReadonlySet<ExerciseFamilyId>,
  ruleSet: WorkoutSubstitutionRuleSet,
): WorkoutSubstitutionCompatibilityEvidence {
  const sameExerciseFamily = current.exerciseFamilyId === replacement.exerciseFamilyId;
  return {
    ...(edge ? { explicitEdgeCompatibility: edge.compatibilityScore } : {}),
    targetRoleCompatibility: targetRoleCompatibility(current, replacement),
    sameExerciseFamily,
    duplicatesCurrentWorkoutFamily: otherFamilyIds.has(replacement.exerciseFamilyId),
    requiresBlockedBusyEquipment:
      request.reason === 'equipment_busy' &&
      requiredEquipmentIds(replacement).some((equipmentId) =>
        request.blockedEquipmentIds.includes(equipmentId),
      ),
    preservesPrescriptionIntent:
      sameExerciseFamily ||
      (edge?.compatibilityScore ?? 0) >= ruleSet.prescriptionCompatibilityThreshold,
  };
}

function replaceAndValidateWorkout(
  request: WorkoutSubstitutionRequest,
  current: FittedWorkoutExercise,
  replacement: WorkoutExerciseCandidate,
  scoreRank: number,
  score: number,
  preservesPrescriptionIntent: boolean,
  allocationRuleSet: WorkoutAllocationRuleSet,
  durationRuleSet: WorkoutDurationRuleSet,
): { readonly workout: SubstitutedWorkoutPlan } | { readonly violation: ReplacementViolation } {
  const restSecondsBetweenSets = preservesPrescriptionIntent
    ? current.restSecondsBetweenSets
    : durationRuleSet.defaultRestSecondsBetweenSets;
  const exercises = request.workout.exercises.map<FittedWorkoutExercise>((exercise) =>
    exercise.exerciseId === current.exerciseId
      ? {
          ...exercise,
          exerciseId: replacement.exerciseId,
          exerciseFamilyId: replacement.exerciseFamilyId,
          scoreRank,
          score,
          restSecondsBetweenSets,
          estimatedDurationSeconds: estimateExerciseDurationSeconds(
            exercise.plannedWorkingSets,
            replacement,
            restSecondsBetweenSets,
            durationRuleSet,
          ),
        }
      : exercise,
  );
  const candidates = new Map(
    request.engineInput.exerciseCatalog.map((candidate) => [candidate.exerciseId, candidate]),
  );
  const volumes = calculateWorkoutVolumes(exercises, candidates, allocationRuleSet);
  if (
    request.workout.muscleVolumeSummary.some(
      ({ muscleId, minimumWorkingSets }) =>
        (volumes.get(muscleId) ?? 0) + Number.EPSILON < minimumWorkingSets,
    )
  ) {
    return { violation: 'coverage' };
  }
  if (!respectsVolumeMaximums(volumes, request)) {
    return { violation: 'volume' };
  }

  const estimatedDuration = estimateWorkoutDurationForExercises(
    exercises.map(({ exerciseId, plannedWorkingSets, restSecondsBetweenSets: rest }) => ({
      exerciseId,
      workingSets: plannedWorkingSets,
      restSecondsBetweenSets: rest,
    })),
    request.engineInput,
    durationRuleSet,
  );
  if (estimatedDuration.totalMinutes > request.workout.maximumDurationMinutes + Number.EPSILON) {
    return { violation: 'duration' };
  }

  return {
    workout: {
      exercises,
      muscleVolumeSummary: request.workout.muscleVolumeSummary.map((summary) => ({
        ...summary,
        weightedWorkingSetContribution: volumes.get(summary.muscleId) ?? 0,
      })),
      estimatedDuration,
      maximumDurationMinutes: request.workout.maximumDurationMinutes,
    },
  };
}

function calculateWorkoutVolumes(
  exercises: readonly FittedWorkoutExercise[],
  candidates: ReadonlyMap<ExerciseId, WorkoutExerciseCandidate>,
  allocationRuleSet: WorkoutAllocationRuleSet,
): ReadonlyMap<MuscleId, number> {
  const volumes = new Map<MuscleId, number>();
  exercises.forEach((exercise) => {
    const candidate = candidates.get(exercise.exerciseId);
    candidate?.muscleContributions.forEach(({ muscleId }) => {
      const contribution =
        calculateExerciseMuscleSetContribution(candidate, muscleId, allocationRuleSet) *
        exercise.plannedWorkingSets;
      if (contribution > 0) {
        volumes.set(muscleId, (volumes.get(muscleId) ?? 0) + contribution);
      }
    });
  });
  return volumes;
}

function respectsVolumeMaximums(
  volumes: ReadonlyMap<MuscleId, number>,
  request: WorkoutSubstitutionRequest,
): boolean {
  const maximums = new Map(
    request.workout.muscleVolumeSummary.map(({ muscleId, maximumWorkingSets }) => [
      muscleId,
      maximumWorkingSets,
    ]),
  );
  request.engineInput.constraints.forEach((constraint) => {
    if (constraint.kind === 'muscle_volume_limit') {
      maximums.set(
        constraint.muscleId,
        Math.min(
          maximums.get(constraint.muscleId) ?? Number.POSITIVE_INFINITY,
          constraint.maximumWorkingSets,
        ),
      );
    }
  });
  return [...maximums.entries()].every(
    ([muscleId, maximum]) => (volumes.get(muscleId) ?? 0) <= maximum + Number.EPSILON,
  );
}

function targetRoleCompatibility(
  current: WorkoutExerciseCandidate,
  replacement: WorkoutExerciseCandidate,
): number {
  const relevant = current.muscleContributions.filter(({ role }) => role !== 'stabilizer');
  if (relevant.length === 0) {
    return 0;
  }
  const total = relevant.reduce((score, currentMuscle) => {
    const replacementMuscle = replacement.muscleContributions.find(
      ({ muscleId }) => muscleId === currentMuscle.muscleId,
    );
    if (replacementMuscle === undefined || replacementMuscle.role === 'stabilizer') {
      return score;
    }
    return score + (replacementMuscle.role === currentMuscle.role ? 1 : 0.5);
  }, 0);
  return total / relevant.length;
}

function requiredEquipmentIds(candidate: WorkoutExerciseCandidate): readonly EquipmentId[] {
  return candidate.equipment
    .filter(({ requirement }) => requirement === 'required')
    .map(({ equipmentId }) => equipmentId);
}

function isValidRequest(request: WorkoutSubstitutionRequest): boolean {
  if (!parseVersionIdentifier(request.contractVersion, 'contract').ok) {
    return false;
  }
  if (new Set(request.blockedEquipmentIds).size !== request.blockedEquipmentIds.length) {
    return false;
  }
  const workoutExerciseIds = request.workout.exercises.map(({ exerciseId }) => exerciseId);
  const workoutPositions = request.workout.exercises.map(({ position }) => position);
  if (
    new Set(workoutExerciseIds).size !== workoutExerciseIds.length ||
    new Set(workoutPositions).size !== workoutPositions.length
  ) {
    return false;
  }
  const edges = new Set<string>();
  return request.substitutionEdges.every((edge) => {
    const key = `${edge.sourceExerciseId}->${edge.replacementExerciseId}`;
    const valid =
      edge.sourceExerciseId !== edge.replacementExerciseId &&
      Number.isFinite(edge.compatibilityScore) &&
      edge.compatibilityScore > 0 &&
      edge.compatibilityScore <= 1 &&
      !edges.has(key);
    edges.add(key);
    return valid;
  });
}

function workoutCandidatesAreComplete(request: WorkoutSubstitutionRequest): boolean {
  const candidateIds = new Set(
    request.engineInput.exerciseCatalog.map(({ exerciseId }) => exerciseId),
  );
  return request.workout.exercises.every(({ exerciseId }) => candidateIds.has(exerciseId));
}

function compareComponents(
  left: WorkoutSubstitutionScoreComponent,
  right: WorkoutSubstitutionScoreComponent,
): number {
  return (
    workoutSubstitutionScoreReasonCodes.indexOf(left.code) -
    workoutSubstitutionScoreReasonCodes.indexOf(right.code)
  );
}

function uniqueComponentCodes(
  components: readonly WorkoutSubstitutionScoreComponent[],
): readonly WorkoutSubstitutionScoreReasonCode[] {
  const present = new Set(components.map(({ code }) => code));
  return workoutSubstitutionScoreReasonCodes.filter((code) => present.has(code));
}

function violationFailureCode(
  violations: ReadonlySet<ReplacementViolation>,
): WorkoutSubstitutionFailureCode {
  if (violations.has('coverage')) {
    return 'REPLACEMENT_BREAKS_REQUIRED_COVERAGE';
  }
  if (violations.has('volume')) {
    return 'REPLACEMENT_VIOLATES_VOLUME_CONSTRAINT';
  }
  if (violations.has('duration')) {
    return 'REPLACEMENT_VIOLATES_DURATION_CONSTRAINT';
  }
  return 'NO_ELIGIBLE_REPLACEMENT';
}

function substitutionFailure(
  code: WorkoutSubstitutionFailureCode,
  request: WorkoutSubstitutionRequest,
  ruleSet: WorkoutSubstitutionRuleSet,
  reasonCodes: readonly WorkoutSubstitutionFailureReasonCode[],
): WorkoutSubstitutionFailure {
  return {
    status: 'failure',
    code,
    reasonCodes,
    currentExerciseId: request.currentExerciseId,
    requestContractVersion: request.contractVersion,
    substitutionContractVersion: ruleSet.contractVersion,
    engineVersion: request.engineInput.version,
    substitutionRuleSetVersion: ruleSet.ruleSetVersion,
  };
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isBoundedNonNegative(value: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= maximum;
}
