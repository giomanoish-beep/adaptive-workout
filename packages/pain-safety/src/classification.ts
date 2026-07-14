import {
  parseVersionIdentifier,
  type ContractVersion,
  type RuleSetVersion,
} from '@adaptive-workout/domain';
import {
  discomfortTrends,
  painSafetyMissingQuestionCodes,
  painSafetyReportedStopSignalCodes,
  type DiscomfortEventContract,
  type DiscomfortSafetyObservations,
  type DiscomfortTrend,
  type PainSafetyClassificationOutput,
  type PainSafetyClassificationEvaluation,
  type PainSafetyClassificationReasonCode,
  type PainSafetyMissingQuestionCode,
  type PainSafetyReportedStopSignalCode,
} from './contracts.js';
import {
  defaultPainSafetyMissingInformationRuleSet,
  evaluateMissingDiscomfortInformation,
  type PainSafetyMissingInformationEvaluation,
  type PainSafetyMissingInformationRuleSet,
  type PainSafetyMissingInformationRuleSetFailure,
} from './missing-information.js';
import type { PainSafetyValidationFailure } from './validation.js';

export interface PainSafetyStopSignalRule {
  readonly signalCode: PainSafetyReportedStopSignalCode;
  readonly priority: number;
}

export interface PainSafetyClassificationRuleSet {
  readonly contractVersion: ContractVersion;
  readonly ruleSetVersion: RuleSetVersion;
  readonly missingInformationRuleSet: PainSafetyMissingInformationRuleSet;
  readonly requiredQuestionCodes: readonly PainSafetyMissingQuestionCode[];
  readonly stopSignalRules: readonly PainSafetyStopSignalRule[];
  readonly severeSeverityThreshold: number;
  readonly severeSeverityPriority: number;
  readonly stopOnWorsening: boolean;
  readonly worseningTrendPriority: number;
  readonly maximumGreenSeverity: number;
  readonly greenTrends: readonly DiscomfortTrend[];
}

export const painSafetyClassificationRuleSetFailureCodes = [
  'invalid_rule_contract_version',
  'invalid_rule_set_version',
  'rule_set_version_mismatch',
  'missing_rule_set_version_mismatch',
  'empty_required_question_codes',
  'duplicate_required_question_code',
  'unsupported_required_question_code',
  'required_question_not_configured',
  'empty_stop_signal_rules',
  'duplicate_stop_signal_code',
  'unsupported_stop_signal_code',
  'invalid_priority',
  'invalid_severe_severity_threshold',
  'invalid_maximum_green_severity',
  'invalid_stop_on_worsening',
  'empty_green_trends',
  'duplicate_green_trend',
  'invalid_green_trend',
] as const;

export type PainSafetyClassificationRuleSetFailureCode =
  (typeof painSafetyClassificationRuleSetFailureCodes)[number];

export interface PainSafetyClassificationRuleSetFailure {
  readonly status: 'failure';
  readonly code: 'INVALID_PAIN_SAFETY_CLASSIFICATION_RULE_SET';
  readonly reasonCodes: readonly PainSafetyClassificationRuleSetFailureCode[];
}

export type PainSafetyClassificationResult =
  | { readonly ok: true; readonly value: PainSafetyClassificationEvaluation }
  | {
      readonly ok: false;
      readonly failure:
        | PainSafetyValidationFailure
        | PainSafetyMissingInformationRuleSetFailure
        | PainSafetyClassificationRuleSetFailure;
    };

export const painSafetyClassificationContractVersion =
  'pain-safety-classification-v3' as ContractVersion;

export const defaultPainSafetyClassificationRuleSet: PainSafetyClassificationRuleSet = {
  contractVersion: 'pain-safety-classification-rules-v1' as ContractVersion,
  ruleSetVersion: 'pain-safety-rules-v2' as RuleSetVersion,
  missingInformationRuleSet: defaultPainSafetyMissingInformationRuleSet,
  requiredQuestionCodes: [...painSafetyMissingQuestionCodes],
  stopSignalRules: [
    stopSignal('traumatic_or_sudden_onset', 10),
    stopSignal('major_weight_bearing_limitation', 20),
    stopSignal('visible_deformity', 30),
    stopSignal('significant_swelling', 40),
    stopSignal('instability_or_giving_way', 50),
    stopSignal('numbness_or_weakness', 60),
    stopSignal('systemic_warning_signal', 70),
  ],
  severeSeverityThreshold: 8,
  severeSeverityPriority: 80,
  stopOnWorsening: true,
  worseningTrendPriority: 90,
  maximumGreenSeverity: 1,
  greenTrends: ['improving', 'unchanged', 'resolved'],
};

