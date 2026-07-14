import { isUuid, parseVersionIdentifier } from '@adaptive-workout/domain';
import {
  discomfortActivityContexts,
  discomfortBodyAreas,
  discomfortBodySides,
  discomfortMovementPatterns,
  discomfortObservationKinds,
  discomfortOnsetPatterns,
  discomfortTrends,
  painSafetyClassificationReasonCodes,
  painSafetyClassifications,
  painSafetyExpectedAnswerTypes,
  painSafetyInformationRequiredReasonCodes,
  painSafetyMissingQuestionCodes,
  painSafetyReportedStopSignalCodes,
  painSafetyTriStateValues,
  requestedTrainingContexts,
  type DiscomfortEventContract,
  type DiscomfortMovementTrigger,
  type DiscomfortObservation,
  type DiscomfortObservationId,
  type PainSafetyAdaptationConstraint,
  type PainSafetyClassificationOutput,
  type PainSafetyInformationRequiredOutput,
} from './contracts.js';

export const painSafetyValidationReasonCodes = [
  'invalid_event_identity',
  'invalid_subject_identity',
  'invalid_observation_identity',
  'duplicate_observation_id',
  'observation_identity_mismatch',
  'invalid_reported_text',
  'invalid_body_area',
  'invalid_side',
  'invalid_severity',
  'invalid_tri_state',
  'invalid_controlled_value',
  'invalid_movement_trigger',
  'duplicate_movement_trigger',
  'malformed_chronology',
  'invalid_training_context',
  'invalid_version_contract',
  'contradictory_observation',
  'invalid_classification',
  'invalid_reason_codes',
  'invalid_missing_information_entry',
  'invalid_adaptation_constraint',
] as const;

export type PainSafetyValidationReasonCode = (typeof painSafetyValidationReasonCodes)[number];

export interface PainSafetyValidationFailure {
  readonly status: 'failure';
  readonly code: 'PAIN_SAFETY_CONTRACT_INVALID';
  readonly reasonCodes: readonly PainSafetyValidationReasonCode[];
  readonly relatedObservationIds: readonly DiscomfortObservationId[];
}

export type PainSafetyValidationResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly failure: PainSafetyValidationFailure };

export function validateDiscomfortEventContract(
  event: DiscomfortEventContract,
): PainSafetyValidationResult<DiscomfortEventContract> {
  const collector = new ValidationCollector();
  if (!isUuid(event.eventId)) {
    collector.add('invalid_event_identity');
  }
  if (!isUuid(event.subjectId)) {
    collector.add('invalid_subject_identity');
  }
  if (event.reportedText.trim().length === 0 || event.reportedText.trim().length > 4000) {
    collector.add('invalid_reported_text');
  }
  validateVersions(event.contractVersion, event.version, collector);
  const occurredAt = timestamp(event.occurredAt);
  const evaluatedAt = timestamp(event.evaluatedAt);
  if (occurredAt === null || evaluatedAt === null || evaluatedAt < occurredAt) {
    collector.add('malformed_chronology');
  }

  const observationIds = new Set<string>();
  let previousObservedAt = Number.NEGATIVE_INFINITY;
  event.observations.forEach((observation) => {
    if (observationIds.has(observation.observationId)) {
      collector.add('duplicate_observation_id', observation.observationId);
    }
    observationIds.add(observation.observationId);
    validateObservation(observation, event, occurredAt, evaluatedAt, collector);
    const observedAt = timestamp(observation.observedAt);
    if (observedAt !== null && observedAt < previousObservedAt) {
      collector.add('malformed_chronology', observation.observationId);
    }
    previousObservedAt = observedAt ?? previousObservedAt;
  });
  if (event.observations.length === 0) {
    collector.add('invalid_observation_identity');
  }
  validateTrainingContext(event, evaluatedAt, collector);
  return collector.result(event);
}

