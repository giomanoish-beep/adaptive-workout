import {
  parseVersionIdentifier,
  type ContractVersion,
  type ExerciseId,
  type MuscleId,
  type RuleSetVersion,
} from '@adaptive-workout/domain';
import {
  allocateAndSelectWorkoutExercises,
  calculateExerciseMuscleSetContribution,
  type AllocatedMuscleVolumeSummary,
  type SelectedWorkoutExercise,
  type WorkoutAllocationFailureCode,
  type WorkoutAllocationRuleSet,
  type WorkoutAllocationSuccess,
} from './allocation.js';
import type { WorkoutEngineInput, WorkoutExerciseCandidate } from './contracts.js';
import type { WorkoutCandidateScoringRuleSet } from './scoring.js';
import type { TrainingGoalRuleProfile } from './training-goal-rules.js';

export interface WorkoutDurationRuleSet {
  readonly contractVersion: ContractVersion;
  readonly ruleSetVersion: RuleSetVersion;
  readonly defaultSetExecutionSeconds: number;
  readonly defaultRestSecondsBetweenSets: number;
  readonly defaultExerciseSetupSeconds: number;
  readonly transitionSecondsBetweenExercises: number;
  readonly minimumWorkingSetsPerExercise: number;
  readonly targetDurationUtilization: number;
  readonly minimumExpansionBudgetSeconds: number;
  readonly preferredVolumeExpansionMultiplier: number;
}

/**
 * Baseline training-goal multipliers. The engine owns this baseline so it
 * stays decoupled from web onboarding types. The default profile in
 * `training-goal-rules.ts` mirrors these values, so normalizing a resolved
 * goal profile against this baseline yields 1.0 for both `undefined` and the
 * default profile — preserving existing behavior exactly.
 */
const DEFAULT_GOAL_MULTIPLIERS = {
  volumeMultiplier: 1.6,
  diversityTendency: 1.0,
  expansionAggressiveness: 1.0,
} as const;

/**
 * Derives normalized, baseline-relative multipliers from an optional training
 * goal profile. Returns identity (1.0) multipliers when no profile is supplied
 * or when the profile matches the default baseline, so callers without a goal
 * observe unchanged engine output.
 */
function resolveGoalMultipliers(goalProfile: TrainingGoalRuleProfile | undefined): {
  readonly volumeFactor: number;
  readonly expansionFactor: number;
  readonly diversityFactor: number;
} {
  if (goalProfile === undefined) {
    return { volumeFactor: 1, expansionFactor: 1, diversityFactor: 1 };
  }
  return {
    volumeFactor: goalProfile.volumeMultiplier / DEFAULT_GOAL_MULTIPLIERS.volumeMultiplier,
    expansionFactor:
      goalProfile.expansionAggressiveness / DEFAULT_GOAL_MULTIPLIERS.expansionAggressiveness,
    diversityFactor: goalProfile.diversityTendency / DEFAULT_GOAL_MULTIPLIERS.diversityTendency,
  };
}

export const workoutDurationValidationCodes = [
  'INVALID_DURATION_CONTRACT_VERSION',
  'INVALID_DURATION_RULE_SET_VERSION',
  'RULE_SET_VERSION_MISMATCH',
  'INVALID_SET_EXECUTION_TIME',
  'INVALID_REST_TIME',
  'INVALID_SETUP_TIME',
  'INVALID_TRANSITION_TIME',
  'INVALID_MINIMUM_WORKING_SETS',
  'INVALID_UTILIZATION_TARGET',
  'INVALID_EXPANSION_BUDGET',
  'INVALID_EXPANSION_VOLUME_MULTIPLIER',
] as const;

export type WorkoutDurationValidationCode = (typeof workoutDurationValidationCodes)[number];

export interface WorkoutDurationValidationIssue {
  readonly code: WorkoutDurationValidationCode;
  readonly path: string;
}

export const workoutDurationDecisionCodes = [
  'REMOVED_SUBMINIMUM_EXERCISE',
  'REALLOCATED_SUBMINIMUM_SETS',
  'REDUCED_VOLUME_ABOVE_TARGET',
  'REDUCED_OPTIONAL_VOLUME',
  'REMOVED_LOWER_PRIORITY_EXERCISE',
  'ADDED_WORKING_SET_FOR_DURATION_BUDGET',
  'ADDED_EXERCISE_FOR_DURATION_BUDGET',
] as const;

export type WorkoutDurationDecisionCode = (typeof workoutDurationDecisionCodes)[number];

export interface WorkoutDurationDecision {
  readonly code: WorkoutDurationDecisionCode;
  readonly exerciseId: ExerciseId;
  readonly previousWorkingSets: number;
  readonly resultingWorkingSets: number;
  readonly recipientExerciseId?: ExerciseId;
}

export interface FittedWorkoutExercise extends SelectedWorkoutExercise {
  readonly estimatedDurationSeconds: number;
  readonly restSecondsBetweenSets: number;
}