export function classifyDiscomfortEvent(
  event: DiscomfortEventContract,
  ruleSet: PainSafetyClassificationRuleSet,
): PainSafetyClassificationResult {
  const missingInformationResult = evaluateMissingDiscomfortInformation(
    event,
    ruleSet.missingInformationRuleSet,
  );
  if (!missingInformationResult.ok) {
    return missingInformationResult;
  }
  const ruleSetFailure = validatePainSafetyClassificationRuleSet(
    ruleSet,
    event.version.ruleSetVersion,
  );
  if (ruleSetFailure !== null) {
    return { ok: false, failure: ruleSetFailure };
  }

  const evaluation = missingInformationResult.value;
  const reportedStopSignals = resolveReportedStopSignals(
    evaluation.resolvedObservation.safety,
    ruleSet.stopSignalRules,
  );
  const stopReasons = resolveStopReasons(evaluation, reportedStopSignals, ruleSet);
  if (stopReasons.length > 0) {
    return successOutput('STOP', stopReasons, reportedStopSignals, evaluation);
  }

  const requiredInformationMissing = evaluation.missingInformation.some(({ questionCode }) =>
    ruleSet.requiredQuestionCodes.includes(questionCode),
  );
  if (requiredInformationMissing) {
    return informationRequiredOutput(reportedStopSignals, evaluation);
  }

  const adaptReasons = resolveAdaptReasons(evaluation, ruleSet);
  if (adaptReasons.length > 0) {
    return successOutput('ADAPT', adaptReasons, reportedStopSignals, evaluation);
  }

  return successOutput(
    'GREEN',
    ['NO_RULE_BASED_RESTRICTION_FOUND'],
    reportedStopSignals,
    evaluation,
  );
}

export function validatePainSafetyClassificationRuleSet(
  ruleSet: PainSafetyClassificationRuleSet,
  expectedRuleSetVersion?: RuleSetVersion,
): PainSafetyClassificationRuleSetFailure | null {
  const reasons = new Set<PainSafetyClassificationRuleSetFailureCode>();
  if (!parseVersionIdentifier(ruleSet.contractVersion, 'contract').ok) {
    reasons.add('invalid_rule_contract_version');
  }
  if (!parseVersionIdentifier(ruleSet.ruleSetVersion, 'rule-set').ok) {
    reasons.add('invalid_rule_set_version');
  }
  if (expectedRuleSetVersion !== undefined && ruleSet.ruleSetVersion !== expectedRuleSetVersion) {
    reasons.add('rule_set_version_mismatch');
  }
  if (ruleSet.missingInformationRuleSet.ruleSetVersion !== ruleSet.ruleSetVersion) {
    reasons.add('missing_rule_set_version_mismatch');
  }
  validateRequiredQuestions(ruleSet, reasons);
  validateStopSignals(ruleSet, reasons);
  if (
    !Number.isInteger(ruleSet.severeSeverityThreshold) ||
    ruleSet.severeSeverityThreshold < 1 ||
    ruleSet.severeSeverityThreshold > 10
  ) {
    reasons.add('invalid_severe_severity_threshold');
  }
  if (
    !Number.isInteger(ruleSet.maximumGreenSeverity) ||
    ruleSet.maximumGreenSeverity < 0 ||
    ruleSet.maximumGreenSeverity >= ruleSet.severeSeverityThreshold
  ) {
    reasons.add('invalid_maximum_green_severity');
  }
  if (typeof ruleSet.stopOnWorsening !== 'boolean') {
    reasons.add('invalid_stop_on_worsening');
  }
  if (
    !Number.isInteger(ruleSet.severeSeverityPriority) ||
    ruleSet.severeSeverityPriority < 0 ||
    !Number.isInteger(ruleSet.worseningTrendPriority) ||
    ruleSet.worseningTrendPriority < 0
  ) {
    reasons.add('invalid_priority');
  }
  validateGreenTrends(ruleSet.greenTrends, reasons);

  return reasons.size === 0
    ? null
    : {
        status: 'failure',
        code: 'INVALID_PAIN_SAFETY_CLASSIFICATION_RULE_SET',
        reasonCodes: painSafetyClassificationRuleSetFailureCodes.filter((code) =>
          reasons.has(code),
        ),
      };
}

function resolveReportedStopSignals(
  safety: DiscomfortSafetyObservations,
  rules: readonly PainSafetyStopSignalRule[],
): readonly PainSafetyReportedStopSignalCode[] {
  return [...rules]
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        painSafetyReportedStopSignalCodes.indexOf(left.signalCode) -
          painSafetyReportedStopSignalCodes.indexOf(right.signalCode),
    )
    .filter(({ signalCode }) => isStopSignalPresent(signalCode, safety))
    .map(({ signalCode }) => signalCode);
}

