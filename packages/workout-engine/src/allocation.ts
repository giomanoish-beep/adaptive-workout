import {
  parseVersionIdentifier,
  type ContractVersion,
  type ExerciseFamilyId,
  type ExerciseId,
  type MuscleId,
  type RuleSetVersion,
} from '@adaptive-workout/domain';
import type { WorkoutEngineInput, WorkoutExerciseCandidate } from './contracts.js';
import {
  rankWorkoutCandidates,
  validateWorkoutCandidateScoringRuleSet,
  type ScoredWorkoutCandidate,
  type WorkoutCandidateScoringResult,
  type WorkoutCandidateScoringRuleSet,
} from './scoring.js';
import { validateWorkoutEngineInput } from './validation.js';

export interface WorkoutAllocationRuleSet {
  readonly contractVersion: ContractVersion;
  readonly ruleSetVersion: RuleSetVersion;
  readonly minimumRequiredMuscleWorkingSets: number;
  readonly minimumPreferredMuscleWorkingSets: number;
  readonly requiredMuscleTargetWorkingSets: number;
  readonly preferredMuscleTargetWorkingSets: number;
  readonly preferredMuscleAdditionalWorkingSets: number;
  readonly defaultWorkingSetsPerExercise: number;
  readonly maximumWorkingSetsPerExercise: number;
  readonly maximumWorkingSetsPerMuscle: number;
  readonly maximumSelectedExercises: number;
  readonly minimumDistinctExerciseFamilies: number;
  readonly primarySetContribution: number;
  readonly secondarySetContribution: number;
}

export const workoutAllocationFailureCodes = [
  'INVALID_INPUT',
  'INVALID_SCORING_CONFIGURATION',
  'INVALID_ALLOCATION_CONFIGURATION',
  'INSUFFICIENT_TARGET_COVERAGE',
  'IMPOSSIBLE_VOLUME_CONSTRAINTS',
  'NO_VIABLE_DIVERSE_SELECTION',
] as const;

export type WorkoutAllocationFailureCode = (typeof workoutAllocationFailureCodes)[number];

export const workoutAllocationValidationCodes = [
  'INVALID_ALLOCATION_CONTRACT_VERSION',
  'INVALID_ALLOCATION_RULE_SET_VERSION',
  'RULE_SET_VERSION_MISMATCH',
  'INVALID_VOLUME_TARGET',
  'INVALID_EXERCISE_SET_BOUNDS',
  'INVALID_MUSCLE_SET_BOUND',
  'INVALID_SELECTION_BOUND',
  'INVALID_DIVERSITY_BOUND',
  'INVALID_CONTRIBUTION_WEIGHT',
] as const;

export type WorkoutAllocationValidationCode = (typeof workoutAllocationValidationCodes)[number];

export interface WorkoutAllocationValidationIssue {
  readonly code: WorkoutAllocationValidationCode;
  readonly path: string;
}

export const workoutSelectionReasonCodes = [
  'TARGET_VOLUME_COVERAGE',
  'HIGH_RANKED_CANDIDATE',
  'FAMILY_DIVERSITY',
  'FAMILY_REUSE_REQUIRED',
] as const;

export type WorkoutSelectionReasonCode = (typeof workoutSelectionReasonCodes)[number];

export interface SelectedWorkoutExercise {
  readonly position: number;
  readonly exerciseId: ExerciseId;
  readonly exerciseFamilyId: ExerciseFamilyId;
  readonly plannedWorkingSets: number;
  readonly scoreRank: number;
  readonly score: number;
  readonly reasonCodes: readonly WorkoutSelectionReasonCode[];
}

export interface AllocatedMuscleVolumeSummary {
  readonly muscleId: MuscleId;
  readonly targetWorkingSets: number;
  readonly minimumWorkingSets: number;
  readonly maximumWorkingSets: number;
  readonly weightedWorkingSetContribution: number;
}

