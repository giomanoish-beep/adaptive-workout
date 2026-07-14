import {
  parseVersionIdentifier,
  type ContractVersion,
  type RuleSetVersion,
} from '@adaptive-workout/domain';
import {
  type DiscomfortMovementTrigger,
  type PainSafetyAdaptationConstraint,
  type PainSafetyClassificationEvaluation,
  type PainSafetyClassificationEvidence,
  type PainSafetyClassificationReasonCode,
  type PainSafetyInformationRequiredReasonCode,
  type PainSafetyInformationRequiredOutput,
} from './contracts.js';
import {
  validatePainSafetyClassificationOutput,
  validatePainSafetyInformationRequiredOutput,
  type PainSafetyValidationFailure,
} from './validation.js';

export const painSafetyAdaptationOutcomeReasonCodes = [
  'ADAPTATION_CONSTRAINTS_GENERATED',
  'NO_SUPPORTED_REPORTED_TRIGGER',
  'NO_ADAPTATION_REQUIRED',
  'TRAINING_NOT_AUTHORIZED',
  'INFORMATION_REQUIRED',
] as const;
export type PainSafetyAdaptationOutcomeReasonCode =
  (typeof painSafetyAdaptationOutcomeReasonCodes)[number];

export interface PainSafetyAdaptationRuleSet {
  readonly contractVersion: ContractVersion;
  readonly ruleSetVersion: RuleSetVersion;
  readonly hardExcludeMovementAtOrAboveSeverity: number;
  readonly reducedMovementMaximumWorkingSets: number;
  readonly reduceReportedMovementPriority: boolean;
  readonly reduceReportedMovementVolume: boolean;
  readonly excludeReportedExercises: boolean;
  readonly excludeReportedExerciseFamilies: boolean;
}

interface PainSafetyAdaptationOutcomeBase<Status extends string> {
  readonly status: Status;
  readonly contractVersion: ContractVersion;
  readonly subjectId: PainSafetyClassificationEvaluation['subjectId'];
  readonly eventId: PainSafetyClassificationEvaluation['eventId'];
  readonly sourceObservationIds: PainSafetyClassificationEvaluation['sourceObservationIds'];
  readonly reasonCodes: readonly PainSafetyAdaptationOutcomeReasonCode[];
  readonly classificationReasonCodes: readonly (
    PainSafetyClassificationReasonCode | PainSafetyInformationRequiredReasonCode
  )[];
  readonly evidence: PainSafetyClassificationEvidence;
  readonly version: PainSafetyClassificationEvaluation['version'];
  readonly evaluatedAt: string;
}

export interface PainSafetyConstraintsGeneratedOutput extends PainSafetyAdaptationOutcomeBase<'constraints_generated'> {
  readonly constraints: readonly PainSafetyAdaptationConstraint[];
}

export interface PainSafetyNoConstraintsGeneratedOutput extends PainSafetyAdaptationOutcomeBase<'no_constraints_generated'> {
  readonly constraints: readonly [];
}

export interface PainSafetyNoAdaptationRequiredOutput extends PainSafetyAdaptationOutcomeBase<'no_adaptation_required'> {
  readonly constraints: readonly [];
}

export interface PainSafetyTrainingNotAuthorizedOutput extends PainSafetyAdaptationOutcomeBase<'training_not_authorized'> {
  readonly constraints: readonly [];
}

export interface PainSafetyAdaptationInformationRequiredOutput extends PainSafetyAdaptationOutcomeBase<'information_required'> {
  readonly constraints: readonly [];
  readonly missingInformation: PainSafetyInformationRequiredOutput['missingInformation'];
  readonly currentQuestionBatch: PainSafetyInformationRequiredOutput['currentQuestionBatch'];
}

export type PainSafetyAdaptationOutcome =
  | PainSafetyConstraintsGeneratedOutput
  | PainSafetyNoConstraintsGeneratedOutput
  | PainSafetyNoAdaptationRequiredOutput
  | PainSafetyTrainingNotAuthorizedOutput
  | PainSafetyAdaptationInformationRequiredOutput;

