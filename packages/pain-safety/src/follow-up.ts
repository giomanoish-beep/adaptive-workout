import {
  parseVersionIdentifier,
  type ContractVersion,
  type RuleSetVersion,
} from '@adaptive-workout/domain';
import {
  type DiscomfortEventContract,
  type DiscomfortObservation,
  type DiscomfortObservationId,
  type DiscomfortSafetyObservations,
  type PainSafetyClassificationEvaluation,
  type PainSafetyReportedStopSignalCode,
} from './contracts.js';
import {
  classifyDiscomfortEvent,
  defaultPainSafetyClassificationRuleSet,
  validatePainSafetyClassificationRuleSet,
  type PainSafetyClassificationResult,
  type PainSafetyClassificationRuleSet,
  type PainSafetyClassificationRuleSetFailure,
} from './classification.js';
import { validateDiscomfortEventContract } from './validation.js';

export const painSafetyFollowUpStatuses = [
  'unresolved',
  'improving',
  'unchanged',
  'worsening',
  'resolved',
] as const;
export type PainSafetyFollowUpStatus = (typeof painSafetyFollowUpStatuses)[number];

export const painSafetyAdaptationReviewSignals = [
  'none',
  'retain',
  'review_for_relaxation',
  'regenerate',
] as const;
export type PainSafetyAdaptationReviewSignal = (typeof painSafetyAdaptationReviewSignals)[number];

export const painSafetyFollowUpReasonCodes = [
  'FOLLOW_UP_INFORMATION_UNRESOLVED',
  'MATERIAL_SEVERITY_DECREASE_REPORTED',
  'IMPROVING_TREND_REPORTED',
  'STABLE_SEVERITY_REPORTED',
  'UNCHANGED_TREND_REPORTED',
  'MATERIAL_SEVERITY_INCREASE_REPORTED',
  'WORSENING_TREND_REPORTED',
  'NEW_STOP_SIGNAL_REPORTED',
  'EXPLICIT_RESOLUTION_REPORTED',
  'RECURRENT_DISCOMFORT_CONTEXT_REPORTED',
] as const;
export type PainSafetyFollowUpReasonCode = (typeof painSafetyFollowUpReasonCodes)[number];

export interface PainSafetyFollowUpRuleSet {
  readonly contractVersion: ContractVersion;
  readonly ruleSetVersion: RuleSetVersion;
  readonly classificationRuleSet: PainSafetyClassificationRuleSet;
  readonly materialSeverityChangeThreshold: number;
  readonly stableSeverityTolerance: number;
  readonly resolution: {
    readonly requireResolvedTrend: boolean;
    readonly requireZeroSeverity: boolean;
    readonly requireAbsentMovementTrigger: boolean;
  };
  readonly reassessment: {
    readonly onMaterialSeverityChange: boolean;
    readonly onExplicitTrendChange: boolean;
    readonly onNewStopSignal: boolean;
    readonly onResolution: boolean;
    readonly onRecurrence: boolean;
  };
}

export interface PainSafetySeverityComparisonEvidence {
  readonly previousSeverity: number | null;
  readonly currentSeverity: number | null;
  readonly change: number | null;
}

export interface PainSafetyFollowUpEvaluation {
  readonly status: 'success';
  readonly contractVersion: ContractVersion;
  readonly eventId: DiscomfortEventContract['eventId'];
  readonly previousRelevantEventId: DiscomfortEventContract['eventId'] | null;
  readonly sourceObservationIds: readonly DiscomfortObservationId[];
  readonly followUpStatus: PainSafetyFollowUpStatus;
  readonly reasonCodes: readonly PainSafetyFollowUpReasonCode[];
  readonly severityComparison: PainSafetySeverityComparisonEvidence;
  readonly latestReportedSafety: DiscomfortSafetyObservations;
  readonly newlyPresentStopSignals: readonly PainSafetyReportedStopSignalCode[];
  readonly reassessmentRequired: boolean;
  readonly adaptationReview: PainSafetyAdaptationReviewSignal;
  readonly version: DiscomfortEventContract['version'];
  readonly evaluatedAt: string;
}

export const painSafetyFollowUpRuleSetFailureCodes = [
  'invalid_rule_contract_version',
  'invalid_rule_set_version',
  'rule_set_version_mismatch',
  'classification_rule_set_version_mismatch',
  'invalid_material_severity_change_threshold',
  'invalid_stable_severity_tolerance',
  'contradictory_severity_thresholds',
  'invalid_resolution_rule',
  'invalid_reassessment_rule',
] as const;
export type PainSafetyFollowUpRuleSetFailureCode =
  (typeof painSafetyFollowUpRuleSetFailureCodes)[number];

