import {
  parseVersionIdentifier,
  type ContractVersion,
  type RuleSetVersion,
} from '@adaptive-workout/domain';
import {
  painSafetyExpectedAnswerTypes,
  painSafetyMissingQuestionCodes,
  type DiscomfortEventContract,
  type DiscomfortMovementTrigger,
  type DiscomfortObservation,
  type DiscomfortObservationId,
  type DiscomfortSafetyObservations,
  type DiscomfortTrend,
  type PainSafetyExpectedAnswerType,
  type PainSafetyMissingInformationEntry,
  type PainSafetyMissingQuestionCode,
  type PainSafetyTriState,
} from './contracts.js';
import { validateDiscomfortEventContract, type PainSafetyValidationFailure } from './validation.js';

export type PainSafetyMissingInformationRule = PainSafetyMissingInformationEntry;

export interface PainSafetyMissingInformationRuleSet {
  readonly contractVersion: ContractVersion;
  readonly ruleSetVersion: RuleSetVersion;
  readonly questionBatch: PainSafetyQuestionBatchRule;
  readonly questions: readonly PainSafetyMissingInformationRule[];
}

export interface PainSafetyQuestionBatchRule {
  readonly contractVersion: ContractVersion;
  readonly maximumQuestions: number;
}

export interface ResolvedDiscomfortObservationSummary {
  readonly latestObservationId: DiscomfortObservationId;
  readonly sourceObservationIds: readonly DiscomfortObservationId[];
  readonly observedAt: string;
  readonly severity: number | null;
  readonly trend: DiscomfortTrend;
  readonly movementTriggerStatus: PainSafetyTriState;
  readonly movementTriggers: readonly DiscomfortMovementTrigger[];
  readonly safety: DiscomfortSafetyObservations;
}

export interface PainSafetyMissingInformationEvaluation {
  readonly status: 'success';
  readonly contractVersion: ContractVersion;
  readonly subjectId: DiscomfortEventContract['subjectId'];
  readonly eventId: DiscomfortEventContract['eventId'];
  readonly resolvedObservation: ResolvedDiscomfortObservationSummary;
  readonly missingInformation: readonly PainSafetyMissingInformationEntry[];
  readonly currentQuestionBatch: readonly PainSafetyMissingInformationEntry[];
  readonly version: DiscomfortEventContract['version'];
  readonly evaluatedAt: string;
}

export const painSafetyMissingInformationRuleSetFailureCodes = [
  'invalid_rule_contract_version',
  'invalid_rule_set_version',
  'rule_set_version_mismatch',
  'invalid_question_batch_contract_version',
  'invalid_maximum_questions_per_batch',
  'empty_question_rules',
  'duplicate_question_code',
  'unsupported_question_code',
  'invalid_priority',
  'invalid_expected_answer_type',
  'invalid_related_field',
] as const;

export type PainSafetyMissingInformationRuleSetFailureCode =
  (typeof painSafetyMissingInformationRuleSetFailureCodes)[number];

export interface PainSafetyMissingInformationRuleSetFailure {
  readonly status: 'failure';
  readonly code: 'INVALID_MISSING_INFORMATION_RULE_SET';
  readonly reasonCodes: readonly PainSafetyMissingInformationRuleSetFailureCode[];
}

export type PainSafetyMissingInformationEvaluationResult =
  | { readonly ok: true; readonly value: PainSafetyMissingInformationEvaluation }
  | {
      readonly ok: false;
      readonly failure: PainSafetyValidationFailure | PainSafetyMissingInformationRuleSetFailure;
    };

export const painSafetyMissingInformationContractVersion =
  'pain-safety-missing-information-v2' as ContractVersion;

export const maximumPainSafetyQuestionsPerBatch = painSafetyMissingQuestionCodes.length;

export const defaultPainSafetyMissingInformationRuleSet: PainSafetyMissingInformationRuleSet = {
  contractVersion: 'pain-safety-missing-rules-v2' as ContractVersion,
  ruleSetVersion: 'pain-safety-rules-v2' as RuleSetVersion,
  questionBatch: {
    contractVersion: 'pain-safety-question-batch-v1' as ContractVersion,
    maximumQuestions: 5,
  },
  questions: [
    question('severity', 10, 'severity_0_to_10_or_unknown', 'severity'),
    question('traumatic_or_sudden_onset', 20, 'tri_state', 'safety_traumatic_or_sudden_onset'),
    question('weight_bearing_limitation', 30, 'tri_state', 'safety_weight_bearing_limitation'),
    question('visible_deformity', 40, 'tri_state', 'safety_visible_deformity'),
    question('swelling', 50, 'tri_state', 'safety_swelling'),
    question('instability_or_giving_way', 60, 'tri_state', 'safety_instability_or_giving_way'),
    question('numbness_or_weakness', 70, 'tri_state', 'safety_numbness_or_weakness'),
    question('systemic_warning_signals', 80, 'tri_state', 'safety_systemic_warning_signals'),
    question('symptom_trend', 90, 'trend', 'trend'),
    question('movement_trigger', 100, 'movement_trigger_list', 'movement_trigger_status'),
  ],
};

