import {
  domainError,
  failure,
  parseVersionIdentifier,
  success,
  type ContractVersion,
  type DomainResult,
  type ExerciseId,
  type MuscleId,
  type RuleSetVersion,
} from '@adaptive-workout/domain';
import type { WorkoutConstraint } from './constraints.js';
import type {
  ExercisePreferenceContext,
  RecentExerciseExposureContext,
  WorkoutEngineInput,
  WorkoutExerciseCandidate,
  WorkoutTargetMuscle,
} from './contracts.js';
import { filterWorkoutCandidates, type WorkoutCandidateFilteringResult } from './filtering.js';
import { validateWorkoutEngineInput } from './validation.js';

export interface WorkoutCandidateScoringRuleSet {
  readonly contractVersion: ContractVersion;
  readonly ruleSetVersion: RuleSetVersion;
  readonly maximumComponentMagnitude: number;
  readonly relevance: {
    readonly primaryRoleWeight: number;
    readonly secondaryRoleWeight: number;
    readonly requiredTargetWeight: number;
    readonly preferredTargetWeight: number;
  };
  readonly adjustments: {
    readonly userLikeBonus: number;
    readonly userDislikePenalty: number;
    readonly reducedPriorityPenalty: number;
    readonly preferredExerciseBonus: number;
    readonly preferredFamilyBonus: number;
    readonly preferredMuscleBonus: number;
    readonly templatePrescriptionBonus: number;
  };
  readonly recency: {
    readonly windowDays: number;
    readonly maximumPenalty: number;
  };
}

export const workoutCandidateScoringReasonCodes = [
  'PRIMARY_TARGET_RELEVANCE',
  'SECONDARY_TARGET_RELEVANCE',
  'PREFERRED_MUSCLE',
  'USER_LIKE',
  'USER_DISLIKE',
  'REDUCED_PRIORITY',
  'PREFERRED_EXERCISE',
  'PREFERRED_FAMILY',
  'RECENT_EXPOSURE',
  'TEMPLATE_PRESCRIPTION',
] as const;

export type WorkoutCandidateScoringReasonCode = (typeof workoutCandidateScoringReasonCodes)[number];

export interface WorkoutCandidateScoreComponent {
  readonly code: WorkoutCandidateScoringReasonCode;
  readonly score: number;
  readonly relatedMuscleId?: MuscleId;
  readonly relatedConstraintId?: string;
  readonly targetPriority?: WorkoutTargetMuscle['priority'];
  readonly daysSinceExposure?: number;
}

export interface ScoredWorkoutCandidate {
  readonly rank: number;
  readonly candidate: WorkoutExerciseCandidate;
  readonly finalScore: number;
  readonly components: readonly WorkoutCandidateScoreComponent[];
  readonly reasonCodes: readonly WorkoutCandidateScoringReasonCode[];
  readonly scoringContractVersion: ContractVersion;
  readonly engineVersion: WorkoutEngineInput['version'];
  readonly scoringRuleSetVersion: RuleSetVersion;
}

export interface WorkoutCandidateScoringResult {
  readonly inputContractVersion: ContractVersion;
  readonly scoringContractVersion: ContractVersion;
  readonly engineVersion: WorkoutEngineInput['version'];
  readonly scoringRuleSetVersion: RuleSetVersion;
  readonly filtering: WorkoutCandidateFilteringResult;
  readonly rankedCandidates: readonly ScoredWorkoutCandidate[];
}

export const workoutCandidateScoringValidationCodes = [
  'INVALID_SCORING_CONTRACT_VERSION',
  'INVALID_SCORING_RULE_SET_VERSION',
  'RULE_SET_VERSION_MISMATCH',
  'INVALID_COMPONENT_BOUND',
  'INVALID_RELEVANCE_WEIGHT',
  'INVALID_ADJUSTMENT',
  'INVALID_RECENCY_WINDOW',
  'TEMPLATE_PREFERENCE_TOO_WEAK',
] as const;

export type WorkoutCandidateScoringValidationCode =
  (typeof workoutCandidateScoringValidationCodes)[number];

export interface WorkoutCandidateScoringValidationIssue {
  readonly code: WorkoutCandidateScoringValidationCode;
  readonly path: string;
}