export interface PainSafetyFollowUpRuleSetFailure {
  readonly status: 'failure';
  readonly code: 'INVALID_PAIN_SAFETY_FOLLOW_UP_RULE_SET';
  readonly reasonCodes: readonly PainSafetyFollowUpRuleSetFailureCode[];
}

export const painSafetyFollowUpHistoryFailureCodes = [
  'duplicate_event_id',
  'current_event_in_previous_history',
  'future_previous_event',
] as const;
export type PainSafetyFollowUpHistoryFailureCode =
  (typeof painSafetyFollowUpHistoryFailureCodes)[number];

export interface PainSafetyFollowUpHistoryFailure {
  readonly status: 'failure';
  readonly code: 'INVALID_PAIN_SAFETY_FOLLOW_UP_HISTORY';
  readonly reasonCodes: readonly PainSafetyFollowUpHistoryFailureCode[];
}

type PainSafetyClassificationFailure = Extract<
  PainSafetyClassificationResult,
  { readonly ok: false }
>['failure'];

export type PainSafetyFollowUpResult =
  | { readonly ok: true; readonly value: PainSafetyFollowUpEvaluation }
  | {
      readonly ok: false;
      readonly failure:
        | PainSafetyClassificationFailure
        | PainSafetyFollowUpRuleSetFailure
        | PainSafetyFollowUpHistoryFailure;
    };

export const painSafetyFollowUpContractVersion = 'pain-safety-follow-up-v1' as ContractVersion;

export const defaultPainSafetyFollowUpRuleSet: PainSafetyFollowUpRuleSet = {
  contractVersion: 'pain-safety-follow-up-rules-v1' as ContractVersion,
  ruleSetVersion: 'pain-safety-rules-v2' as RuleSetVersion,
  classificationRuleSet: defaultPainSafetyClassificationRuleSet,
  materialSeverityChangeThreshold: 2,
  stableSeverityTolerance: 1,
  resolution: {
    requireResolvedTrend: true,
    requireZeroSeverity: true,
    requireAbsentMovementTrigger: true,
  },
  reassessment: {
    onMaterialSeverityChange: true,
    onExplicitTrendChange: true,
    onNewStopSignal: true,
    onResolution: true,
    onRecurrence: true,
  },
};

export function evaluateDiscomfortFollowUp(
  event: DiscomfortEventContract,
  previousEvents: readonly DiscomfortEventContract[],
  ruleSet: PainSafetyFollowUpRuleSet,
): PainSafetyFollowUpResult {
  const eventValidation = validateDiscomfortEventContract(event);
  if (!eventValidation.ok) {
    return eventValidation;
  }
  for (const previousEvent of previousEvents) {
    const validation = validateDiscomfortEventContract(previousEvent);
    if (!validation.ok) {
      return validation;
    }
  }
  const historyFailure = validateHistory(event, previousEvents);
  if (historyFailure !== null) {
    return { ok: false, failure: historyFailure };
  }
  const ruleSetFailure = validatePainSafetyFollowUpRuleSet(ruleSet, event.version.ruleSetVersion);
  if (ruleSetFailure !== null) {
    return { ok: false, failure: ruleSetFailure };
  }

  const currentClassification = classification(event, ruleSet.classificationRuleSet);
  if (!currentClassification.ok) {
    return currentClassification;
  }
  const recurrence = findRecurrence(event, previousEvents, ruleSet);
  if (!recurrence.ok) {
    return recurrence;
  }
  if (recurrence.value !== null) {
    const latest = event.observations.at(-1)!;
    return success(
      event,
      recurrence.value.eventId,
      [...recurrence.value.sourceObservationIds, latest.observationId],
      'unresolved',
      ['RECURRENT_DISCOMFORT_CONTEXT_REPORTED'],
      severityEvidence(null, latest.severity),
      currentClassification.value.evidence.reportedStopSignals,
      ruleSet.reassessment.onRecurrence,
      'regenerate',
    );
  }

  return evaluateWithinEventFollowUp(event, currentClassification.value, ruleSet);
}