export function evaluateMissingDiscomfortInformation(
  event: DiscomfortEventContract,
  ruleSet: PainSafetyMissingInformationRuleSet,
): PainSafetyMissingInformationEvaluationResult {
  const validation = validateDiscomfortEventContract(event);
  if (!validation.ok) {
    return validation;
  }
  const ruleSetFailure = validateMissingInformationRuleSet(ruleSet, event.version.ruleSetVersion);
  if (ruleSetFailure !== null) {
    return { ok: false, failure: ruleSetFailure };
  }

  const resolvedObservation = resolveLatestObservation(event.observations);
  const missingInformation = [...ruleSet.questions]
    .filter(({ questionCode }) => !isAnswered(questionCode, resolvedObservation))
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        questionCodeOrder(left.questionCode) - questionCodeOrder(right.questionCode),
    )
    .map(({ questionCode, priority, expectedAnswerType, relatedField }) => ({
      questionCode,
      priority,
      expectedAnswerType,
      relatedField,
    }));

  return {
    ok: true,
    value: {
      status: 'success',
      contractVersion: painSafetyMissingInformationContractVersion,
      subjectId: event.subjectId,
      eventId: event.eventId,
      resolvedObservation,
      missingInformation,
      currentQuestionBatch: missingInformation.slice(0, ruleSet.questionBatch.maximumQuestions),
      version: event.version,
      evaluatedAt: event.evaluatedAt,
    },
  };
}

export function validatePainSafetyMissingInformationRuleSet(
  ruleSet: PainSafetyMissingInformationRuleSet,
  expectedRuleSetVersion?: RuleSetVersion,
): PainSafetyMissingInformationRuleSetFailure | null {
  return validateMissingInformationRuleSet(ruleSet, expectedRuleSetVersion);
}

function resolveLatestObservation(
  observations: readonly DiscomfortObservation[],
): ResolvedDiscomfortObservationSummary {
  const latest = observations.at(-1)!;
  const sources = new Set<DiscomfortObservationId>([latest.observationId]);
  const severity = resolveField(
    observations,
    ({ severity }) => severity,
    (value) => value === null,
  );
  const trend = resolveField(
    observations,
    ({ trend }) => trend,
    (value) => value === 'unknown',
  );
  const movement = resolveField(
    observations,
    (observation) => ({
      status: observation.movementTriggerStatus,
      triggers: observation.movementTriggers,
    }),
    ({ status }) => status === 'unknown',
  );
  const safety = {
    traumaticOrSuddenOnset: resolveSafetyField(observations, 'traumaticOrSuddenOnset', sources),
    swelling: resolveSafetyField(observations, 'swelling', sources),
    instabilityOrGivingWay: resolveSafetyField(observations, 'instabilityOrGivingWay', sources),
    weightBearingLimitation: resolveSafetyField(observations, 'weightBearingLimitation', sources),
    visibleDeformity: resolveSafetyField(observations, 'visibleDeformity', sources),
    numbnessOrWeakness: resolveSafetyField(observations, 'numbnessOrWeakness', sources),
    chestPainOrBreathingDifficulty: resolveSafetyField(
      observations,
      'chestPainOrBreathingDifficulty',
      sources,
    ),
    fainting: resolveSafetyField(observations, 'fainting', sources),
    severeSystemicSymptoms: resolveSafetyField(observations, 'severeSystemicSymptoms', sources),
  };
  sources.add(severity.sourceObservationId);
  sources.add(trend.sourceObservationId);
  sources.add(movement.sourceObservationId);

  return {
    latestObservationId: latest.observationId,
    sourceObservationIds: observations
      .filter(({ observationId }) => sources.has(observationId))
      .map(({ observationId }) => observationId),
    observedAt: latest.observedAt,
    severity: severity.value,
    trend: trend.value,
    movementTriggerStatus: movement.value.status,
    movementTriggers: [...movement.value.triggers],
    safety,
  };
}

function resolveSafetyField(
  observations: readonly DiscomfortObservation[],
  field: keyof DiscomfortSafetyObservations,
  sources: Set<DiscomfortObservationId>,
): PainSafetyTriState {
  const resolved = resolveField(
    observations,
    (observation) => observation.safety[field],
    (value) => value === 'unknown',
  );
  sources.add(resolved.sourceObservationId);
  return resolved.value;
}

function resolveField<Value>(
  observations: readonly DiscomfortObservation[],
  select: (observation: DiscomfortObservation) => Value,
  isUnknown: (value: Value) => boolean,
): { readonly value: Value; readonly sourceObservationId: DiscomfortObservationId } {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const observation = observations[index]!;
    const value = select(observation);
    if (!isUnknown(value)) {
      return { value, sourceObservationId: observation.observationId };
    }
  }
  const latest = observations.at(-1)!;
  return { value: select(latest), sourceObservationId: latest.observationId };
}