export const painSafetyAdaptationRuleSetFailureCodes = [
  'invalid_rule_contract_version',
  'invalid_rule_set_version',
  'rule_set_version_mismatch',
  'invalid_hard_exclusion_severity',
  'invalid_reduced_volume_limit',
  'invalid_rule_toggle',
] as const;
export type PainSafetyAdaptationRuleSetFailureCode =
  (typeof painSafetyAdaptationRuleSetFailureCodes)[number];

export interface PainSafetyAdaptationRuleSetFailure {
  readonly status: 'failure';
  readonly code: 'INVALID_PAIN_SAFETY_ADAPTATION_RULE_SET';
  readonly reasonCodes: readonly PainSafetyAdaptationRuleSetFailureCode[];
}

export type PainSafetyAdaptationResult =
  | { readonly ok: true; readonly value: PainSafetyAdaptationOutcome }
  | {
      readonly ok: false;
      readonly failure: PainSafetyValidationFailure | PainSafetyAdaptationRuleSetFailure;
    };

export const painSafetyAdaptationContractVersion = 'pain-safety-adaptation-v1' as ContractVersion;

export const defaultPainSafetyAdaptationRuleSet: PainSafetyAdaptationRuleSet = {
  contractVersion: 'pain-safety-adaptation-rules-v1' as ContractVersion,
  ruleSetVersion: 'pain-safety-rules-v2' as RuleSetVersion,
  hardExcludeMovementAtOrAboveSeverity: 5,
  reducedMovementMaximumWorkingSets: 2,
  reduceReportedMovementPriority: true,
  reduceReportedMovementVolume: true,
  excludeReportedExercises: true,
  excludeReportedExerciseFamilies: true,
};

export function generatePainSafetyAdaptation(
  evaluation: PainSafetyClassificationEvaluation,
  ruleSet: PainSafetyAdaptationRuleSet,
): PainSafetyAdaptationResult {
  const validation =
    evaluation.status === 'classified'
      ? validatePainSafetyClassificationOutput(evaluation)
      : validatePainSafetyInformationRequiredOutput(evaluation);
  if (!validation.ok) {
    return validation;
  }
  const ruleSetFailure = validatePainSafetyAdaptationRuleSet(
    ruleSet,
    evaluation.version.ruleSetVersion,
  );
  if (ruleSetFailure !== null) {
    return { ok: false, failure: ruleSetFailure };
  }

  if (evaluation.status === 'information_required') {
    return informationRequired(evaluation);
  }
  if (evaluation.classification === 'STOP') {
    return noConstraintOutcome('training_not_authorized', evaluation);
  }
  if (evaluation.classification === 'GREEN') {
    return noConstraintOutcome('no_adaptation_required', evaluation);
  }

  const constraints = generateConstraints(evaluation, ruleSet);
  if (constraints.length === 0) {
    return noConstraintOutcome('no_constraints_generated', evaluation);
  }
  return {
    ok: true,
    value: {
      ...baseOutcome(evaluation),
      status: 'constraints_generated',
      reasonCodes: ['ADAPTATION_CONSTRAINTS_GENERATED'],
      constraints,
    },
  };
}