export function validatePainSafetyFollowUpRuleSet(
  ruleSet: PainSafetyFollowUpRuleSet,
  expectedRuleSetVersion?: RuleSetVersion,
): PainSafetyFollowUpRuleSetFailure | PainSafetyClassificationRuleSetFailure | null {
  const reasons = new Set<PainSafetyFollowUpRuleSetFailureCode>();
  if (!parseVersionIdentifier(ruleSet.contractVersion, 'contract').ok) {
    reasons.add('invalid_rule_contract_version');
  }
  if (!parseVersionIdentifier(ruleSet.ruleSetVersion, 'rule-set').ok) {
    reasons.add('invalid_rule_set_version');
  }
  if (expectedRuleSetVersion !== undefined && ruleSet.ruleSetVersion !== expectedRuleSetVersion) {
    reasons.add('rule_set_version_mismatch');
  }
  if (ruleSet.classificationRuleSet.ruleSetVersion !== ruleSet.ruleSetVersion) {
    reasons.add('classification_rule_set_version_mismatch');
  }
  const classificationFailure = validatePainSafetyClassificationRuleSet(
    ruleSet.classificationRuleSet,
    ruleSet.ruleSetVersion,
  );
  if (classificationFailure !== null) {
    return classificationFailure;
  }
  if (
    !Number.isInteger(ruleSet.materialSeverityChangeThreshold) ||
    ruleSet.materialSeverityChangeThreshold < 1 ||
    ruleSet.materialSeverityChangeThreshold > 10
  ) {
    reasons.add('invalid_material_severity_change_threshold');
  }
  if (
    !Number.isInteger(ruleSet.stableSeverityTolerance) ||
    ruleSet.stableSeverityTolerance < 0 ||
    ruleSet.stableSeverityTolerance > 10
  ) {
    reasons.add('invalid_stable_severity_tolerance');
  }
  if (ruleSet.stableSeverityTolerance >= ruleSet.materialSeverityChangeThreshold) {
    reasons.add('contradictory_severity_thresholds');
  }
  if (Object.values(ruleSet.resolution).some((value) => typeof value !== 'boolean')) {
    reasons.add('invalid_resolution_rule');
  }
  if (Object.values(ruleSet.reassessment).some((value) => typeof value !== 'boolean')) {
    reasons.add('invalid_reassessment_rule');
  }

  return reasons.size === 0
    ? null
    : {
        status: 'failure',
        code: 'INVALID_PAIN_SAFETY_FOLLOW_UP_RULE_SET',
        reasonCodes: painSafetyFollowUpRuleSetFailureCodes.filter((code) => reasons.has(code)),
      };
}

function evaluateWithinEventFollowUp(
  event: DiscomfortEventContract,
  currentClassification: PainSafetyClassificationEvaluation,
  ruleSet: PainSafetyFollowUpRuleSet,
): PainSafetyFollowUpResult {
  const latest = event.observations.at(-1)!;
  if (event.observations.length === 1) {
    return success(
      event,
      null,
      [latest.observationId],
      'unresolved',
      ['FOLLOW_UP_INFORMATION_UNRESOLVED'],
      severityEvidence(null, latest.severity),
      currentClassification.evidence.reportedStopSignals,
      false,
      'none',
    );
  }
  const priorEvent = { ...event, observations: event.observations.slice(0, -1) };
  const priorClassification = classification(priorEvent, ruleSet.classificationRuleSet);
  if (!priorClassification.ok) {
    return priorClassification;
  }
  const previousSeverity = priorClassification.value.evidence.severity;
  const comparison = severityEvidence(previousSeverity, latest.severity);
  const newlyPresentStopSignals = currentClassification.evidence.reportedStopSignals.filter(
    (signal) => !priorClassification.value.evidence.reportedStopSignals.includes(signal),
  );
  const sourceIds = sourceObservationIds(
    priorClassification.value.sourceObservationIds,
    latest.observationId,
  );

  if (isResolved(latest, ruleSet)) {
    return success(
      event,
      null,
      sourceIds,
      'resolved',
      ['EXPLICIT_RESOLUTION_REPORTED'],
      comparison,
      newlyPresentStopSignals,
      ruleSet.reassessment.onResolution,
      'review_for_relaxation',
    );
  }
  const worseningReasons = worseningReasonCodes(
    latest,
    comparison,
    newlyPresentStopSignals,
    ruleSet,
  );
  if (worseningReasons.length > 0) {
    return success(
      event,
      null,
      sourceIds,
      'worsening',
      worseningReasons,
      comparison,
      newlyPresentStopSignals,
      reassessmentForWorsening(worseningReasons, ruleSet),
      'regenerate',
    );
  }
  const improvingReasons = improvingReasonCodes(latest, comparison, ruleSet);
  if (improvingReasons.length > 0) {
    return success(
      event,
      null,
      sourceIds,
      'improving',
      improvingReasons,
      comparison,
      newlyPresentStopSignals,
      reassessmentForSeverityOrTrend(improvingReasons, ruleSet),
      'review_for_relaxation',
    );
  }
  const unchangedReasons = unchangedReasonCodes(latest, comparison, ruleSet);
  if (unchangedReasons.length > 0) {
    return success(
      event,
      null,
      sourceIds,
      'unchanged',
      unchangedReasons,
      comparison,
      newlyPresentStopSignals,
      false,
      'retain',
    );
  }
  return success(
    event,
    null,
    sourceIds,
    'unresolved',
    ['FOLLOW_UP_INFORMATION_UNRESOLVED'],
    comparison,
    newlyPresentStopSignals,
    false,
    'none',
  );
}