export function validateWorkoutCandidateScoringRuleSet(
  ruleSet: WorkoutCandidateScoringRuleSet,
  expectedRuleSetVersion?: RuleSetVersion,
): DomainResult<WorkoutCandidateScoringRuleSet, 'VALIDATION_ERROR'> {
  const issues: WorkoutCandidateScoringValidationIssue[] = [];

  if (!parseVersionIdentifier(ruleSet.contractVersion, 'contract').ok) {
    issues.push({
      code: 'INVALID_SCORING_CONTRACT_VERSION',
      path: 'contractVersion',
    });
  }
  if (!parseVersionIdentifier(ruleSet.ruleSetVersion, 'rule-set').ok) {
    issues.push({
      code: 'INVALID_SCORING_RULE_SET_VERSION',
      path: 'ruleSetVersion',
    });
  }
  if (expectedRuleSetVersion !== undefined && ruleSet.ruleSetVersion !== expectedRuleSetVersion) {
    issues.push({ code: 'RULE_SET_VERSION_MISMATCH', path: 'ruleSetVersion' });
  }

  if (!isPositiveFinite(ruleSet.maximumComponentMagnitude)) {
    issues.push({ code: 'INVALID_COMPONENT_BOUND', path: 'maximumComponentMagnitude' });
  }

  const relevanceWeights = [
    ['relevance.primaryRoleWeight', ruleSet.relevance.primaryRoleWeight],
    ['relevance.secondaryRoleWeight', ruleSet.relevance.secondaryRoleWeight],
    ['relevance.requiredTargetWeight', ruleSet.relevance.requiredTargetWeight],
    ['relevance.preferredTargetWeight', ruleSet.relevance.preferredTargetWeight],
  ] as const;
  relevanceWeights.forEach(([path, value]) => {
    if (!isBoundedNonNegative(value, ruleSet.maximumComponentMagnitude)) {
      issues.push({ code: 'INVALID_RELEVANCE_WEIGHT', path });
    }
  });
  if (
    ruleSet.relevance.primaryRoleWeight <= ruleSet.relevance.secondaryRoleWeight ||
    ruleSet.relevance.requiredTargetWeight <= 0 ||
    ruleSet.relevance.requiredTargetWeight < ruleSet.relevance.preferredTargetWeight ||
    ruleSet.relevance.primaryRoleWeight * ruleSet.relevance.requiredTargetWeight >
      ruleSet.maximumComponentMagnitude ||
    ruleSet.relevance.primaryRoleWeight * ruleSet.relevance.preferredTargetWeight >
      ruleSet.maximumComponentMagnitude ||
    ruleSet.relevance.secondaryRoleWeight * ruleSet.relevance.requiredTargetWeight >
      ruleSet.maximumComponentMagnitude ||
    ruleSet.relevance.secondaryRoleWeight * ruleSet.relevance.preferredTargetWeight >
      ruleSet.maximumComponentMagnitude
  ) {
    issues.push({ code: 'INVALID_RELEVANCE_WEIGHT', path: 'relevance' });
  }

  const adjustments = [
    ['adjustments.userLikeBonus', ruleSet.adjustments.userLikeBonus],
    ['adjustments.userDislikePenalty', ruleSet.adjustments.userDislikePenalty],
    ['adjustments.reducedPriorityPenalty', ruleSet.adjustments.reducedPriorityPenalty],
    ['adjustments.preferredExerciseBonus', ruleSet.adjustments.preferredExerciseBonus],
    ['adjustments.preferredFamilyBonus', ruleSet.adjustments.preferredFamilyBonus],
    ['adjustments.preferredMuscleBonus', ruleSet.adjustments.preferredMuscleBonus],
    ['adjustments.templatePrescriptionBonus', ruleSet.adjustments.templatePrescriptionBonus],
    ['recency.maximumPenalty', ruleSet.recency.maximumPenalty],
  ] as const;
  adjustments.forEach(([path, value]) => {
    if (!isBoundedNonNegative(value, ruleSet.maximumComponentMagnitude)) {
      issues.push({ code: 'INVALID_ADJUSTMENT', path });
    }
  });

  if (!Number.isInteger(ruleSet.recency.windowDays) || ruleSet.recency.windowDays <= 0) {
    issues.push({ code: 'INVALID_RECENCY_WINDOW', path: 'recency.windowDays' });
  }

  if (
    ruleSet.adjustments.templatePrescriptionBonus < ruleSet.adjustments.preferredExerciseBonus ||
    ruleSet.adjustments.templatePrescriptionBonus < ruleSet.adjustments.preferredFamilyBonus ||
    ruleSet.adjustments.templatePrescriptionBonus < ruleSet.adjustments.userLikeBonus
  ) {
    issues.push({
      code: 'TEMPLATE_PREFERENCE_TOO_WEAK',
      path: 'adjustments.templatePrescriptionBonus',
    });
  }

  if (issues.length > 0) {
    return failure(
      domainError('VALIDATION_ERROR', 'Workout candidate scoring rule set is invalid.', {
        issues,
      }),
    );
  }

  return success(ruleSet);
}