export interface WorkoutDurationBreakdown {
  readonly setupSeconds: number;
  readonly setExecutionSeconds: number;
  readonly restSeconds: number;
  readonly transitionSeconds: number;
  readonly totalSeconds: number;
  readonly totalMinutes: number;
}

export interface WorkoutDurationExerciseInput {
  readonly exerciseId: ExerciseId;
  readonly workingSets: number;
  readonly restSecondsBetweenSets?: number;
}

export interface DurationFittedWorkoutSuccess {
  readonly status: 'success';
  readonly inputContractVersion: ContractVersion;
  readonly durationContractVersion: ContractVersion;
  readonly engineVersion: WorkoutEngineInput['version'];
  readonly durationRuleSetVersion: RuleSetVersion;
  readonly maximumDurationMinutes: number;
  readonly exercises: readonly FittedWorkoutExercise[];
  readonly muscleVolumeSummary: readonly AllocatedMuscleVolumeSummary[];
  readonly estimatedDuration: WorkoutDurationBreakdown;
  readonly decisions: readonly WorkoutDurationDecision[];
  readonly allocation: WorkoutAllocationSuccess;
}

export const durationFittingFailureCodes = [
  'ALLOCATION_FAILED',
  'INVALID_DURATION_CONFIGURATION',
  'MINIMUM_SET_PRESCRIPTION_IMPOSSIBLE',
  'DURATION_CONSTRAINT_IMPOSSIBLE',
] as const;

export type DurationFittingFailureCode = (typeof durationFittingFailureCodes)[number];

export interface DurationFittingFailure {
  readonly status: 'failure';
  readonly code: DurationFittingFailureCode;
  readonly reasonCodes: readonly string[];
  readonly allocationFailureCode?: WorkoutAllocationFailureCode;
  readonly relatedExerciseIds: readonly ExerciseId[];
  readonly relatedMuscleIds: readonly MuscleId[];
  readonly inputContractVersion: ContractVersion;
  readonly durationContractVersion: ContractVersion;
  readonly engineVersion: WorkoutEngineInput['version'];
  readonly durationRuleSetVersion: RuleSetVersion;
}

export type DurationFittedWorkoutResult = DurationFittedWorkoutSuccess | DurationFittingFailure;

interface MutableFittedExercise {
  readonly selected: SelectedWorkoutExercise;
  workingSets: number;
}

interface ReductionOption {
  readonly stage: 0 | 1 | 2;
  readonly exerciseId: ExerciseId;
  readonly resultingExercises: readonly MutableFittedExercise[];
  readonly decisionCode: WorkoutDurationDecisionCode;
  readonly imbalance: number;
  readonly scoreRank: number;
}

export function validateWorkoutDurationRuleSet(
  ruleSet: WorkoutDurationRuleSet,
  expectedRuleSetVersion?: RuleSetVersion,
): readonly WorkoutDurationValidationIssue[] {
  const issues: WorkoutDurationValidationIssue[] = [];

  if (!parseVersionIdentifier(ruleSet.contractVersion, 'contract').ok) {
    issues.push({ code: 'INVALID_DURATION_CONTRACT_VERSION', path: 'contractVersion' });
  }
  if (!parseVersionIdentifier(ruleSet.ruleSetVersion, 'rule-set').ok) {
    issues.push({ code: 'INVALID_DURATION_RULE_SET_VERSION', path: 'ruleSetVersion' });
  }
  if (expectedRuleSetVersion !== undefined && ruleSet.ruleSetVersion !== expectedRuleSetVersion) {
    issues.push({ code: 'RULE_SET_VERSION_MISMATCH', path: 'ruleSetVersion' });
  }
  if (!isPositiveInteger(ruleSet.defaultSetExecutionSeconds)) {
    issues.push({ code: 'INVALID_SET_EXECUTION_TIME', path: 'defaultSetExecutionSeconds' });
  }
  if (!isNonNegativeInteger(ruleSet.defaultRestSecondsBetweenSets)) {
    issues.push({ code: 'INVALID_REST_TIME', path: 'defaultRestSecondsBetweenSets' });
  }
  if (!isNonNegativeInteger(ruleSet.defaultExerciseSetupSeconds)) {
    issues.push({ code: 'INVALID_SETUP_TIME', path: 'defaultExerciseSetupSeconds' });
  }
  if (!isNonNegativeInteger(ruleSet.transitionSecondsBetweenExercises)) {
    issues.push({
      code: 'INVALID_TRANSITION_TIME',
      path: 'transitionSecondsBetweenExercises',
    });
  }
  if (
    !Number.isInteger(ruleSet.minimumWorkingSetsPerExercise) ||
    ruleSet.minimumWorkingSetsPerExercise < 2
  ) {
    issues.push({
      code: 'INVALID_MINIMUM_WORKING_SETS',
      path: 'minimumWorkingSetsPerExercise',
    });
  }
  if (
    !Number.isFinite(ruleSet.targetDurationUtilization) ||
    ruleSet.targetDurationUtilization <= 0 ||
    ruleSet.targetDurationUtilization > 1
  ) {
    issues.push({ code: 'INVALID_UTILIZATION_TARGET', path: 'targetDurationUtilization' });
  }
  if (!isNonNegativeInteger(ruleSet.minimumExpansionBudgetSeconds)) {
    issues.push({
      code: 'INVALID_EXPANSION_BUDGET',
      path: 'minimumExpansionBudgetSeconds',
    });
  }
  if (
    !Number.isFinite(ruleSet.preferredVolumeExpansionMultiplier) ||
    ruleSet.preferredVolumeExpansionMultiplier < 1
  ) {
    issues.push({
      code: 'INVALID_EXPANSION_VOLUME_MULTIPLIER',
      path: 'preferredVolumeExpansionMultiplier',
    });
  }

  return issues;
}