export interface WorkoutAllocationSuccess {
  readonly status: 'success';
  readonly inputContractVersion: ContractVersion;
  readonly allocationContractVersion: ContractVersion;
  readonly engineVersion: WorkoutEngineInput['version'];
  readonly allocationRuleSetVersion: RuleSetVersion;
  readonly selectedExercises: readonly SelectedWorkoutExercise[];
  readonly muscleVolumeSummary: readonly AllocatedMuscleVolumeSummary[];
  readonly scoring: WorkoutCandidateScoringResult;
}

export interface WorkoutAllocationFailure {
  readonly status: 'failure';
  readonly code: WorkoutAllocationFailureCode;
  readonly reasonCodes: readonly string[];
  readonly relatedMuscleIds: readonly MuscleId[];
  readonly inputContractVersion: ContractVersion;
  readonly allocationContractVersion: ContractVersion;
  readonly engineVersion: WorkoutEngineInput['version'];
  readonly allocationRuleSetVersion: RuleSetVersion;
}

export type WorkoutAllocationResult = WorkoutAllocationSuccess | WorkoutAllocationFailure;

interface MuscleAllocationTarget {
  readonly muscleId: MuscleId;
  readonly targetWorkingSets: number;
  readonly minimumWorkingSets: number;
  readonly maximumWorkingSets: number;
}

interface MutableSelectedExercise {
  readonly scored: ScoredWorkoutCandidate;
  readonly reasonCodes: Set<WorkoutSelectionReasonCode>;
  workingSets: number;
}

export function validateWorkoutAllocationRuleSet(
  ruleSet: WorkoutAllocationRuleSet,
  expectedRuleSetVersion?: RuleSetVersion,
): readonly WorkoutAllocationValidationIssue[] {
  const issues: WorkoutAllocationValidationIssue[] = [];

  if (!parseVersionIdentifier(ruleSet.contractVersion, 'contract').ok) {
    issues.push({
      code: 'INVALID_ALLOCATION_CONTRACT_VERSION',
      path: 'contractVersion',
    });
  }
  if (!parseVersionIdentifier(ruleSet.ruleSetVersion, 'rule-set').ok) {
    issues.push({
      code: 'INVALID_ALLOCATION_RULE_SET_VERSION',
      path: 'ruleSetVersion',
    });
  }
  if (expectedRuleSetVersion !== undefined && ruleSet.ruleSetVersion !== expectedRuleSetVersion) {
    issues.push({ code: 'RULE_SET_VERSION_MISMATCH', path: 'ruleSetVersion' });
  }

  const volumeTargets = [
    ['minimumRequiredMuscleWorkingSets', ruleSet.minimumRequiredMuscleWorkingSets],
    ['minimumPreferredMuscleWorkingSets', ruleSet.minimumPreferredMuscleWorkingSets],
    ['requiredMuscleTargetWorkingSets', ruleSet.requiredMuscleTargetWorkingSets],
    ['preferredMuscleTargetWorkingSets', ruleSet.preferredMuscleTargetWorkingSets],
    ['preferredMuscleAdditionalWorkingSets', ruleSet.preferredMuscleAdditionalWorkingSets],
  ] as const;
  volumeTargets.forEach(([path, value]) => {
    if (!isNonNegativeInteger(value)) {
      issues.push({ code: 'INVALID_VOLUME_TARGET', path });
    }
  });
  if (
    ruleSet.requiredMuscleTargetWorkingSets < ruleSet.minimumRequiredMuscleWorkingSets ||
    ruleSet.preferredMuscleTargetWorkingSets < ruleSet.minimumPreferredMuscleWorkingSets
  ) {
    issues.push({ code: 'INVALID_VOLUME_TARGET', path: 'muscleVolumeTargets' });
  }

  if (
    !isPositiveInteger(ruleSet.defaultWorkingSetsPerExercise) ||
    !isPositiveInteger(ruleSet.maximumWorkingSetsPerExercise) ||
    ruleSet.defaultWorkingSetsPerExercise > ruleSet.maximumWorkingSetsPerExercise
  ) {
    issues.push({ code: 'INVALID_EXERCISE_SET_BOUNDS', path: 'exerciseSetBounds' });
  }
  if (!isPositiveInteger(ruleSet.maximumWorkingSetsPerMuscle)) {
    issues.push({
      code: 'INVALID_MUSCLE_SET_BOUND',
      path: 'maximumWorkingSetsPerMuscle',
    });
  }
  if (
    ruleSet.requiredMuscleTargetWorkingSets + ruleSet.preferredMuscleAdditionalWorkingSets >
      ruleSet.maximumWorkingSetsPerMuscle ||
    ruleSet.preferredMuscleTargetWorkingSets + ruleSet.preferredMuscleAdditionalWorkingSets >
      ruleSet.maximumWorkingSetsPerMuscle
  ) {
    issues.push({ code: 'INVALID_MUSCLE_SET_BOUND', path: 'muscleVolumeTargets' });
  }
  if (!isPositiveInteger(ruleSet.maximumSelectedExercises)) {
    issues.push({ code: 'INVALID_SELECTION_BOUND', path: 'maximumSelectedExercises' });
  }
  if (
    !isNonNegativeInteger(ruleSet.minimumDistinctExerciseFamilies) ||
    ruleSet.minimumDistinctExerciseFamilies > ruleSet.maximumSelectedExercises
  ) {
    issues.push({
      code: 'INVALID_DIVERSITY_BOUND',
      path: 'minimumDistinctExerciseFamilies',
    });
  }
  if (
    !isContributionWeight(ruleSet.primarySetContribution) ||
    !isContributionWeight(ruleSet.secondarySetContribution) ||
    ruleSet.primarySetContribution <= ruleSet.secondarySetContribution
  ) {
    issues.push({ code: 'INVALID_CONTRIBUTION_WEIGHT', path: 'setContributions' });
  }

  return issues;
}