function worseningReasonCodes(
  latest: DiscomfortObservation,
  comparison: PainSafetySeverityComparisonEvidence,
  newlyPresentStopSignals: readonly PainSafetyReportedStopSignalCode[],
  ruleSet: PainSafetyFollowUpRuleSet,
): readonly PainSafetyFollowUpReasonCode[] {
  const reasons: PainSafetyFollowUpReasonCode[] = [];
  if (comparison.change !== null && comparison.change >= ruleSet.materialSeverityChangeThreshold) {
    reasons.push('MATERIAL_SEVERITY_INCREASE_REPORTED');
  }
  if (latest.trend === 'worsening') {
    reasons.push('WORSENING_TREND_REPORTED');
  }
  if (newlyPresentStopSignals.length > 0) {
    reasons.push('NEW_STOP_SIGNAL_REPORTED');
  }
  return reasons;
}

function improvingReasonCodes(
  latest: DiscomfortObservation,
  comparison: PainSafetySeverityComparisonEvidence,
  ruleSet: PainSafetyFollowUpRuleSet,
): readonly PainSafetyFollowUpReasonCode[] {
  const reasons: PainSafetyFollowUpReasonCode[] = [];
  if (comparison.change !== null && comparison.change <= -ruleSet.materialSeverityChangeThreshold) {
    reasons.push('MATERIAL_SEVERITY_DECREASE_REPORTED');
  }
  if (latest.trend === 'improving') {
    reasons.push('IMPROVING_TREND_REPORTED');
  }
  return reasons;
}

function unchangedReasonCodes(
  latest: DiscomfortObservation,
  comparison: PainSafetySeverityComparisonEvidence,
  ruleSet: PainSafetyFollowUpRuleSet,
): readonly PainSafetyFollowUpReasonCode[] {
  const reasons: PainSafetyFollowUpReasonCode[] = [];
  if (
    comparison.change !== null &&
    Math.abs(comparison.change) <= ruleSet.stableSeverityTolerance
  ) {
    reasons.push('STABLE_SEVERITY_REPORTED');
  }
  if (latest.trend === 'unchanged') {
    reasons.push('UNCHANGED_TREND_REPORTED');
  }
  return reasons;
}

function isResolved(latest: DiscomfortObservation, ruleSet: PainSafetyFollowUpRuleSet): boolean {
  return (
    (!ruleSet.resolution.requireResolvedTrend || latest.trend === 'resolved') &&
    (!ruleSet.resolution.requireZeroSeverity || latest.severity === 0) &&
    (!ruleSet.resolution.requireAbsentMovementTrigger || latest.movementTriggerStatus === 'absent')
  );
}

function reassessmentForWorsening(
  reasons: readonly PainSafetyFollowUpReasonCode[],
  ruleSet: PainSafetyFollowUpRuleSet,
): boolean {
  return (
    (ruleSet.reassessment.onMaterialSeverityChange &&
      reasons.includes('MATERIAL_SEVERITY_INCREASE_REPORTED')) ||
    (ruleSet.reassessment.onExplicitTrendChange && reasons.includes('WORSENING_TREND_REPORTED')) ||
    (ruleSet.reassessment.onNewStopSignal && reasons.includes('NEW_STOP_SIGNAL_REPORTED'))
  );
}

function reassessmentForSeverityOrTrend(
  reasons: readonly PainSafetyFollowUpReasonCode[],
  ruleSet: PainSafetyFollowUpRuleSet,
): boolean {
  return (
    (ruleSet.reassessment.onMaterialSeverityChange &&
      reasons.includes('MATERIAL_SEVERITY_DECREASE_REPORTED')) ||
    (ruleSet.reassessment.onExplicitTrendChange && reasons.includes('IMPROVING_TREND_REPORTED'))
  );
}