export function constructDurationFittedWorkout(
  input: WorkoutEngineInput,
  scoringRuleSet: WorkoutCandidateScoringRuleSet,
  allocationRuleSet: WorkoutAllocationRuleSet,
  durationRuleSet: WorkoutDurationRuleSet,
  goalProfile?: TrainingGoalRuleProfile,
): DurationFittedWorkoutResult {
  const durationIssues = validateWorkoutDurationRuleSet(
    durationRuleSet,
    input.version.ruleSetVersion,
  );
  if (durationIssues.length > 0) {
    return durationFailure('INVALID_DURATION_CONFIGURATION', input, durationRuleSet, {
      reasonCodes: durationIssues.map(({ code }) => code.toLocaleLowerCase('en-US')),
    });
  }

  // Apply training-goal influence as baseline-relative multipliers. When no
  // profile is supplied (or it matches the default baseline) these are 1.0 and
  // the effective rule set is identical to the supplied one.
  const goalMultipliers = resolveGoalMultipliers(goalProfile);
  const effectiveDurationRuleSet: WorkoutDurationRuleSet = {
    ...durationRuleSet,
    targetDurationUtilization: clamp(
      durationRuleSet.targetDurationUtilization * goalMultipliers.expansionFactor,
      0,
      durationRuleSet.targetDurationUtilization,
    ),
    preferredVolumeExpansionMultiplier:
      durationRuleSet.preferredVolumeExpansionMultiplier * goalMultipliers.volumeFactor,
  };

  const allocation = allocateAndSelectWorkoutExercises(input, scoringRuleSet, allocationRuleSet);
  if (allocation.status === 'failure') {
    return durationFailure('ALLOCATION_FAILED', input, durationRuleSet, {
      reasonCodes: allocation.reasonCodes,
      allocationFailureCode: allocation.code,
      relatedMuscleIds: allocation.relatedMuscleIds,
    });
  }

  const candidates = new Map(
    input.exerciseCatalog.map((candidate) => [candidate.exerciseId, candidate]),
  );
  const decisions: WorkoutDurationDecision[] = [];
  let exercises: MutableFittedExercise[] = allocation.selectedExercises.map((selected) => ({
    selected,
    workingSets: selected.plannedWorkingSets,
  }));

  const normalized = enforceMinimumWorkingSets(
    exercises,
    allocation,
    candidates,
    input,
    allocationRuleSet,
    durationRuleSet,
  );
  if (normalized.failureExerciseIds.length > 0) {
    return durationFailure('MINIMUM_SET_PRESCRIPTION_IMPOSSIBLE', input, durationRuleSet, {
      reasonCodes: ['minimum_working_sets_cannot_be_preserved'],
      relatedExerciseIds: normalized.failureExerciseIds,
    });
  }
  exercises = [...normalized.exercises];
  decisions.push(...normalized.decisions);

  const maximumDurationMinutes = effectiveMaximumDuration(input);
  const maximumDurationSeconds = maximumDurationMinutes * 60;
  let estimate = estimateWorkoutDuration(
    durationExerciseInputs(exercises),
    candidates,
    input,
    durationRuleSet,
  );

  while (estimate.totalSeconds > maximumDurationSeconds) {
    const option = chooseReduction(
      exercises,
      allocation,
      candidates,
      input,
      allocationRuleSet,
      durationRuleSet,
    );
    if (option === undefined) {
      return durationFailure('DURATION_CONSTRAINT_IMPOSSIBLE', input, durationRuleSet, {
        reasonCodes: ['required_coverage_cannot_fit_duration'],
        relatedMuscleIds: allocation.muscleVolumeSummary.map(({ muscleId }) => muscleId),
      });
    }

    const previous = exercises.find(({ selected }) => selected.exerciseId === option.exerciseId);
    const resulting = option.resultingExercises.find(
      ({ selected }) => selected.exerciseId === option.exerciseId,
    );
    decisions.push({
      code: option.decisionCode,
      exerciseId: option.exerciseId,
      previousWorkingSets: previous?.workingSets ?? 0,
      resultingWorkingSets: resulting?.workingSets ?? 0,
    });
    exercises = [...option.resultingExercises];
    estimate = estimateWorkoutDuration(
      durationExerciseInputs(exercises),
      candidates,
      input,
      durationRuleSet,
    );
  }

  const expanded = expandToUseDurationBudget(
    exercises,
    allocation,
    candidates,
    input,
    allocationRuleSet,
    effectiveDurationRuleSet,
    maximumDurationSeconds,
    goalMultipliers.diversityFactor,
  );
  exercises = [...expanded.exercises];
  decisions.push(...expanded.decisions);
  estimate = expanded.estimate;

  const muscleVolumeSummary = recomputeVolumeSummary(
    exercises,
    allocation,
    candidates,
    allocationRuleSet,
  );
  const fittedExercises = exercises.map<FittedWorkoutExercise>((exercise, index) => {
    const candidate = requiredCandidate(candidates, exercise.selected.exerciseId);
    const restSecondsBetweenSets = exerciseRestSeconds(
      exercise.selected.exerciseId,
      input,
      durationRuleSet,
    );
    return {
      ...exercise.selected,
      position: index + 1,
      plannedWorkingSets: exercise.workingSets,
      estimatedDurationSeconds: estimateExerciseDurationSeconds(
        exercise.workingSets,
        candidate,
        restSecondsBetweenSets,
        durationRuleSet,
      ),
      restSecondsBetweenSets,
    };
  });

  return {
    status: 'success',
    inputContractVersion: input.contractVersion,
    durationContractVersion: durationRuleSet.contractVersion,
    engineVersion: input.version,
    durationRuleSetVersion: durationRuleSet.ruleSetVersion,
    maximumDurationMinutes,
    exercises: fittedExercises,
    muscleVolumeSummary,
    estimatedDuration: estimate,
    decisions,
    allocation,
  };
}