export function allocateAndSelectWorkoutExercises(
  input: WorkoutEngineInput,
  scoringRuleSet: WorkoutCandidateScoringRuleSet,
  allocationRuleSet: WorkoutAllocationRuleSet,
): WorkoutAllocationResult {
  if (!validateWorkoutEngineInput(input).ok) {
    return allocationFailure('INVALID_INPUT', input, allocationRuleSet, ['invalid_engine_input']);
  }
  if (!validateWorkoutCandidateScoringRuleSet(scoringRuleSet, input.version.ruleSetVersion).ok) {
    return allocationFailure('INVALID_SCORING_CONFIGURATION', input, allocationRuleSet, [
      'invalid_scoring_rule_set',
    ]);
  }

  const allocationIssues = validateWorkoutAllocationRuleSet(
    allocationRuleSet,
    input.version.ruleSetVersion,
  );
  if (allocationIssues.length > 0) {
    return allocationFailure(
      'INVALID_ALLOCATION_CONFIGURATION',
      input,
      allocationRuleSet,
      allocationIssues.map(({ code }) => code.toLocaleLowerCase('en-US')),
    );
  }

  const scoringResult = rankWorkoutCandidates(input, scoringRuleSet);
  if (!scoringResult.ok) {
    return allocationFailure('INVALID_SCORING_CONFIGURATION', input, allocationRuleSet, [
      'scoring_pipeline_failed',
    ]);
  }

  const targetResult = buildMuscleTargets(input, allocationRuleSet);
  if (targetResult.failure !== undefined) {
    return allocationFailure(
      'IMPOSSIBLE_VOLUME_CONSTRAINTS',
      input,
      allocationRuleSet,
      ['incompatible_muscle_volume_bounds'],
      targetResult.failure,
    );
  }

  const targets = targetResult.targets;
  const hardMaximums = buildHardMaximums(input, allocationRuleSet, targets);
  const selected = new Map<ExerciseId, MutableSelectedExercise>();
  const familyIds = new Set<ExerciseFamilyId>();
  const weightedVolumes = new Map<MuscleId, number>();

  while (
    hasUnmetTargets(targets, weightedVolumes) ||
    familyIds.size < allocationRuleSet.minimumDistinctExerciseFamilies
  ) {
    const target = selectNextTarget(
      targets,
      weightedVolumes,
      scoringResult.value.rankedCandidates,
      familyIds,
      allocationRuleSet.minimumDistinctExerciseFamilies,
    );
    if (target === undefined) {
      break;
    }

    const choice = chooseCandidate(
      target,
      scoringResult.value.rankedCandidates,
      selected,
      familyIds,
      weightedVolumes,
      hardMaximums,
      allocationRuleSet,
    );
    if (choice === undefined) {
      break;
    }

    const existing = selected.get(choice.scored.candidate.exerciseId);
    if (existing === undefined) {
      const reusedFamily = familyIds.has(choice.scored.candidate.exerciseFamilyId);
      selected.set(choice.scored.candidate.exerciseId, {
        scored: choice.scored,
        workingSets: choice.sets,
        reasonCodes: new Set<WorkoutSelectionReasonCode>([
          'TARGET_VOLUME_COVERAGE',
          ...(choice.scored.rank === 1 ? (['HIGH_RANKED_CANDIDATE'] as const) : []),
          ...(familyIds.size > 0 && !reusedFamily ? (['FAMILY_DIVERSITY'] as const) : []),
          ...(reusedFamily ? (['FAMILY_REUSE_REQUIRED'] as const) : []),
        ]),
      });
      familyIds.add(choice.scored.candidate.exerciseFamilyId);
    } else {
      existing.workingSets += choice.sets;
    }
    addCandidateVolume(weightedVolumes, choice.scored.candidate, choice.sets, allocationRuleSet);
  }

  const insufficientMuscles = targets
    .filter(
      ({ muscleId, minimumWorkingSets }) =>
        (weightedVolumes.get(muscleId) ?? 0) + Number.EPSILON < minimumWorkingSets,
    )
    .map(({ muscleId }) => muscleId);
  if (insufficientMuscles.length > 0) {
    return allocationFailure(
      'INSUFFICIENT_TARGET_COVERAGE',
      input,
      allocationRuleSet,
      ['required_muscle_coverage_unmet'],
      insufficientMuscles,
    );
  }

  if (familyIds.size < allocationRuleSet.minimumDistinctExerciseFamilies) {
    return allocationFailure('NO_VIABLE_DIVERSE_SELECTION', input, allocationRuleSet, [
      'minimum_distinct_families_unmet',
    ]);
  }

  const selectedExercises = [...selected.values()]
    .sort(
      (left, right) =>
        left.scored.rank - right.scored.rank ||
        left.scored.candidate.exerciseId.localeCompare(right.scored.candidate.exerciseId),
    )
    .map<SelectedWorkoutExercise>((selection, index) => ({
      position: index + 1,
      exerciseId: selection.scored.candidate.exerciseId,
      exerciseFamilyId: selection.scored.candidate.exerciseFamilyId,
      plannedWorkingSets: selection.workingSets,
      scoreRank: selection.scored.rank,
      score: selection.scored.finalScore,
      reasonCodes: workoutSelectionReasonCodes.filter((code) => selection.reasonCodes.has(code)),
    }));

  return {
    status: 'success',
    inputContractVersion: input.contractVersion,
    allocationContractVersion: allocationRuleSet.contractVersion,
    engineVersion: input.version,
    allocationRuleSetVersion: allocationRuleSet.ruleSetVersion,
    selectedExercises,
    muscleVolumeSummary: targets.map((target) => ({
      ...target,
      weightedWorkingSetContribution: weightedVolumes.get(target.muscleId) ?? 0,
    })),
    scoring: scoringResult.value,
  };
}