export function validatePainSafetyAdaptationRuleSet(
  ruleSet: PainSafetyAdaptationRuleSet,
  expectedRuleSetVersion?: RuleSetVersion,
): PainSafetyAdaptationRuleSetFailure | null {
  const reasons = new Set<PainSafetyAdaptationRuleSetFailureCode>();
  if (!parseVersionIdentifier(ruleSet.contractVersion, 'contract').ok) {
    reasons.add('invalid_rule_contract_version');
  }
  if (!parseVersionIdentifier(ruleSet.ruleSetVersion, 'rule-set').ok) {
    reasons.add('invalid_rule_set_version');
  }
  if (expectedRuleSetVersion !== undefined && ruleSet.ruleSetVersion !== expectedRuleSetVersion) {
    reasons.add('rule_set_version_mismatch');
  }
  if (
    !Number.isInteger(ruleSet.hardExcludeMovementAtOrAboveSeverity) ||
    ruleSet.hardExcludeMovementAtOrAboveSeverity < 1 ||
    ruleSet.hardExcludeMovementAtOrAboveSeverity > 10
  ) {
    reasons.add('invalid_hard_exclusion_severity');
  }
  if (
    !Number.isInteger(ruleSet.reducedMovementMaximumWorkingSets) ||
    ruleSet.reducedMovementMaximumWorkingSets < 0
  ) {
    reasons.add('invalid_reduced_volume_limit');
  }
  if (
    [
      ruleSet.reduceReportedMovementPriority,
      ruleSet.reduceReportedMovementVolume,
      ruleSet.excludeReportedExercises,
      ruleSet.excludeReportedExerciseFamilies,
    ].some((value) => typeof value !== 'boolean')
  ) {
    reasons.add('invalid_rule_toggle');
  }

  return reasons.size === 0
    ? null
    : {
        status: 'failure',
        code: 'INVALID_PAIN_SAFETY_ADAPTATION_RULE_SET',
        reasonCodes: painSafetyAdaptationRuleSetFailureCodes.filter((code) => reasons.has(code)),
      };
}

function generateConstraints(
  evaluation: Extract<PainSafetyClassificationEvaluation, { readonly status: 'classified' }>,
  ruleSet: PainSafetyAdaptationRuleSet,
): readonly PainSafetyAdaptationConstraint[] {
  const constraints = evaluation.evidence.movementTriggers
    .slice()
    .sort((left, right) => triggerKey(left).localeCompare(triggerKey(right)))
    .flatMap((trigger) => constraintsForTrigger(trigger, evaluation.evidence.severity, ruleSet));
  const unique = new Map<string, PainSafetyAdaptationConstraint>();
  constraints.forEach((constraint) => {
    unique.set(constraintKey(constraint), constraint);
  });
  return [...unique.values()].sort((left, right) =>
    constraintKey(left).localeCompare(constraintKey(right)),
  );
}

function constraintsForTrigger(
  trigger: DiscomfortMovementTrigger,
  severity: number | null,
  ruleSet: PainSafetyAdaptationRuleSet,
): readonly PainSafetyAdaptationConstraint[] {
  switch (trigger.kind) {
    case 'movement_pattern':
      if (severity !== null && severity >= ruleSet.hardExcludeMovementAtOrAboveSeverity) {
        return [
          {
            constraintId: `adapt_exclude_${trigger.movementPattern}`,
            kind: 'exclude_movement_pattern',
            reasonCode: 'MOVEMENT_AGGRAVATION_REPORTED',
            movementPatterns: [trigger.movementPattern],
          },
        ];
      }
      return [
        ...(ruleSet.reduceReportedMovementPriority
          ? [
              {
                constraintId: `adapt_reduce_priority_${trigger.movementPattern}`,
                kind: 'reduce_movement_pattern_priority' as const,
                reasonCode: 'MOVEMENT_AGGRAVATION_REPORTED' as const,
                movementPatterns: [trigger.movementPattern],
              },
            ]
          : []),
        ...(ruleSet.reduceReportedMovementVolume
          ? [
              {
                constraintId: `adapt_reduce_volume_${trigger.movementPattern}`,
                kind: 'reduce_volume' as const,
                reasonCode: 'MOVEMENT_AGGRAVATION_REPORTED' as const,
                movementPattern: trigger.movementPattern,
                maximumWorkingSets: ruleSet.reducedMovementMaximumWorkingSets,
              },
            ]
          : []),
      ];
    case 'exercise':
      return ruleSet.excludeReportedExercises
        ? [
            {
              constraintId: `adapt_exclude_exercise_${trigger.exerciseId}`,
              kind: 'exclude_exercises',
              reasonCode: 'MOVEMENT_AGGRAVATION_REPORTED',
              exerciseIds: [trigger.exerciseId],
            },
          ]
        : [];
    case 'exercise_family':
      return ruleSet.excludeReportedExerciseFamilies
        ? [
            {
              constraintId: `adapt_exclude_family_${trigger.exerciseFamilyId}`,
              kind: 'exclude_exercise_families',
              reasonCode: 'MOVEMENT_AGGRAVATION_REPORTED',
              exerciseFamilyIds: [trigger.exerciseFamilyId],
            },
          ]
        : [];
    case 'activity':
      return [];
  }
}