function expandToUseDurationBudget(
  initialExercises: readonly MutableFittedExercise[],
  allocation: WorkoutAllocationSuccess,
  candidates: ReadonlyMap<ExerciseId, WorkoutExerciseCandidate>,
  input: WorkoutEngineInput,
  allocationRuleSet: WorkoutAllocationRuleSet,
  durationRuleSet: WorkoutDurationRuleSet,
  maximumDurationSeconds: number,
  diversityFactor: number,
): {
  readonly exercises: readonly MutableFittedExercise[];
  readonly decisions: readonly WorkoutDurationDecision[];
  readonly estimate: WorkoutDurationBreakdown;
} {
  let exercises = cloneExercises(initialExercises);
  let estimate = estimateWorkoutDuration(
    durationExerciseInputs(exercises),
    candidates,
    input,
    durationRuleSet,
  );
  const decisions: WorkoutDurationDecision[] = [];
  const preferredMaximums = new Map(
    allocation.muscleVolumeSummary.map((summary) => [
      summary.muscleId,
      Math.min(
        summary.maximumWorkingSets,
        summary.targetWorkingSets * durationRuleSet.preferredVolumeExpansionMultiplier,
      ),
    ]),
  );

  while (
    estimate.totalSeconds / maximumDurationSeconds < durationRuleSet.targetDurationUtilization &&
    maximumDurationSeconds - estimate.totalSeconds >= durationRuleSet.minimumExpansionBudgetSeconds
  ) {
    const volumes = calculateVolumes(exercises, candidates, allocationRuleSet);
    const targetMuscles = allocation.muscleVolumeSummary
      .filter(
        ({ muscleId }) =>
          (volumes.get(muscleId) ?? 0) + Number.EPSILON < (preferredMaximums.get(muscleId) ?? 0),
      )
      .sort((left, right) => {
        const leftRatio =
          (volumes.get(left.muscleId) ?? 0) /
          Math.max(preferredMaximums.get(left.muscleId) ?? 0, Number.EPSILON);
        const rightRatio =
          (volumes.get(right.muscleId) ?? 0) /
          Math.max(preferredMaximums.get(right.muscleId) ?? 0, Number.EPSILON);
        return leftRatio - rightRatio || left.muscleId.localeCompare(right.muscleId);
      });

    let accepted = false;
    for (const target of targetMuscles) {
      const selectedCandidates = exercises
        .filter(
          (exercise) =>
            exercise.workingSets < allocationRuleSet.maximumWorkingSetsPerExercise &&
            calculateExerciseMuscleSetContribution(
              requiredCandidate(candidates, exercise.selected.exerciseId),
              target.muscleId,
              allocationRuleSet,
            ) > 0,
        )
        .sort(
          (left, right) =>
            left.selected.scoreRank - right.selected.scoreRank ||
            left.selected.exerciseId.localeCompare(right.selected.exerciseId),
        );

      for (const selectedCandidate of selectedCandidates) {
        const expandedExercises = cloneExercises(exercises);
        const expandedExercise = expandedExercises.find(
          ({ selected }) => selected.exerciseId === selectedCandidate.selected.exerciseId,
        );
        if (expandedExercise === undefined) {
          continue;
        }
        expandedExercise.workingSets += 1;
        const expandedEstimate = estimateWorkoutDuration(
          durationExerciseInputs(expandedExercises),
          candidates,
          input,
          durationRuleSet,
        );
        if (
          expandedEstimate.totalSeconds <= maximumDurationSeconds &&
          isValidVolumePlan(
            expandedExercises,
            allocation,
            candidates,
            input,
            allocationRuleSet,
            'minimum',
          ) &&
          respectsPreferredExpansionMaximums(
            expandedExercises,
            candidates,
            allocationRuleSet,
            preferredMaximums,
          )
        ) {
          decisions.push({
            code: 'ADDED_WORKING_SET_FOR_DURATION_BUDGET',
            exerciseId: expandedExercise.selected.exerciseId,
            previousWorkingSets: expandedExercise.workingSets - 1,
            resultingWorkingSets: expandedExercise.workingSets,
          });
          exercises = expandedExercises;
          estimate = expandedEstimate;
          accepted = true;
          break;
        }
      }
      if (accepted) {
        break;
      }

      const selectedExerciseIds = new Set(exercises.map(({ selected }) => selected.exerciseId));
      const selectedFamilyIds = new Set(exercises.map(({ selected }) => selected.exerciseFamilyId));
      // New-family expansion is gated by the training goal's diversity tendency.
      // Goals with below-baseline diversity (e.g. gain_strength) skip adding
      // brand-new exercises during budget expansion, keeping the selection
      // focused on fewer movement families.
      const expansionCandidates =
        diversityFactor >= 1
          ? allocation.scoring.rankedCandidates.filter(
              ({ candidate }) =>
                !selectedExerciseIds.has(candidate.exerciseId) &&
                !selectedFamilyIds.has(candidate.exerciseFamilyId) &&
                calculateExerciseMuscleSetContribution(candidate, target.muscleId, allocationRuleSet) >
                  0,
            )
          : [];

      for (const scored of expansionCandidates) {
        const newSelection: SelectedWorkoutExercise = {
          position: exercises.length + 1,
          exerciseId: scored.candidate.exerciseId,
          exerciseFamilyId: scored.candidate.exerciseFamilyId,
          plannedWorkingSets: durationRuleSet.minimumWorkingSetsPerExercise,
          scoreRank: scored.rank,
          score: scored.finalScore,
          reasonCodes: ['TARGET_VOLUME_COVERAGE', 'FAMILY_DIVERSITY'],
        };
        const expandedExercises = [
          ...cloneExercises(exercises),
          {
            selected: newSelection,
            workingSets: durationRuleSet.minimumWorkingSetsPerExercise,
          },
        ];
        const expandedEstimate = estimateWorkoutDuration(
          durationExerciseInputs(expandedExercises),
          candidates,
          input,
          durationRuleSet,
        );
        if (
          expandedEstimate.totalSeconds <= maximumDurationSeconds &&
          isValidVolumePlan(
            expandedExercises,
            allocation,
            candidates,
            input,
            allocationRuleSet,
            'minimum',
          ) &&
          respectsPreferredExpansionMaximums(
            expandedExercises,
            candidates,
            allocationRuleSet,
            preferredMaximums,
          )
        ) {
          decisions.push({
            code: 'ADDED_EXERCISE_FOR_DURATION_BUDGET',
            exerciseId: scored.candidate.exerciseId,
            previousWorkingSets: 0,
            resultingWorkingSets: durationRuleSet.minimumWorkingSetsPerExercise,
          });
          exercises = expandedExercises;
          estimate = expandedEstimate;
          accepted = true;
          break;
        }
      }
      if (accepted) {
        break;
      }
    }

    if (!accepted) {
      break;
    }
  }

  return { exercises, decisions, estimate };
}