function buildMuscleTargets(
  input: WorkoutEngineInput,
  ruleSet: WorkoutAllocationRuleSet,
): { readonly targets: readonly MuscleAllocationTarget[]; readonly failure?: readonly MuscleId[] } {
  const preferredMuscles = new Set(
    input.constraints.flatMap((constraint) =>
      constraint.kind === 'preferred_muscles' ? constraint.muscleIds : [],
    ),
  );
  const limits = new Map<MuscleId, { minimums: number[]; maximums: number[] }>();

  input.constraints.forEach((constraint) => {
    if (constraint.kind !== 'muscle_volume_limit') {
      return;
    }
    const current = limits.get(constraint.muscleId) ?? { minimums: [], maximums: [] };
    if (constraint.minimumWorkingSets !== undefined) {
      current.minimums.push(constraint.minimumWorkingSets);
    }
    current.maximums.push(constraint.maximumWorkingSets);
    limits.set(constraint.muscleId, current);
  });

  const targetMuscleIds = new Set(input.targetMuscles.map(({ muscleId }) => muscleId));
  const nonTargetMinimums = [...limits.entries()]
    .filter(
      ([muscleId, bounds]) =>
        !targetMuscleIds.has(muscleId) && bounds.minimums.some((minimum) => minimum > 0),
    )
    .map(([muscleId]) => muscleId);
  if (nonTargetMinimums.length > 0) {
    return { targets: [], failure: nonTargetMinimums.sort() };
  }

  const targets = [...input.targetMuscles]
    .sort((left, right) => left.muscleId.localeCompare(right.muscleId))
    .map<MuscleAllocationTarget>((target) => {
      const explicit = limits.get(target.muscleId);
      const configuredMinimum =
        target.priority === 'required'
          ? ruleSet.minimumRequiredMuscleWorkingSets
          : ruleSet.minimumPreferredMuscleWorkingSets;
      const minimumWorkingSets = Math.max(configuredMinimum, ...(explicit?.minimums ?? [0]));
      const maximumWorkingSets = Math.min(
        ruleSet.maximumWorkingSetsPerMuscle,
        ...(explicit?.maximums ?? [ruleSet.maximumWorkingSetsPerMuscle]),
      );
      const configuredTarget =
        (target.priority === 'required'
          ? ruleSet.requiredMuscleTargetWorkingSets
          : ruleSet.preferredMuscleTargetWorkingSets) +
        (preferredMuscles.has(target.muscleId) ? ruleSet.preferredMuscleAdditionalWorkingSets : 0);

      return {
        muscleId: target.muscleId,
        minimumWorkingSets,
        maximumWorkingSets,
        targetWorkingSets: Math.min(
          Math.max(configuredTarget, minimumWorkingSets),
          maximumWorkingSets,
        ),
      };
    });
  const impossible = targets
    .filter(({ minimumWorkingSets, maximumWorkingSets }) => minimumWorkingSets > maximumWorkingSets)
    .map(({ muscleId }) => muscleId);

  return impossible.length > 0 ? { targets, failure: impossible } : { targets };
}