export function rankWorkoutCandidates(
  input: WorkoutEngineInput,
  ruleSet: WorkoutCandidateScoringRuleSet,
): DomainResult<WorkoutCandidateScoringResult, 'VALIDATION_ERROR'> {
  const inputValidation = validateWorkoutEngineInput(input);
  if (!inputValidation.ok) {
    return inputValidation;
  }

  const ruleSetValidation = validateWorkoutCandidateScoringRuleSet(
    ruleSet,
    input.version.ruleSetVersion,
  );
  if (!ruleSetValidation.ok) {
    return ruleSetValidation;
  }

  const filtering = filterWorkoutCandidates(input);
  const targetMuscles = new Map(input.targetMuscles.map((target) => [target.muscleId, target]));
  const preferredMuscles = collectConstraintReferences(input.constraints, 'preferred_muscles');
  const scored = filtering.eligibleCandidates.map((candidate) => {
    const components = scoreCandidate(
      candidate,
      input,
      ruleSet,
      targetMuscles,
      preferredMuscles,
    ).sort(compareScoreComponents);
    const finalScore = components.reduce((total, component) => total + component.score, 0);

    return {
      candidate,
      finalScore,
      components,
      reasonCodes: uniqueReasonCodes(components),
    };
  });

  const rankedCandidates: ScoredWorkoutCandidate[] = scored
    .sort(
      (left, right) =>
        right.finalScore - left.finalScore ||
        left.candidate.exerciseId.localeCompare(right.candidate.exerciseId),
    )
    .map((candidate, index) => ({
      rank: index + 1,
      ...candidate,
      scoringContractVersion: ruleSet.contractVersion,
      engineVersion: input.version,
      scoringRuleSetVersion: ruleSet.ruleSetVersion,
    }));

  return success({
    inputContractVersion: input.contractVersion,
    scoringContractVersion: ruleSet.contractVersion,
    engineVersion: input.version,
    scoringRuleSetVersion: ruleSet.ruleSetVersion,
    filtering,
    rankedCandidates,
  });
}

function scoreCandidate(
  candidate: WorkoutExerciseCandidate,
  input: WorkoutEngineInput,
  ruleSet: WorkoutCandidateScoringRuleSet,
  targetMuscles: ReadonlyMap<MuscleId, WorkoutTargetMuscle>,
  preferredMuscles: ReadonlySet<string>,
): WorkoutCandidateScoreComponent[] {
  const components: WorkoutCandidateScoreComponent[] = [];

  [...candidate.muscleContributions]
    .sort((left, right) => left.muscleId.localeCompare(right.muscleId))
    .forEach(({ muscleId, role, contribution }) => {
      const target = targetMuscles.get(muscleId);
      if (target === undefined || role === 'stabilizer') {
        return;
      }
      const roleWeight =
        role === 'primary'
          ? ruleSet.relevance.primaryRoleWeight
          : ruleSet.relevance.secondaryRoleWeight;
      const priorityWeight =
        target.priority === 'required'
          ? ruleSet.relevance.requiredTargetWeight
          : ruleSet.relevance.preferredTargetWeight;
      components.push({
        code: role === 'primary' ? 'PRIMARY_TARGET_RELEVANCE' : 'SECONDARY_TARGET_RELEVANCE',
        score: contribution * roleWeight * priorityWeight,
        relatedMuscleId: muscleId,
        targetPriority: target.priority,
      });

      if (preferredMuscles.has(muscleId)) {
        components.push({
          code: 'PREFERRED_MUSCLE',
          score: contribution * ruleSet.adjustments.preferredMuscleBonus,
          relatedMuscleId: muscleId,
        });
      }
    });

  scorePreferences(candidate.exerciseId, input.exercisePreferences, ruleSet, components);
  scoreConstraints(candidate, input.constraints, ruleSet, components);
  scoreRecency(candidate.exerciseId, input, ruleSet, components);

  if (
    input.programPrescription?.exercises.some(
      ({ exerciseId }) => exerciseId === candidate.exerciseId,
    )
  ) {
    components.push({
      code: 'TEMPLATE_PRESCRIPTION',
      score: ruleSet.adjustments.templatePrescriptionBonus,
    });
  }

  return components;
}

function scorePreferences(
  exerciseId: ExerciseId,
  preferences: readonly ExercisePreferenceContext[],
  ruleSet: WorkoutCandidateScoringRuleSet,
  components: WorkoutCandidateScoreComponent[],
): void {
  const matchingPreferences = new Set(
    preferences
      .filter((preference) => preference.exerciseId === exerciseId)
      .map(({ preference }) => preference),
  );

  if (matchingPreferences.has('like')) {
    components.push({ code: 'USER_LIKE', score: ruleSet.adjustments.userLikeBonus });
  }
  if (matchingPreferences.has('dislike')) {
    components.push({ code: 'USER_DISLIKE', score: -ruleSet.adjustments.userDislikePenalty });
  }
}