function respectsPreferredExpansionMaximums(
  exercises: readonly MutableFittedExercise[],
  candidates: ReadonlyMap<ExerciseId, WorkoutExerciseCandidate>,
  allocationRuleSet: WorkoutAllocationRuleSet,
  preferredMaximums: ReadonlyMap<MuscleId, number>,
): boolean {
  const volumes = calculateVolumes(exercises, candidates, allocationRuleSet);
  return [...preferredMaximums.entries()].every(
    ([muscleId, maximum]) => (volumes.get(muscleId) ?? 0) <= maximum + Number.EPSILON,
  );
}

function enforceMinimumWorkingSets(
  initialExercises: readonly MutableFittedExercise[],
  allocation: WorkoutAllocationSuccess,
  candidates: ReadonlyMap<ExerciseId, WorkoutExerciseCandidate>,
  input: WorkoutEngineInput,
  allocationRuleSet: WorkoutAllocationRuleSet,
  durationRuleSet: WorkoutDurationRuleSet,
): {
  readonly exercises: readonly MutableFittedExercise[];
  readonly decisions: readonly WorkoutDurationDecision[];
  readonly failureExerciseIds: readonly ExerciseId[];
} {
  let exercises = cloneExercises(initialExercises);
  const decisions: WorkoutDurationDecision[] = [];

  for (const exercise of [...exercises]) {
    if (exercise.workingSets >= durationRuleSet.minimumWorkingSetsPerExercise) {
      continue;
    }

    const withoutExercise = exercises.filter(
      ({ selected }) => selected.exerciseId !== exercise.selected.exerciseId,
    );
    if (
      isValidVolumePlan(
        withoutExercise,
        allocation,
        candidates,
        input,
        allocationRuleSet,
        'minimum',
      )
    ) {
      exercises = withoutExercise;
      decisions.push({
        code: 'REMOVED_SUBMINIMUM_EXERCISE',
        exerciseId: exercise.selected.exerciseId,
        previousWorkingSets: exercise.workingSets,
        resultingWorkingSets: 0,
      });
      continue;
    }

    const recipients = withoutExercise
      .filter(
        (recipient) =>
          recipient.workingSets + exercise.workingSets <=
          allocationRuleSet.maximumWorkingSetsPerExercise,
      )
      .sort(
        (left, right) =>
          left.selected.scoreRank - right.selected.scoreRank ||
          left.selected.exerciseId.localeCompare(right.selected.exerciseId),
      );
    const recipient = recipients.find((possibleRecipient) => {
      const transferred = cloneExercises(withoutExercise);
      const mutableRecipient = transferred.find(
        ({ selected }) => selected.exerciseId === possibleRecipient.selected.exerciseId,
      );
      if (mutableRecipient === undefined) {
        return false;
      }
      mutableRecipient.workingSets += exercise.workingSets;
      return isValidVolumePlan(
        transferred,
        allocation,
        candidates,
        input,
        allocationRuleSet,
        'minimum',
      );
    });

    if (recipient === undefined) {
      return {
        exercises,
        decisions,
        failureExerciseIds: [exercise.selected.exerciseId],
      };
    }

    exercises = cloneExercises(withoutExercise);
    const mutableRecipient = exercises.find(
      ({ selected }) => selected.exerciseId === recipient.selected.exerciseId,
    );
    if (mutableRecipient !== undefined) {
      mutableRecipient.workingSets += exercise.workingSets;
    }
    decisions.push({
      code: 'REALLOCATED_SUBMINIMUM_SETS',
      exerciseId: exercise.selected.exerciseId,
      previousWorkingSets: exercise.workingSets,
      resultingWorkingSets: 0,
      recipientExerciseId: recipient.selected.exerciseId,
    });
  }

  return { exercises, decisions, failureExerciseIds: [] };
}