function informationRequired(
  evaluation: PainSafetyInformationRequiredOutput,
): PainSafetyAdaptationResult {
  return {
    ok: true,
    value: {
      ...baseOutcome(evaluation),
      status: 'information_required',
      reasonCodes: ['INFORMATION_REQUIRED'],
      constraints: [],
      missingInformation: [...evaluation.missingInformation],
      currentQuestionBatch: [...evaluation.currentQuestionBatch],
    },
  };
}

function noConstraintOutcome(
  status: 'no_constraints_generated' | 'no_adaptation_required' | 'training_not_authorized',
  evaluation: Extract<PainSafetyClassificationEvaluation, { readonly status: 'classified' }>,
): PainSafetyAdaptationResult {
  const base = baseOutcome(evaluation);
  switch (status) {
    case 'no_constraints_generated':
      return {
        ok: true,
        value: {
          ...base,
          status: 'no_constraints_generated',
          reasonCodes: ['NO_SUPPORTED_REPORTED_TRIGGER'],
          constraints: [],
        },
      };
    case 'no_adaptation_required':
      return {
        ok: true,
        value: {
          ...base,
          status: 'no_adaptation_required',
          reasonCodes: ['NO_ADAPTATION_REQUIRED'],
          constraints: [],
        },
      };
    case 'training_not_authorized':
      return {
        ok: true,
        value: {
          ...base,
          status: 'training_not_authorized',
          reasonCodes: ['TRAINING_NOT_AUTHORIZED'],
          constraints: [],
        },
      };
  }
}

function baseOutcome(evaluation: PainSafetyClassificationEvaluation) {
  return {
    contractVersion: painSafetyAdaptationContractVersion,
    subjectId: evaluation.subjectId,
    eventId: evaluation.eventId,
    sourceObservationIds: [...evaluation.sourceObservationIds],
    classificationReasonCodes: [...evaluation.reasonCodes],
    evidence: {
      ...evaluation.evidence,
      movementTriggers: [...evaluation.evidence.movementTriggers],
      safety: { ...evaluation.evidence.safety },
      reportedStopSignals: [...evaluation.evidence.reportedStopSignals],
    },
    version: evaluation.version,
    evaluatedAt:
      evaluation.status === 'classified' ? evaluation.classifiedAt : evaluation.evaluatedAt,
  };
}

function triggerKey(trigger: DiscomfortMovementTrigger): string {
  switch (trigger.kind) {
    case 'movement_pattern':
      return `${trigger.kind}:${trigger.movementPattern}`;
    case 'exercise':
      return `${trigger.kind}:${trigger.exerciseId}`;
    case 'exercise_family':
      return `${trigger.kind}:${trigger.exerciseFamilyId}`;
    case 'activity':
      return `${trigger.kind}:${trigger.activityContext}`;
  }
}

function constraintKey(constraint: PainSafetyAdaptationConstraint): string {
  switch (constraint.kind) {
    case 'exclude_movement_pattern':
    case 'reduce_movement_pattern_priority':
    case 'prefer_movement_emphasis':
      return `${constraint.kind}:${constraint.movementPatterns.join(',')}`;
    case 'exclude_exercises':
      return `${constraint.kind}:${constraint.exerciseIds.join(',')}`;
    case 'exclude_exercise_families':
      return `${constraint.kind}:${constraint.exerciseFamilyIds.join(',')}`;
    case 'reduce_volume':
      return `${constraint.kind}:${constraint.movementPattern}:${constraint.maximumWorkingSets}`;
  }
}