function buildHardMaximums(
  input: WorkoutEngineInput,
  ruleSet: WorkoutAllocationRuleSet,
  targets: readonly MuscleAllocationTarget[],
): ReadonlyMap<MuscleId, number> {
  const maximums = new Map<MuscleId, number>(
    targets.map(({ muscleId, maximumWorkingSets }) => [muscleId, maximumWorkingSets]),
  );
  input.constraints.forEach((constraint) => {
    if (constraint.kind === 'muscle_volume_limit') {
      maximums.set(
        constraint.muscleId,
        Math.min(
          maximums.get(constraint.muscleId) ?? ruleSet.maximumWorkingSetsPerMuscle,
          constraint.maximumWorkingSets,
        ),
      );
    }
  });
  return maximums;
}

function selectNextTarget(
  targets: readonly MuscleAllocationTarget[],
  volumes: ReadonlyMap<MuscleId, number>,
  candidates: readonly ScoredWorkoutCandidate[],
  selectedFamilies: ReadonlySet<ExerciseFamilyId>,
  minimumDistinctFamilies: number,
): MuscleAllocationTarget | undefined {
  const unmet = targets
    .filter(
      ({ muscleId, targetWorkingSets }) =>
        (volumes.get(muscleId) ?? 0) + Number.EPSILON < targetWorkingSets,
    )
    .sort((left, right) => {
      const leftRatio =
        (left.targetWorkingSets - (volumes.get(left.muscleId) ?? 0)) / left.targetWorkingSets;
      const rightRatio =
        (right.targetWorkingSets - (volumes.get(right.muscleId) ?? 0)) / right.targetWorkingSets;
      return rightRatio - leftRatio || left.muscleId.localeCompare(right.muscleId);
    });
  if (unmet[0] !== undefined) {
    return unmet[0];
  }

  if (selectedFamilies.size >= minimumDistinctFamilies) {
    return undefined;
  }
  return targets.find((target) =>
    candidates.some(
      ({ candidate }) =>
        !selectedFamilies.has(candidate.exerciseFamilyId) &&
        calculateExerciseMuscleSetContribution(candidate, target.muscleId, {
          primarySetContribution: 1,
          secondarySetContribution: 1,
        }) > 0,
    ),
  );
}