function chooseReduction(
  exercises: readonly MutableFittedExercise[],
  allocation: WorkoutAllocationSuccess,
  candidates: ReadonlyMap<ExerciseId, WorkoutExerciseCandidate>,
  input: WorkoutEngineInput,
  allocationRuleSet: WorkoutAllocationRuleSet,
  durationRuleSet: WorkoutDurationRuleSet,
): ReductionOption | undefined {
  const options: ReductionOption[] = [];

  exercises.forEach((exercise) => {
    if (exercise.workingSets > durationRuleSet.minimumWorkingSetsPerExercise) {
      const reduced = cloneExercises(exercises);
      const mutable = reduced.find(
        ({ selected }) => selected.exerciseId === exercise.selected.exerciseId,
      );
      if (mutable !== undefined) {
        mutable.workingSets -= 1;
      }

      if (isValidVolumePlan(reduced, allocation, candidates, input, allocationRuleSet, 'target')) {
        options.push(
          reductionOption(
            0,
            exercise,
            reduced,
            'REDUCED_VOLUME_ABOVE_TARGET',
            allocation,
            candidates,
            allocationRuleSet,
          ),
        );
      } else if (
        isValidVolumePlan(reduced, allocation, candidates, input, allocationRuleSet, 'minimum')
      ) {
        options.push(
          reductionOption(
            1,
            exercise,
            reduced,
            'REDUCED_OPTIONAL_VOLUME',
            allocation,
            candidates,
            allocationRuleSet,
          ),
        );
      }
    }

    if (exercises.length > 1) {
      const removed = exercises.filter(
        ({ selected }) => selected.exerciseId !== exercise.selected.exerciseId,
      );
      if (isValidVolumePlan(removed, allocation, candidates, input, allocationRuleSet, 'minimum')) {
        options.push(
          reductionOption(
            2,
            exercise,
            removed,
            'REMOVED_LOWER_PRIORITY_EXERCISE',
            allocation,
            candidates,
            allocationRuleSet,
          ),
        );
      }
    }
  });

  return options.sort(
    (left, right) =>
      left.stage - right.stage ||
      left.imbalance - right.imbalance ||
      right.scoreRank - left.scoreRank ||
      left.exerciseId.localeCompare(right.exerciseId),
  )[0];
}