export function validatePainSafetyClassificationOutput(
  output: PainSafetyClassificationOutput,
): PainSafetyValidationResult<PainSafetyClassificationOutput> {
  const collector = new ValidationCollector();
  if (output.status !== 'classified') {
    collector.add('invalid_classification');
  }
  if (!isUuid(output.eventId)) {
    collector.add('invalid_event_identity');
  }
  if (!isUuid(output.subjectId)) {
    collector.add('invalid_subject_identity');
  }
  validateVersions(output.contractVersion, output.version, collector);
  if (!isControlled(output.classification, painSafetyClassifications)) {
    collector.add('invalid_classification');
  }
  if (
    output.reasonCodes.length === 0 ||
    output.reasonCodes.some((code) => !isControlled(code, painSafetyClassificationReasonCodes))
  ) {
    collector.add('invalid_reason_codes');
  }
  if (
    output.sourceObservationIds.length === 0 ||
    output.sourceObservationIds.some((id) => !isUuid(id)) ||
    new Set(output.sourceObservationIds).size !== output.sourceObservationIds.length
  ) {
    collector.add('invalid_observation_identity');
  }
  output.missingInformation.forEach((entry) => {
    if (
      !isControlled(entry.questionCode, painSafetyMissingQuestionCodes) ||
      !Number.isInteger(entry.priority) ||
      entry.priority < 0 ||
      !isControlled(entry.expectedAnswerType, painSafetyExpectedAnswerTypes) ||
      !controlledCodePattern.test(entry.relatedField)
    ) {
      collector.add('invalid_missing_information_entry');
    }
  });
  output.currentQuestionBatch.forEach((entry) => {
    if (
      !output.missingInformation.some(({ questionCode }) => questionCode === entry.questionCode)
    ) {
      collector.add('invalid_missing_information_entry');
    }
  });
  if (
    output.evidence.reportedStopSignals.some(
      (code) => !isControlled(code, painSafetyReportedStopSignalCodes),
    ) ||
    new Set(output.evidence.reportedStopSignals).size !== output.evidence.reportedStopSignals.length
  ) {
    collector.add('invalid_reason_codes');
  }
  output.constraints.forEach((constraint) => {
    if (!isValidAdaptationConstraint(constraint)) {
      collector.add('invalid_adaptation_constraint');
    }
  });
  if (timestamp(output.classifiedAt) === null) {
    collector.add('malformed_chronology');
  }
  return collector.result(output);
}

export function validatePainSafetyInformationRequiredOutput(
  output: PainSafetyInformationRequiredOutput,
): PainSafetyValidationResult<PainSafetyInformationRequiredOutput> {
  const collector = new ValidationCollector();
  if (output.status !== 'information_required') {
    collector.add('invalid_classification');
  }
  if (!isUuid(output.eventId)) {
    collector.add('invalid_event_identity');
  }
  if (!isUuid(output.subjectId)) {
    collector.add('invalid_subject_identity');
  }
  validateVersions(output.contractVersion, output.version, collector);
  if (
    output.reasonCodes.length === 0 ||
    output.reasonCodes.some((code) => !isControlled(code, painSafetyInformationRequiredReasonCodes))
  ) {
    collector.add('invalid_reason_codes');
  }
  if (
    output.sourceObservationIds.length === 0 ||
    output.sourceObservationIds.some((id) => !isUuid(id)) ||
    new Set(output.sourceObservationIds).size !== output.sourceObservationIds.length
  ) {
    collector.add('invalid_observation_identity');
  }
  output.missingInformation.forEach((entry) => {
    if (
      !isControlled(entry.questionCode, painSafetyMissingQuestionCodes) ||
      !Number.isInteger(entry.priority) ||
      entry.priority < 0 ||
      !isControlled(entry.expectedAnswerType, painSafetyExpectedAnswerTypes) ||
      !controlledCodePattern.test(entry.relatedField)
    ) {
      collector.add('invalid_missing_information_entry');
    }
  });
  output.currentQuestionBatch.forEach((entry) => {
    if (
      !output.missingInformation.some(({ questionCode }) => questionCode === entry.questionCode)
    ) {
      collector.add('invalid_missing_information_entry');
    }
  });
  if (
    output.evidence.reportedStopSignals.some(
      (code) => !isControlled(code, painSafetyReportedStopSignalCodes),
    ) ||
    new Set(output.evidence.reportedStopSignals).size !== output.evidence.reportedStopSignals.length
  ) {
    collector.add('invalid_reason_codes');
  }
  if (timestamp(output.evaluatedAt) === null) {
    collector.add('malformed_chronology');
  }
  return collector.result(output);
}