function findRecurrence(
  event: DiscomfortEventContract,
  previousEvents: readonly DiscomfortEventContract[],
  ruleSet: PainSafetyFollowUpRuleSet,
):
  | {
      readonly ok: true;
      readonly value: {
        readonly eventId: DiscomfortEventContract['eventId'];
        readonly sourceObservationIds: readonly DiscomfortObservationId[];
      } | null;
    }
  | { readonly ok: false; readonly failure: PainSafetyClassificationFailure } {
  const current = event.observations[0]!;
  const matches: {
    readonly eventId: DiscomfortEventContract['eventId'];
    readonly sourceObservationIds: readonly DiscomfortObservationId[];
    readonly occurredAt: string;
  }[] = [];
  for (const previousEvent of previousEvents) {
    const latest = previousEvent.observations.at(-1)!;
    if (
      latest.bodyArea !== current.bodyArea ||
      latest.side !== current.side ||
      !isResolved(latest, ruleSet)
    ) {
      continue;
    }
    const previousClassification = classification(previousEvent, ruleSet.classificationRuleSet);
    if (!previousClassification.ok) {
      return previousClassification;
    }
    matches.push({
      eventId: previousEvent.eventId,
      sourceObservationIds: previousClassification.value.sourceObservationIds,
      occurredAt: previousEvent.occurredAt,
    });
  }
  matches.sort(
    (left, right) =>
      Date.parse(right.occurredAt) - Date.parse(left.occurredAt) ||
      left.eventId.localeCompare(right.eventId),
  );
  return { ok: true, value: matches[0] ?? null };
}

function classification(
  event: DiscomfortEventContract,
  ruleSet: PainSafetyClassificationRuleSet,
): PainSafetyClassificationResult {
  return classifyDiscomfortEvent(event, ruleSet);
}

function severityEvidence(
  previousSeverity: number | null,
  currentSeverity: number | null,
): PainSafetySeverityComparisonEvidence {
  return {
    previousSeverity,
    currentSeverity,
    change:
      previousSeverity === null || currentSeverity === null
        ? null
        : currentSeverity - previousSeverity,
  };
}

function success(
  event: DiscomfortEventContract,
  previousRelevantEventId: DiscomfortEventContract['eventId'] | null,
  sourceObservationIdsValue: readonly DiscomfortObservationId[],
  followUpStatus: PainSafetyFollowUpStatus,
  reasonCodes: readonly PainSafetyFollowUpReasonCode[],
  severityComparison: PainSafetySeverityComparisonEvidence,
  newlyPresentStopSignals: readonly PainSafetyReportedStopSignalCode[],
  reassessmentRequired: boolean,
  adaptationReview: PainSafetyAdaptationReviewSignal,
): PainSafetyFollowUpResult {
  return {
    ok: true,
    value: {
      status: 'success',
      contractVersion: painSafetyFollowUpContractVersion,
      eventId: event.eventId,
      previousRelevantEventId,
      sourceObservationIds: [...new Set(sourceObservationIdsValue)],
      followUpStatus,
      reasonCodes,
      severityComparison,
      latestReportedSafety: { ...event.observations.at(-1)!.safety },
      newlyPresentStopSignals,
      reassessmentRequired,
      adaptationReview,
      version: event.version,
      evaluatedAt: event.evaluatedAt,
    },
  };
}

function sourceObservationIds(
  priorIds: readonly DiscomfortObservationId[],
  latestId: DiscomfortObservationId,
): readonly DiscomfortObservationId[] {
  return [...priorIds, latestId];
}

function validateHistory(
  event: DiscomfortEventContract,
  previousEvents: readonly DiscomfortEventContract[],
): PainSafetyFollowUpHistoryFailure | null {
  const reasons = new Set<PainSafetyFollowUpHistoryFailureCode>();
  const eventIds = new Set<string>();
  previousEvents.forEach((previousEvent) => {
    if (eventIds.has(previousEvent.eventId)) {
      reasons.add('duplicate_event_id');
    }
    if (previousEvent.eventId === event.eventId) {
      reasons.add('current_event_in_previous_history');
    }
    if (Date.parse(previousEvent.occurredAt) > Date.parse(event.occurredAt)) {
      reasons.add('future_previous_event');
    }
    eventIds.add(previousEvent.eventId);
  });
  return reasons.size === 0
    ? null
    : {
        status: 'failure',
        code: 'INVALID_PAIN_SAFETY_FOLLOW_UP_HISTORY',
        reasonCodes: painSafetyFollowUpHistoryFailureCodes.filter((code) => reasons.has(code)),
      };
}