function reductionOption(
  stage: ReductionOption['stage'],
  exercise: MutableFittedExercise,
  resultingExercises: readonly MutableFittedExercise[],
  decisionCode: WorkoutDurationDecisionCode,
  allocation: WorkoutAllocationSuccess,
  candidates: ReadonlyMap<ExerciseId, WorkoutExerciseCandidate>,
  allocationRuleSet: WorkoutAllocationRuleSet,
): ReductionOption {
  return {
    stage,
    exerciseId: exercise.selected.exerciseId,
    resultingExercises,
    decisionCode,
    imbalance: volumeImbalance(resultingExercises, allocation, candidates, allocationRuleSet),
    scoreRank: exercise.selected.scoreRank,
  };
}

function isValidVolumePlan(
  exercises: readonly MutableFittedExercise[],
  allocation: WorkoutAllocationSuccess,
  candidates: ReadonlyMap<ExerciseId, WorkoutExerciseCandidate>,
  input: WorkoutEngineInput,
  allocationRuleSet: WorkoutAllocationRuleSet,
  requiredLevel: 'minimum' | 'target',
): boolean {
  const volumes = calculateVolumes(exercises, candidates, allocationRuleSet);
  const requiredVolumesSatisfied = allocation.muscleVolumeSummary.every((summary) => {
    const required =
      requiredLevel === 'target' ? summary.targetWorkingSets : summary.minimumWorkingSets;
    return (volumes.get(summary.muscleId) ?? 0) + Number.EPSILON >= required;
  });
  if (!requiredVolumesSatisfied) {
    return false;
  }

  const hardMaximums = new Map<MuscleId, number>(
    allocation.muscleVolumeSummary.map(({ muscleId, maximumWorkingSets }) => [
      muscleId,
      maximumWorkingSets,
    ]),
  );
  input.constraints.forEach((constraint) => {
    if (constraint.kind === 'muscle_volume_limit') {
      hardMaximums.set(
        constraint.muscleId,
        Math.min(
          hardMaximums.get(constraint.muscleId) ?? allocationRuleSet.maximumWorkingSetsPerMuscle,
          constraint.maximumWorkingSets,
        ),
      );
    }
  });
  if (
    [...hardMaximums.entries()].some(
      ([muscleId, maximum]) => (volumes.get(muscleId) ?? 0) > maximum + Number.EPSILON,
    )
  ) {
    return false;
  }

  const distinctFamilies = new Set(exercises.map(({ selected }) => selected.exerciseFamilyId)).size;
  return distinctFamilies >= allocationRuleSet.minimumDistinctExerciseFamilies;
}

export function estimateWorkoutDurationForExercises(
  exercises: readonly WorkoutDurationExerciseInput[],
  input: WorkoutEngineInput,
  ruleSet: WorkoutDurationRuleSet,
): WorkoutDurationBreakdown {
  return estimateWorkoutDuration(
    exercises,
    new Map(input.exerciseCatalog.map((candidate) => [candidate.exerciseId, candidate])),
    input,
    ruleSet,
  );
}

function estimateWorkoutDuration(
  exercises: readonly WorkoutDurationExerciseInput[],
  candidates: ReadonlyMap<ExerciseId, WorkoutExerciseCandidate>,
  input: WorkoutEngineInput,
  ruleSet: WorkoutDurationRuleSet,
): WorkoutDurationBreakdown {
  let setupSeconds = 0;
  let setExecutionSeconds = 0;
  let restSeconds = 0;

  exercises.forEach((exercise) => {
    const candidate = requiredCandidate(candidates, exercise.exerciseId);
    setupSeconds += candidate.durationEstimate?.setupSeconds ?? ruleSet.defaultExerciseSetupSeconds;
    setExecutionSeconds +=
      exercise.workingSets *
      (candidate.durationEstimate?.perSetSeconds ?? ruleSet.defaultSetExecutionSeconds);
    restSeconds +=
      Math.max(0, exercise.workingSets - 1) *
      (exercise.restSecondsBetweenSets ?? exerciseRestSeconds(exercise.exerciseId, input, ruleSet));
  });
  const transitionSeconds =
    Math.max(0, exercises.length - 1) * ruleSet.transitionSecondsBetweenExercises;
  const totalSeconds = setupSeconds + setExecutionSeconds + restSeconds + transitionSeconds;

  return {
    setupSeconds,
    setExecutionSeconds,
    restSeconds,
    transitionSeconds,
    totalSeconds,
    totalMinutes: totalSeconds / 60,
  };
}

export function estimateExerciseDurationSeconds(
  workingSets: number,
  candidate: WorkoutExerciseCandidate,
  restSecondsBetweenSets: number,
  ruleSet: WorkoutDurationRuleSet,
): number {
  return (
    (candidate.durationEstimate?.setupSeconds ?? ruleSet.defaultExerciseSetupSeconds) +
    workingSets *
      (candidate.durationEstimate?.perSetSeconds ?? ruleSet.defaultSetExecutionSeconds) +
    Math.max(0, workingSets - 1) * restSecondsBetweenSets
  );
}