function chooseCandidate(
  target: MuscleAllocationTarget,
  rankedCandidates: readonly ScoredWorkoutCandidate[],
  selected: ReadonlyMap<ExerciseId, MutableSelectedExercise>,
  selectedFamilies: ReadonlySet<ExerciseFamilyId>,
  volumes: ReadonlyMap<MuscleId, number>,
  hardMaximums: ReadonlyMap<MuscleId, number>,
  ruleSet: WorkoutAllocationRuleSet,
): { readonly scored: ScoredWorkoutCandidate; readonly sets: number } | undefined {
  const candidates = rankedCandidates
    .filter(
      ({ candidate }) =>
        calculateExerciseMuscleSetContribution(candidate, target.muscleId, ruleSet) > 0,
    )
    .filter(({ candidate }) => {
      const existing = selected.get(candidate.exerciseId);
      return (
        (existing !== undefined || selected.size < ruleSet.maximumSelectedExercises) &&
        (existing?.workingSets ?? 0) < ruleSet.maximumWorkingSetsPerExercise
      );
    })
    .sort((left, right) => {
      const leftGroup = diversityGroup(left, selected, selectedFamilies);
      const rightGroup = diversityGroup(right, selected, selectedFamilies);
      return leftGroup - rightGroup || left.rank - right.rank;
    });

  for (const scored of candidates) {
    const existingSets = selected.get(scored.candidate.exerciseId)?.workingSets ?? 0;
    const remainingExerciseSets = ruleSet.maximumWorkingSetsPerExercise - existingSets;
    const targetContribution = calculateExerciseMuscleSetContribution(
      scored.candidate,
      target.muscleId,
      ruleSet,
    );
    const targetDeficit = Math.max(
      target.targetWorkingSets - (volumes.get(target.muscleId) ?? 0),
      targetContribution,
    );
    let requestedSets = Math.min(
      ruleSet.defaultWorkingSetsPerExercise,
      remainingExerciseSets,
      Math.max(1, Math.ceil(targetDeficit / targetContribution)),
    );

    if (
      !selectedFamilies.has(scored.candidate.exerciseFamilyId) &&
      selectedFamilies.size < ruleSet.minimumDistinctExerciseFamilies - 1
    ) {
      const remainingFamilies = ruleSet.minimumDistinctExerciseFamilies - selectedFamilies.size;
      requestedSets = Math.min(
        requestedSets,
        Math.max(1, Math.floor(targetDeficit / targetContribution / remainingFamilies)),
      );
    }

    for (let sets = requestedSets; sets >= 1; sets -= 1) {
      if (respectsHardMaximums(scored.candidate, sets, volumes, hardMaximums, ruleSet)) {
        return { scored, sets };
      }
    }
  }
  return undefined;
}