function resolveStopReasons(
  evaluation: PainSafetyMissingInformationEvaluation,
  reportedSignals: readonly PainSafetyReportedStopSignalCode[],
  ruleSet: PainSafetyClassificationRuleSet,
): readonly PainSafetyClassificationReasonCode[] {
  const priorities = new Map(
    ruleSet.stopSignalRules.map(({ signalCode, priority }) => [signalCode, priority]),
  );
  const reasons = reportedSignals.map((signalCode) => ({
    reasonCode: stopSignalReasonCodes[signalCode],
    priority: priorities.get(signalCode)!,
  }));
  if (
    evaluation.resolvedObservation.severity !== null &&
    evaluation.resolvedObservation.severity >= ruleSet.severeSeverityThreshold
  ) {
    reasons.push({
      reasonCode: 'SEVERE_REPORTED_DISCOMFORT',
      priority: ruleSet.severeSeverityPriority,
    });
  }
  if (ruleSet.stopOnWorsening && evaluation.resolvedObservation.trend === 'worsening') {
    reasons.push({ reasonCode: 'WORSENING_REPORTED', priority: ruleSet.worseningTrendPriority });
  }
  return reasons
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        reasonCodeOrder(left.reasonCode) - reasonCodeOrder(right.reasonCode),
    )
    .map(({ reasonCode }) => reasonCode);
}

function resolveAdaptReasons(
  evaluation: PainSafetyMissingInformationEvaluation,
  ruleSet: PainSafetyClassificationRuleSet,
): readonly PainSafetyClassificationReasonCode[] {
  const reasons: PainSafetyClassificationReasonCode[] = [];
  if (
    evaluation.resolvedObservation.severity !== null &&
    evaluation.resolvedObservation.severity > ruleSet.maximumGreenSeverity
  ) {
    reasons.push('REPORTED_DISCOMFORT_PRESENT');
  }
  if (evaluation.resolvedObservation.movementTriggerStatus === 'present') {
    reasons.push('MOVEMENT_AGGRAVATION_REPORTED');
  }
  if (!ruleSet.greenTrends.includes(evaluation.resolvedObservation.trend)) {
    reasons.push('REPORTED_DISCOMFORT_PRESENT');
  }
  return [...new Set(reasons)];
}

function successOutput(
  classification: PainSafetyClassificationOutput['classification'],
  reasonCodes: readonly PainSafetyClassificationReasonCode[],
  reportedStopSignals: readonly PainSafetyReportedStopSignalCode[],
  evaluation: PainSafetyMissingInformationEvaluation,
): PainSafetyClassificationResult {
  const resolved = evaluation.resolvedObservation;
  return {
    ok: true,
    value: {
      status: 'classified',
      contractVersion: painSafetyClassificationContractVersion,
      subjectId: evaluation.subjectId,
      eventId: evaluation.eventId,
      sourceObservationIds: [...resolved.sourceObservationIds],
      classification,
      reasonCodes,
      missingInformation: [...evaluation.missingInformation],
      currentQuestionBatch: [...evaluation.currentQuestionBatch],
      evidence: {
        severity: resolved.severity,
        trend: resolved.trend,
        movementTriggerStatus: resolved.movementTriggerStatus,
        movementTriggers: [...resolved.movementTriggers],
        safety: { ...resolved.safety },
        reportedStopSignals,
      },
      constraints: [],
      version: evaluation.version,
      classifiedAt: evaluation.evaluatedAt,
    },
  };
}

function informationRequiredOutput(
  reportedStopSignals: readonly PainSafetyReportedStopSignalCode[],
  evaluation: PainSafetyMissingInformationEvaluation,
): PainSafetyClassificationResult {
  const resolved = evaluation.resolvedObservation;
  return {
    ok: true,
    value: {
      status: 'information_required',
      contractVersion: painSafetyClassificationContractVersion,
      subjectId: evaluation.subjectId,
      eventId: evaluation.eventId,
      sourceObservationIds: [...resolved.sourceObservationIds],
      reasonCodes: ['REQUIRED_INFORMATION_UNAVAILABLE'],
      missingInformation: [...evaluation.missingInformation],
      currentQuestionBatch: [...evaluation.currentQuestionBatch],
      evidence: {
        severity: resolved.severity,
        trend: resolved.trend,
        movementTriggerStatus: resolved.movementTriggerStatus,
        movementTriggers: [...resolved.movementTriggers],
        safety: { ...resolved.safety },
        reportedStopSignals,
      },
      version: evaluation.version,
      evaluatedAt: evaluation.evaluatedAt,
    },
  };
}