export function validatePainSafetyAdaptationConstraint(
  constraint: PainSafetyAdaptationConstraint,
): PainSafetyValidationResult<PainSafetyAdaptationConstraint> {
  const collector = new ValidationCollector();
  if (!isValidAdaptationConstraint(constraint)) {
    collector.add('invalid_adaptation_constraint');
  }
  return collector.result(constraint);
}

function validateObservation(
  observation: DiscomfortObservation,
  event: DiscomfortEventContract,
  occurredAt: number | null,
  evaluatedAt: number | null,
  collector: ValidationCollector,
): void {
  if (!isUuid(observation.observationId)) {
    collector.add('invalid_observation_identity', observation.observationId);
  }
  if (observation.eventId !== event.eventId || observation.subjectId !== event.subjectId) {
    collector.add('observation_identity_mismatch', observation.observationId);
  }
  if (!isControlled(observation.kind, discomfortObservationKinds)) {
    collector.add('invalid_controlled_value', observation.observationId);
  }
  if (!isControlled(observation.bodyArea, discomfortBodyAreas)) {
    collector.add('invalid_body_area', observation.observationId);
  }
  if (!isControlled(observation.side, discomfortBodySides)) {
    collector.add('invalid_side', observation.observationId);
  }
  if (
    observation.severity !== null &&
    (!Number.isInteger(observation.severity) ||
      observation.severity < 0 ||
      observation.severity > 10)
  ) {
    collector.add('invalid_severity', observation.observationId);
  }
  if (
    !isControlled(observation.onsetPattern, discomfortOnsetPatterns) ||
    !isControlled(observation.activityContext, discomfortActivityContexts) ||
    !isControlled(observation.trend, discomfortTrends)
  ) {
    collector.add('invalid_controlled_value', observation.observationId);
  }
  Object.values(observation.safety).forEach((value) => {
    if (!isControlled(value, painSafetyTriStateValues)) {
      collector.add('invalid_tri_state', observation.observationId);
    }
  });
  if (!isControlled(observation.movementTriggerStatus, painSafetyTriStateValues)) {
    collector.add('invalid_tri_state', observation.observationId);
  }
  if (
    (observation.movementTriggerStatus === 'present' &&
      observation.movementTriggers.length === 0) ||
    (observation.movementTriggerStatus !== 'present' && observation.movementTriggers.length > 0)
  ) {
    collector.add('contradictory_observation', observation.observationId);
  }
  if (
    observation.onsetPattern === 'sudden' &&
    observation.safety.traumaticOrSuddenOnset === 'absent'
  ) {
    collector.add('contradictory_observation', observation.observationId);
  }
  const triggerKeys = new Set<string>();
  observation.movementTriggers.forEach((trigger) => {
    if (!isValidMovementTrigger(trigger)) {
      collector.add('invalid_movement_trigger', observation.observationId);
      return;
    }
    const key = movementTriggerKey(trigger);
    if (triggerKeys.has(key)) {
      collector.add('duplicate_movement_trigger', observation.observationId);
    }
    triggerKeys.add(key);
  });
  const observedAt = timestamp(observation.observedAt);
  if (
    observedAt === null ||
    (occurredAt !== null && observedAt < occurredAt) ||
    (evaluatedAt !== null && observedAt > evaluatedAt)
  ) {
    collector.add('malformed_chronology', observation.observationId);
  }
}

function validateTrainingContext(
  event: DiscomfortEventContract,
  evaluatedAt: number | null,
  collector: ValidationCollector,
): void {
  const context = event.requestedTrainingContext;
  if (context === null) {
    return;
  }
  const requestedAt = timestamp(context.requestedAt);
  if (
    !isControlled(context.kind, requestedTrainingContexts) ||
    requestedAt === null ||
    (evaluatedAt !== null && requestedAt > evaluatedAt) ||
    context.movementPatterns.some((value) => !isControlled(value, discomfortMovementPatterns)) ||
    context.exerciseIds.some((id) => !isUuid(id)) ||
    context.exerciseFamilyIds.some((id) => !isUuid(id)) ||
    hasDuplicates(context.movementPatterns) ||
    hasDuplicates(context.exerciseIds) ||
    hasDuplicates(context.exerciseFamilyIds)
  ) {
    collector.add('invalid_training_context');
  }
}