function durationExerciseInputs(
  exercises: readonly MutableFittedExercise[],
): readonly WorkoutDurationExerciseInput[] {
  return exercises.map(({ selected, workingSets }) => ({
    exerciseId: selected.exerciseId,
    workingSets,
  }));
}

function exerciseRestSeconds(
  exerciseId: ExerciseId,
  input: WorkoutEngineInput,
  ruleSet: WorkoutDurationRuleSet,
): number {
  return (
    input.programPrescription?.exercises.find(
      (prescription) => prescription.exerciseId === exerciseId,
    )?.restSeconds ?? ruleSet.defaultRestSecondsBetweenSets
  );
}

function recomputeVolumeSummary(
  exercises: readonly MutableFittedExercise[],
  allocation: WorkoutAllocationSuccess,
  candidates: ReadonlyMap<ExerciseId, WorkoutExerciseCandidate>,
  allocationRuleSet: WorkoutAllocationRuleSet,
): readonly AllocatedMuscleVolumeSummary[] {
  const volumes = calculateVolumes(exercises, candidates, allocationRuleSet);
  return allocation.muscleVolumeSummary.map((summary) => ({
    ...summary,
    weightedWorkingSetContribution: volumes.get(summary.muscleId) ?? 0,
  }));
}

function calculateVolumes(
  exercises: readonly MutableFittedExercise[],
  candidates: ReadonlyMap<ExerciseId, WorkoutExerciseCandidate>,
  allocationRuleSet: WorkoutAllocationRuleSet,
): ReadonlyMap<MuscleId, number> {
  const volumes = new Map<MuscleId, number>();
  exercises.forEach((exercise) => {
    const candidate = requiredCandidate(candidates, exercise.selected.exerciseId);
    candidate.muscleContributions.forEach(({ muscleId }) => {
      const contribution =
        calculateExerciseMuscleSetContribution(candidate, muscleId, allocationRuleSet) *
        exercise.workingSets;
      if (contribution > 0) {
        volumes.set(muscleId, (volumes.get(muscleId) ?? 0) + contribution);
      }
    });
  });
  return volumes;
}

function volumeImbalance(
  exercises: readonly MutableFittedExercise[],
  allocation: WorkoutAllocationSuccess,
  candidates: ReadonlyMap<ExerciseId, WorkoutExerciseCandidate>,
  allocationRuleSet: WorkoutAllocationRuleSet,
): number {
  const volumes = calculateVolumes(exercises, candidates, allocationRuleSet);
  const ratios = allocation.muscleVolumeSummary.map(
    ({ muscleId, targetWorkingSets }) =>
      (volumes.get(muscleId) ?? 0) / Math.max(targetWorkingSets, Number.EPSILON),
  );
  return ratios.length === 0 ? 0 : Math.max(...ratios) - Math.min(...ratios);
}

function effectiveMaximumDuration(input: WorkoutEngineInput): number {
  const constraintMaximums = input.constraints.flatMap((constraint) =>
    constraint.kind === 'maximum_workout_duration' ? [constraint.maximumMinutes] : [],
  );
  return Math.min(input.availableDurationMinutes, ...constraintMaximums);
}

function requiredCandidate(
  candidates: ReadonlyMap<ExerciseId, WorkoutExerciseCandidate>,
  exerciseId: ExerciseId,
): WorkoutExerciseCandidate {
  const candidate = candidates.get(exerciseId);
  if (candidate === undefined) {
    throw new Error('Allocated exercise must reference an input candidate.');
  }
  return candidate;
}

function cloneExercises(exercises: readonly MutableFittedExercise[]): MutableFittedExercise[] {
  return exercises.map((exercise) => ({ ...exercise }));
}

function durationFailure(
  code: DurationFittingFailureCode,
  input: WorkoutEngineInput,
  ruleSet: WorkoutDurationRuleSet,
  details: {
    readonly reasonCodes: readonly string[];
    readonly allocationFailureCode?: WorkoutAllocationFailureCode;
    readonly relatedExerciseIds?: readonly ExerciseId[];
    readonly relatedMuscleIds?: readonly MuscleId[];
  },
): DurationFittingFailure {
  return {
    status: 'failure',
    code,
    reasonCodes: details.reasonCodes,
    ...(details.allocationFailureCode
      ? { allocationFailureCode: details.allocationFailureCode }
      : {}),
    relatedExerciseIds: [...(details.relatedExerciseIds ?? [])].sort(),
    relatedMuscleIds: [...(details.relatedMuscleIds ?? [])].sort(),
    inputContractVersion: input.contractVersion,
    durationContractVersion: ruleSet.contractVersion,
    engineVersion: input.version,
    durationRuleSetVersion: ruleSet.ruleSetVersion,
  };
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