function diversityGroup(
  scored: ScoredWorkoutCandidate,
  selected: ReadonlyMap<ExerciseId, MutableSelectedExercise>,
  selectedFamilies: ReadonlySet<ExerciseFamilyId>,
): number {
  if (!selectedFamilies.has(scored.candidate.exerciseFamilyId)) {
    return 0;
  }
  if (selected.has(scored.candidate.exerciseId)) {
    return 1;
  }
  return 2;
}

function respectsHardMaximums(
  candidate: WorkoutExerciseCandidate,
  sets: number,
  volumes: ReadonlyMap<MuscleId, number>,
  maximums: ReadonlyMap<MuscleId, number>,
  ruleSet: Pick<WorkoutAllocationRuleSet, 'primarySetContribution' | 'secondarySetContribution'>,
): boolean {
  return [...maximums.entries()].every(([muscleId, maximum]) => {
    const added = calculateExerciseMuscleSetContribution(candidate, muscleId, ruleSet) * sets;
    return (volumes.get(muscleId) ?? 0) + added <= maximum + Number.EPSILON;
  });
}

function addCandidateVolume(
  volumes: Map<MuscleId, number>,
  candidate: WorkoutExerciseCandidate,
  sets: number,
  ruleSet: Pick<WorkoutAllocationRuleSet, 'primarySetContribution' | 'secondarySetContribution'>,
): void {
  candidate.muscleContributions.forEach(({ muscleId }) => {
    const added = calculateExerciseMuscleSetContribution(candidate, muscleId, ruleSet) * sets;
    if (added > 0) {
      volumes.set(muscleId, (volumes.get(muscleId) ?? 0) + added);
    }
  });
}

export function calculateExerciseMuscleSetContribution(
  candidate: WorkoutExerciseCandidate,
  muscleId: MuscleId,
  ruleSet: Pick<WorkoutAllocationRuleSet, 'primarySetContribution' | 'secondarySetContribution'>,
): number {
  const contribution = candidate.muscleContributions.find(
    (candidateMuscle) => candidateMuscle.muscleId === muscleId,
  );
  if (contribution === undefined || contribution.role === 'stabilizer') {
    return 0;
  }
  const roleWeight =
    contribution.role === 'primary'
      ? ruleSet.primarySetContribution
      : ruleSet.secondarySetContribution;
  return contribution.contribution * roleWeight;
}

function hasUnmetTargets(
  targets: readonly MuscleAllocationTarget[],
  volumes: ReadonlyMap<MuscleId, number>,
): boolean {
  return targets.some(
    ({ muscleId, targetWorkingSets }) =>
      (volumes.get(muscleId) ?? 0) + Number.EPSILON < targetWorkingSets,
  );
}

function allocationFailure(
  code: WorkoutAllocationFailureCode,
  input: WorkoutEngineInput,
  ruleSet: WorkoutAllocationRuleSet,
  reasonCodes: readonly string[],
  relatedMuscleIds: readonly MuscleId[] = [],
): WorkoutAllocationFailure {
  return {
    status: 'failure',
    code,
    reasonCodes,
    relatedMuscleIds: [...relatedMuscleIds].sort(),
    inputContractVersion: input.contractVersion,
    allocationContractVersion: ruleSet.contractVersion,
    engineVersion: input.version,
    allocationRuleSetVersion: ruleSet.ruleSetVersion,
  };
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function isContributionWeight(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