function isValidMovementTrigger(trigger: DiscomfortMovementTrigger): boolean {
  switch (trigger.kind) {
    case 'movement_pattern':
      return isControlled(trigger.movementPattern, discomfortMovementPatterns);
    case 'exercise':
      return isUuid(trigger.exerciseId);
    case 'exercise_family':
      return isUuid(trigger.exerciseFamilyId);
    case 'activity':
      return isControlled(trigger.activityContext, discomfortActivityContexts);
  }
}

function movementTriggerKey(trigger: DiscomfortMovementTrigger): string {
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

function isValidAdaptationConstraint(constraint: PainSafetyAdaptationConstraint): boolean {
  if (
    !controlledCodePattern.test(constraint.constraintId) ||
    !isControlled(constraint.reasonCode, painSafetyClassificationReasonCodes)
  ) {
    return false;
  }
  switch (constraint.kind) {
    case 'exclude_movement_pattern':
    case 'reduce_movement_pattern_priority':
    case 'prefer_movement_emphasis':
      return validControlledList(constraint.movementPatterns, discomfortMovementPatterns);
    case 'exclude_exercises':
      return validIdList(constraint.exerciseIds);
    case 'exclude_exercise_families':
      return validIdList(constraint.exerciseFamilyIds);
    case 'reduce_volume':
      return (
        isControlled(constraint.movementPattern, discomfortMovementPatterns) &&
        Number.isInteger(constraint.maximumWorkingSets) &&
        constraint.maximumWorkingSets >= 0
      );
  }
}

function validateVersions(
  contractVersion: DiscomfortEventContract['contractVersion'],
  version: DiscomfortEventContract['version'],
  collector: ValidationCollector,
): void {
  if (
    !parseVersionIdentifier(contractVersion, 'contract').ok ||
    version.engineName.trim().length === 0 ||
    version.engineName.trim().length > 64 ||
    !parseVersionIdentifier(version.engineVersion, 'engine').ok ||
    !parseVersionIdentifier(version.ruleSetVersion, 'rule-set').ok
  ) {
    collector.add('invalid_version_contract');
  }
}

class ValidationCollector {
  readonly #reasons = new Set<PainSafetyValidationReasonCode>();
  readonly #observationIds = new Set<DiscomfortObservationId>();

  add(reason: PainSafetyValidationReasonCode, observationId?: DiscomfortObservationId): void {
    this.#reasons.add(reason);
    if (observationId !== undefined) {
      this.#observationIds.add(observationId);
    }
  }

  result<Value>(value: Value): PainSafetyValidationResult<Value> {
    if (this.#reasons.size === 0) {
      return { ok: true, value };
    }
    return {
      ok: false,
      failure: {
        status: 'failure',
        code: 'PAIN_SAFETY_CONTRACT_INVALID',
        reasonCodes: painSafetyValidationReasonCodes.filter((reason) => this.#reasons.has(reason)),
        relatedObservationIds: [...this.#observationIds].sort(),
      },
    };
  }
}

const controlledCodePattern = /^[a-z][a-z0-9_-]{0,63}$/;

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return value.trim().length > 0 && Number.isFinite(parsed) ? parsed : null;
}

function isControlled<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): value is Value {
  return (allowed as readonly unknown[]).includes(value);
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function validControlledList<Value extends string>(
  values: readonly Value[],
  allowed: readonly Value[],
): boolean {
  return (
    values.length > 0 &&
    !hasDuplicates(values) &&
    values.every((value) => isControlled(value, allowed))
  );
}

function validIdList(values: readonly string[]): boolean {
  return values.length > 0 && !hasDuplicates(values) && values.every((value) => isUuid(value));
}