function isAnswered(
  questionCode: PainSafetyMissingQuestionCode,
  observation: ResolvedDiscomfortObservationSummary,
): boolean {
  switch (questionCode) {
    case 'severity':
      return observation.severity !== null;
    case 'traumatic_or_sudden_onset':
      return observation.safety.traumaticOrSuddenOnset !== 'unknown';
    case 'swelling':
      return observation.safety.swelling !== 'unknown';
    case 'instability_or_giving_way':
      return observation.safety.instabilityOrGivingWay !== 'unknown';
    case 'weight_bearing_limitation':
      return observation.safety.weightBearingLimitation !== 'unknown';
    case 'visible_deformity':
      return observation.safety.visibleDeformity !== 'unknown';
    case 'numbness_or_weakness':
      return observation.safety.numbnessOrWeakness !== 'unknown';
    case 'systemic_warning_signals':
      return (
        observation.safety.chestPainOrBreathingDifficulty !== 'unknown' &&
        observation.safety.fainting !== 'unknown' &&
        observation.safety.severeSystemicSymptoms !== 'unknown'
      );
    case 'movement_trigger':
      return observation.movementTriggerStatus !== 'unknown';
    case 'symptom_trend':
      return observation.trend !== 'unknown';
  }
}

function validateMissingInformationRuleSet(
  ruleSet: PainSafetyMissingInformationRuleSet,
  expectedRuleSetVersion?: RuleSetVersion,
): PainSafetyMissingInformationRuleSetFailure | null {
  const reasons = new Set<PainSafetyMissingInformationRuleSetFailureCode>();
  if (!parseVersionIdentifier(ruleSet.contractVersion, 'contract').ok) {
    reasons.add('invalid_rule_contract_version');
  }
  if (!parseVersionIdentifier(ruleSet.ruleSetVersion, 'rule-set').ok) {
    reasons.add('invalid_rule_set_version');
  }
  if (expectedRuleSetVersion !== undefined && ruleSet.ruleSetVersion !== expectedRuleSetVersion) {
    reasons.add('rule_set_version_mismatch');
  }
  if (!parseVersionIdentifier(ruleSet.questionBatch.contractVersion, 'contract').ok) {
    reasons.add('invalid_question_batch_contract_version');
  }
  if (
    !Number.isInteger(ruleSet.questionBatch.maximumQuestions) ||
    ruleSet.questionBatch.maximumQuestions < 1 ||
    ruleSet.questionBatch.maximumQuestions > maximumPainSafetyQuestionsPerBatch
  ) {
    reasons.add('invalid_maximum_questions_per_batch');
  }
  if (ruleSet.questions.length === 0) {
    reasons.add('empty_question_rules');
  }
  const questionCodes = new Set<PainSafetyMissingQuestionCode>();
  ruleSet.questions.forEach((rule) => {
    if (!(painSafetyMissingQuestionCodes as readonly unknown[]).includes(rule.questionCode)) {
      reasons.add('unsupported_question_code');
      return;
    }
    if (questionCodes.has(rule.questionCode)) {
      reasons.add('duplicate_question_code');
    }
    questionCodes.add(rule.questionCode);
    if (!Number.isInteger(rule.priority) || rule.priority < 0) {
      reasons.add('invalid_priority');
    }
    if (!(painSafetyExpectedAnswerTypes as readonly unknown[]).includes(rule.expectedAnswerType)) {
      reasons.add('invalid_expected_answer_type');
    }
    const metadata = questionMetadata[rule.questionCode];
    if (
      metadata === undefined ||
      metadata.expectedAnswerType !== rule.expectedAnswerType ||
      metadata.relatedField !== rule.relatedField
    ) {
      reasons.add('invalid_related_field');
    }
  });
  if (reasons.size === 0) {
    return null;
  }
  return {
    status: 'failure',
    code: 'INVALID_MISSING_INFORMATION_RULE_SET',
    reasonCodes: painSafetyMissingInformationRuleSetFailureCodes.filter((reason) =>
      reasons.has(reason),
    ),
  };
}

function question(
  questionCode: PainSafetyMissingQuestionCode,
  priority: number,
  expectedAnswerType: PainSafetyExpectedAnswerType,
  relatedField: string,
): PainSafetyMissingInformationRule {
  return { questionCode, priority, expectedAnswerType, relatedField };
}

const questionMetadata: Readonly<
  Record<
    PainSafetyMissingQuestionCode,
    { readonly expectedAnswerType: PainSafetyExpectedAnswerType; readonly relatedField: string }
  >
> = Object.fromEntries(
  defaultPainSafetyMissingInformationRuleSet.questions.map(
    ({ questionCode, expectedAnswerType, relatedField }) => [
      questionCode,
      { expectedAnswerType, relatedField },
    ],
  ),
) as Record<
  PainSafetyMissingQuestionCode,
  { readonly expectedAnswerType: PainSafetyExpectedAnswerType; readonly relatedField: string }
>;

function questionCodeOrder(questionCode: PainSafetyMissingQuestionCode): number {
  return painSafetyMissingQuestionCodes.indexOf(questionCode);
}