function scoreConstraints(
  candidate: WorkoutExerciseCandidate,
  constraints: readonly WorkoutConstraint[],
  ruleSet: WorkoutCandidateScoringRuleSet,
  components: WorkoutCandidateScoreComponent[],
): void {
  [...constraints]
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((constraint) => {
      if (
        constraint.kind === 'reduced_exercise_priority' &&
        constraint.exerciseIds.includes(candidate.exerciseId)
      ) {
        components.push({
          code: 'REDUCED_PRIORITY',
          score: -ruleSet.adjustments.reducedPriorityPenalty,
          relatedConstraintId: constraint.id,
        });
      }
      if (
        constraint.kind === 'preferred_exercises' &&
        constraint.exerciseIds.includes(candidate.exerciseId)
      ) {
        components.push({
          code: 'PREFERRED_EXERCISE',
          score: ruleSet.adjustments.preferredExerciseBonus,
          relatedConstraintId: constraint.id,
        });
      }
      if (
        constraint.kind === 'preferred_exercise_families' &&
        constraint.exerciseFamilyIds.includes(candidate.exerciseFamilyId)
      ) {
        components.push({
          code: 'PREFERRED_FAMILY',
          score: ruleSet.adjustments.preferredFamilyBonus,
          relatedConstraintId: constraint.id,
        });
      }
    });
}

function scoreRecency(
  exerciseId: ExerciseId,
  input: WorkoutEngineInput,
  ruleSet: WorkoutCandidateScoringRuleSet,
  components: WorkoutCandidateScoreComponent[],
): void {
  const exposure = latestExposure(exerciseId, input.recentExerciseExposures);
  if (exposure?.lastPerformedAt === undefined || exposure.completedWorkingSets <= 0) {
    return;
  }

  const daysSinceExposure = calendarDaysBetween(exposure.lastPerformedAt, input.sessionDate);
  if (daysSinceExposure === undefined || daysSinceExposure >= ruleSet.recency.windowDays) {
    return;
  }

  const penalty =
    ruleSet.recency.maximumPenalty *
    (1 - Math.max(daysSinceExposure, 0) / ruleSet.recency.windowDays);
  components.push({
    code: 'RECENT_EXPOSURE',
    score: -penalty,
    daysSinceExposure: Math.max(daysSinceExposure, 0),
  });
}

function latestExposure(
  exerciseId: ExerciseId,
  exposures: readonly RecentExerciseExposureContext[],
): RecentExerciseExposureContext | undefined {
  return exposures
    .filter((exposure) => exposure.exerciseId === exerciseId)
    .sort(
      (left, right) =>
        (right.lastPerformedAt ?? '').localeCompare(left.lastPerformedAt ?? '') ||
        right.completedWorkingSets - left.completedWorkingSets,
    )[0];
}

function calendarDaysBetween(earlier: string, later: string): number | undefined {
  const earlierDate = Date.parse(`${earlier.slice(0, 10)}T00:00:00.000Z`);
  const laterDate = Date.parse(`${later.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(earlierDate) || !Number.isFinite(laterDate)) {
    return undefined;
  }
  return Math.floor((laterDate - earlierDate) / 86_400_000);
}

function collectConstraintReferences(
  constraints: readonly WorkoutConstraint[],
  kind: 'preferred_muscles',
): ReadonlySet<string> {
  return new Set(
    constraints.flatMap((constraint) => (constraint.kind === kind ? constraint.muscleIds : [])),
  );
}

function uniqueReasonCodes(
  components: readonly WorkoutCandidateScoreComponent[],
): readonly WorkoutCandidateScoringReasonCode[] {
  const present = new Set(components.map(({ code }) => code));
  return workoutCandidateScoringReasonCodes.filter((code) => present.has(code));
}

function compareScoreComponents(
  left: WorkoutCandidateScoreComponent,
  right: WorkoutCandidateScoreComponent,
): number {
  return (
    workoutCandidateScoringReasonCodes.indexOf(left.code) -
      workoutCandidateScoringReasonCodes.indexOf(right.code) ||
    (left.relatedMuscleId ?? '').localeCompare(right.relatedMuscleId ?? '') ||
    (left.relatedConstraintId ?? '').localeCompare(right.relatedConstraintId ?? '')
  );
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isBoundedNonNegative(value: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= maximum;
}