function validateRequiredQuestions(
  ruleSet: PainSafetyClassificationRuleSet,
  reasons: Set<PainSafetyClassificationRuleSetFailureCode>,
): void {
  if (ruleSet.requiredQuestionCodes.length === 0) {
    reasons.add('empty_required_question_codes');
  }
  const configured = new Set(
    ruleSet.missingInformationRuleSet.questions.map(({ questionCode }) => questionCode),
  );
  const seen = new Set<PainSafetyMissingQuestionCode>();
  ruleSet.requiredQuestionCodes.forEach((questionCode) => {
    if (!(painSafetyMissingQuestionCodes as readonly unknown[]).includes(questionCode)) {
      reasons.add('unsupported_required_question_code');
      return;
    }
    if (seen.has(questionCode)) {
      reasons.add('duplicate_required_question_code');
    }
    if (!configured.has(questionCode)) {
      reasons.add('required_question_not_configured');
    }
    seen.add(questionCode);
  });
}

function validateStopSignals(
  ruleSet: PainSafetyClassificationRuleSet,
  reasons: Set<PainSafetyClassificationRuleSetFailureCode>,
): void {
  if (ruleSet.stopSignalRules.length === 0) {
    reasons.add('empty_stop_signal_rules');
  }
  const seen = new Set<PainSafetyReportedStopSignalCode>();
  ruleSet.stopSignalRules.forEach(({ signalCode, priority }) => {
    if (!(painSafetyReportedStopSignalCodes as readonly unknown[]).includes(signalCode)) {
      reasons.add('unsupported_stop_signal_code');
      return;
    }
    if (seen.has(signalCode)) {
      reasons.add('duplicate_stop_signal_code');
    }
    if (!Number.isInteger(priority) || priority < 0) {
      reasons.add('invalid_priority');
    }
    seen.add(signalCode);
  });
}

function validateGreenTrends(
  trends: readonly DiscomfortTrend[],
  reasons: Set<PainSafetyClassificationRuleSetFailureCode>,
): void {
  if (trends.length === 0) {
    reasons.add('empty_green_trends');
  }
  const seen = new Set<DiscomfortTrend>();
  trends.forEach((trend) => {
    if (!(discomfortTrends as readonly unknown[]).includes(trend) || trend === 'unknown') {
      reasons.add('invalid_green_trend');
    }
    if (seen.has(trend)) {
      reasons.add('duplicate_green_trend');
    }
    seen.add(trend);
  });
}

function isStopSignalPresent(
  signalCode: PainSafetyReportedStopSignalCode,
  safety: DiscomfortSafetyObservations,
): boolean {
  switch (signalCode) {
    case 'traumatic_or_sudden_onset':
      return safety.traumaticOrSuddenOnset === 'present';
    case 'major_weight_bearing_limitation':
      return safety.weightBearingLimitation === 'present';
    case 'visible_deformity':
      return safety.visibleDeformity === 'present';
    case 'significant_swelling':
      return safety.swelling === 'present';
    case 'instability_or_giving_way':
      return safety.instabilityOrGivingWay === 'present';
    case 'numbness_or_weakness':
      return safety.numbnessOrWeakness === 'present';
    case 'systemic_warning_signal':
      return (
        safety.chestPainOrBreathingDifficulty === 'present' ||
        safety.fainting === 'present' ||
        safety.severeSystemicSymptoms === 'present'
      );
  }
}

function stopSignal(
  signalCode: PainSafetyReportedStopSignalCode,
  priority: number,
): PainSafetyStopSignalRule {
  return { signalCode, priority };
}

const stopSignalReasonCodes: Readonly<
  Record<PainSafetyReportedStopSignalCode, PainSafetyClassificationReasonCode>
> = {
  traumatic_or_sudden_onset: 'TRAUMATIC_OR_SUDDEN_ONSET_REPORTED',
  major_weight_bearing_limitation: 'MAJOR_WEIGHT_BEARING_LIMITATION_REPORTED',
  visible_deformity: 'VISIBLE_DEFORMITY_REPORTED',
  significant_swelling: 'SIGNIFICANT_SWELLING_REPORTED',
  instability_or_giving_way: 'INSTABILITY_OR_GIVING_WAY_REPORTED',
  numbness_or_weakness: 'NUMBNESS_OR_WEAKNESS_REPORTED',
  systemic_warning_signal: 'SYSTEMIC_WARNING_SIGNAL_REPORTED',
};

function reasonCodeOrder(reasonCode: PainSafetyClassificationReasonCode): number {
  return stopReasonCodeOrder.indexOf(reasonCode);
}

const stopReasonCodeOrder: readonly PainSafetyClassificationReasonCode[] = [
  ...Object.values(stopSignalReasonCodes),
  'SEVERE_REPORTED_DISCOMFORT',
  'WORSENING_REPORTED',
];
