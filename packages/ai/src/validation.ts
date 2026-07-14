import {
  isUuid,
  parseVersionIdentifier,
  type ContractVersion,
  type DeterministicEngineVersion,
} from '@adaptive-workout/domain';
import {
  discomfortActivityContexts,
  discomfortBodyAreas,
  discomfortBodySides,
  discomfortMovementPatterns,
  discomfortOnsetPatterns,
  discomfortTrends,
  painSafetyClassificationReasonCodes,
  painSafetyClassifications,
  painSafetyInformationRequiredReasonCodes,
  painSafetyTriStateValues,
} from '@adaptive-workout/pain-safety';
import {
  progressionRecommendationActions,
  progressionRecommendationReasonCodes,
} from '@adaptive-workout/progression-engine';
import { workoutOrigins } from '@adaptive-workout/workout-engine';
import {
  aiContractValidationFailureCodes,
  aiDecisionEvidenceKinds,
  aiProviderFailureCodes,
  aiTaskKinds,
  workoutIntentInformationCodes,
  type AIContractValidationFailureCode,
  type AIContractValidationIssue,
  type AIContractValidationResult,
  type AIProviderDefinition,
  type AIProviderRequest,
  type AIProviderResult,
  type AITaskInput,
  type AITaskKind,
  type AITaskOutput,
  type AIUsageMetadata,
  type DiscomfortObservationExtractionInput,
  type DiscomfortObservationExtractionOutput,
  type GroundedDecisionExplanationInput,
  type GroundedDecisionExplanationOutput,
  type WorkoutIntentExtractionInput,
  type WorkoutIntentExtractionOutput,
} from './contracts.js';

const maximumIdentifierLength = 128;
const maximumTextLength = 4_000;
const maximumExplanationCharacters = 2_000;
const maximumTimeoutMilliseconds = 120_000;
const localePattern = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

type MutableIssues = AIContractValidationIssue[];
type UnknownRecord = Record<string, unknown>;

function success<Value>(value: Value): AIContractValidationResult<Value> {
  return { ok: true, value };
}

function failure<Value>(
  code: AIContractValidationFailureCode,
  issues: readonly AIContractValidationIssue[],
): AIContractValidationResult<Value> {
  return { ok: false, failure: { code, issues } };
}

function issue(issues: MutableIssues, path: string, reasonCode: string): void {
  issues.push({ path, reasonCode });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: UnknownRecord,
  required: readonly string[],
  path: string,
  issues: MutableIssues,
): boolean {
  const actual = Object.keys(value);
  let valid = true;

  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      issue(issues, `${path}.${key}`, 'required_field_missing');
      valid = false;
    }
  }

  for (const key of actual) {
    if (!required.includes(key)) {
      issue(issues, `${path}.${key}`, 'unsupported_field');
      valid = false;
    }
  }

  return valid;
}

function isNonEmptyString(
  value: unknown,
  maximumLength = maximumIdentifierLength,
): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength;
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value > 0;
}

function isOneOf<Value extends string>(value: unknown, values: readonly Value[]): value is Value {
  return typeof value === 'string' && values.includes(value as Value);
}

function validateVersion(
  value: unknown,
  path: string,
  issues: MutableIssues,
): value is ContractVersion {
  if (typeof value !== 'string' || !parseVersionIdentifier(value, 'contract').ok) {
    issue(issues, path, 'version_invalid');
    return false;
  }
  return true;
}

function validateEngineVersion(
  value: unknown,
  path: string,
  issues: MutableIssues,
): value is DeterministicEngineVersion {
  if (!isRecord(value)) {
    issue(issues, path, 'object_required');
    return false;
  }
  hasExactKeys(value, ['engineName', 'engineVersion', 'ruleSetVersion'], path, issues);
  if (!isNonEmptyString(value.engineName))
    issue(issues, `${path}.engineName`, 'identifier_invalid');
  if (
    typeof value.engineVersion !== 'string' ||
    !parseVersionIdentifier(value.engineVersion, 'engine').ok
  ) {
    issue(issues, `${path}.engineVersion`, 'version_invalid');
  }
  if (
    typeof value.ruleSetVersion !== 'string' ||
    !parseVersionIdentifier(value.ruleSetVersion, 'rule-set').ok
  ) {
    issue(issues, `${path}.ruleSetVersion`, 'version_invalid');
  }
  return issues.length === 0;
}

function validateUniqueStringArray(
  value: unknown,
  path: string,
  issues: MutableIssues,
  options: { readonly uuid?: boolean; readonly allowed?: readonly string[] } = {},
): value is readonly string[] {
  if (!Array.isArray(value)) {
    issue(issues, path, 'array_required');
    return false;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (
      typeof entry !== 'string' ||
      entry.length === 0 ||
      (options.uuid === true && !isUuid(entry)) ||
      (options.allowed !== undefined && !options.allowed.includes(entry))
    ) {
      issue(issues, `${path}[${index}]`, 'controlled_value_invalid');
    } else if (seen.has(entry)) {
      issue(issues, `${path}[${index}]`, 'duplicate_value');
    } else {
      seen.add(entry);
    }
  });
  return true;
}

function validateVocabularyIds(value: unknown, path: string, issues: MutableIssues): boolean {
  if (!isRecord(value)) {
    issue(issues, path, 'object_required');
    return false;
  }
  hasExactKeys(
    value,
    ['muscleIds', 'equipmentIds', 'exerciseIds', 'exerciseFamilyIds'],
    path,
    issues,
  );
  validateUniqueStringArray(value.muscleIds, `${path}.muscleIds`, issues, { uuid: true });
  validateUniqueStringArray(value.equipmentIds, `${path}.equipmentIds`, issues, { uuid: true });
  validateUniqueStringArray(value.exerciseIds, `${path}.exerciseIds`, issues, { uuid: true });
  validateUniqueStringArray(value.exerciseFamilyIds, `${path}.exerciseFamilyIds`, issues, {
    uuid: true,
  });
  return true;
}

function validateCurrentWorkout(
  value: unknown,
  vocabulary: UnknownRecord | null,
  path: string,
  issues: MutableIssues,
): void {
  if (value === null) return;
  if (!isRecord(value)) {
    issue(issues, path, 'object_or_null_required');
    return;
  }
  hasExactKeys(value, ['origin', 'targetMuscleIds', 'exerciseIds'], path, issues);
  if (!isOneOf(value.origin, workoutOrigins))
    issue(issues, `${path}.origin`, 'controlled_value_invalid');
  validateUniqueStringArray(value.targetMuscleIds, `${path}.targetMuscleIds`, issues, {
    allowed: Array.isArray(vocabulary?.muscleIds) ? (vocabulary.muscleIds as string[]) : [],
  });
  validateUniqueStringArray(value.exerciseIds, `${path}.exerciseIds`, issues, {
    allowed: Array.isArray(vocabulary?.exerciseIds) ? (vocabulary.exerciseIds as string[]) : [],
  });
}

export function validateWorkoutIntentExtractionInput(
  value: unknown,
): AIContractValidationResult<WorkoutIntentExtractionInput> {
  const issues: MutableIssues = [];
  if (!isRecord(value))
    return failure('INVALID_TASK_INPUT', [{ path: '$', reasonCode: 'object_required' }]);
  hasExactKeys(
    value,
    ['task', 'contractVersion', 'requestText', 'controlledVocabulary', 'currentWorkout'],
    '$',
    issues,
  );
  if (value.task !== 'workout_intent_extraction') issue(issues, '$.task', 'task_invalid');
  validateVersion(value.contractVersion, '$.contractVersion', issues);
  if (!isNonEmptyString(value.requestText, maximumTextLength)) {
    issue(issues, '$.requestText', 'request_text_invalid');
  }
  validateVocabularyIds(value.controlledVocabulary, '$.controlledVocabulary', issues);
  validateCurrentWorkout(
    value.currentWorkout,
    isRecord(value.controlledVocabulary) ? value.controlledVocabulary : null,
    '$.currentWorkout',
    issues,
  );
  return issues.length === 0
    ? success(value as unknown as WorkoutIntentExtractionInput)
    : failure('INVALID_TASK_INPUT', issues);
}

function validateSubsetIds(
  value: unknown,
  allowed: unknown,
  path: string,
  issues: MutableIssues,
): void {
  validateUniqueStringArray(value, path, issues, {
    allowed: Array.isArray(allowed) ? (allowed as string[]) : [],
  });
}

function validateEquipmentIntent(
  value: unknown,
  allowed: unknown,
  path: string,
  issues: MutableIssues,
): void {
  if (!isRecord(value) || !isOneOf(value.kind, ['unspecified', 'specified'] as const)) {
    issue(issues, path, 'equipment_intent_invalid');
    return;
  }
  if (value.kind === 'unspecified') {
    hasExactKeys(value, ['kind'], path, issues);
    return;
  }
  hasExactKeys(value, ['kind', 'availableEquipmentIds', 'unavailableEquipmentIds'], path, issues);
  validateSubsetIds(value.availableEquipmentIds, allowed, `${path}.availableEquipmentIds`, issues);
  validateSubsetIds(
    value.unavailableEquipmentIds,
    allowed,
    `${path}.unavailableEquipmentIds`,
    issues,
  );
  if (Array.isArray(value.availableEquipmentIds) && Array.isArray(value.unavailableEquipmentIds)) {
    const unavailable = new Set(value.unavailableEquipmentIds);
    value.availableEquipmentIds.forEach((entry, index) => {
      if (unavailable.has(entry))
        issue(issues, `${path}.availableEquipmentIds[${index}]`, 'equipment_collision');
    });
  }
}

function validateWorkoutIntentConstraints(
  value: unknown,
  vocabulary: UnknownRecord,
  path: string,
  issues: MutableIssues,
): void {
  if (!Array.isArray(value)) {
    issue(issues, path, 'array_required');
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      issue(issues, entryPath, 'object_required');
      return;
    }
    if (entry.kind === 'maximum_workout_duration') {
      hasExactKeys(entry, ['kind', 'maximumMinutes'], entryPath, issues);
      if (!isPositiveInteger(entry.maximumMinutes))
        issue(issues, `${entryPath}.maximumMinutes`, 'duration_invalid');
      return;
    }
    if (entry.kind === 'reduced_exercise_priority' || entry.kind === 'preferred_exercises') {
      hasExactKeys(entry, ['kind', 'exerciseIds'], entryPath, issues);
      validateSubsetIds(
        entry.exerciseIds,
        vocabulary.exerciseIds,
        `${entryPath}.exerciseIds`,
        issues,
      );
      return;
    }
    issue(issues, `${entryPath}.kind`, 'controlled_value_invalid');
  });
}

export function validateWorkoutIntentExtractionOutput(
  input: WorkoutIntentExtractionInput,
  value: unknown,
): AIContractValidationResult<WorkoutIntentExtractionOutput> {
  const issues: MutableIssues = [];
  if (!isRecord(value))
    return failure('INVALID_TASK_OUTPUT', [{ path: '$', reasonCode: 'object_required' }]);
  hasExactKeys(
    value,
    [
      'task',
      'contractVersion',
      'targetMuscleIds',
      'excludedMuscleIds',
      'availableDurationMinutes',
      'equipmentIntent',
      'excludedExerciseIds',
      'excludedExerciseFamilyIds',
      'preferredMuscleIds',
      'constraints',
      'missingInformation',
    ],
    '$',
    issues,
  );
  if (value.task !== input.task) issue(issues, '$.task', 'task_mismatch');
  if (value.contractVersion !== input.contractVersion)
    issue(issues, '$.contractVersion', 'version_mismatch');
  validateSubsetIds(
    value.targetMuscleIds,
    input.controlledVocabulary.muscleIds,
    '$.targetMuscleIds',
    issues,
  );
  validateSubsetIds(
    value.excludedMuscleIds,
    input.controlledVocabulary.muscleIds,
    '$.excludedMuscleIds',
    issues,
  );
  validateSubsetIds(
    value.preferredMuscleIds,
    input.controlledVocabulary.muscleIds,
    '$.preferredMuscleIds',
    issues,
  );
  if (Array.isArray(value.targetMuscleIds) && Array.isArray(value.excludedMuscleIds)) {
    const excluded = new Set(value.excludedMuscleIds);
    value.targetMuscleIds.forEach((entry, index) => {
      if (excluded.has(entry))
        issue(issues, `$.targetMuscleIds[${index}]`, 'target_excluded_collision');
    });
  }
  if (
    value.availableDurationMinutes !== null &&
    !isPositiveInteger(value.availableDurationMinutes)
  ) {
    issue(issues, '$.availableDurationMinutes', 'duration_invalid');
  }
  validateEquipmentIntent(
    value.equipmentIntent,
    input.controlledVocabulary.equipmentIds,
    '$.equipmentIntent',
    issues,
  );
  validateSubsetIds(
    value.excludedExerciseIds,
    input.controlledVocabulary.exerciseIds,
    '$.excludedExerciseIds',
    issues,
  );
  validateSubsetIds(
    value.excludedExerciseFamilyIds,
    input.controlledVocabulary.exerciseFamilyIds,
    '$.excludedExerciseFamilyIds',
    issues,
  );
  validateWorkoutIntentConstraints(
    value.constraints,
    input.controlledVocabulary as unknown as UnknownRecord,
    '$.constraints',
    issues,
  );
  validateUniqueStringArray(value.missingInformation, '$.missingInformation', issues, {
    allowed: workoutIntentInformationCodes,
  });
  return issues.length === 0
    ? success(value as unknown as WorkoutIntentExtractionOutput)
    : failure('INVALID_TASK_OUTPUT', issues);
}

function validateDiscomfortVocabulary(value: unknown, path: string, issues: MutableIssues): void {
  if (!isRecord(value)) {
    issue(issues, path, 'object_required');
    return;
  }
  hasExactKeys(
    value,
    [
      'bodyAreas',
      'bodySides',
      'movementPatterns',
      'activityContexts',
      'triStateValues',
      'exerciseIds',
      'exerciseFamilyIds',
    ],
    path,
    issues,
  );
  validateUniqueStringArray(value.bodyAreas, `${path}.bodyAreas`, issues, {
    allowed: discomfortBodyAreas,
  });
  validateUniqueStringArray(value.bodySides, `${path}.bodySides`, issues, {
    allowed: discomfortBodySides,
  });
  validateUniqueStringArray(value.movementPatterns, `${path}.movementPatterns`, issues, {
    allowed: discomfortMovementPatterns,
  });
  validateUniqueStringArray(value.activityContexts, `${path}.activityContexts`, issues, {
    allowed: discomfortActivityContexts,
  });
  validateUniqueStringArray(value.triStateValues, `${path}.triStateValues`, issues, {
    allowed: painSafetyTriStateValues,
  });
  validateUniqueStringArray(value.exerciseIds, `${path}.exerciseIds`, issues, { uuid: true });
  validateUniqueStringArray(value.exerciseFamilyIds, `${path}.exerciseFamilyIds`, issues, {
    uuid: true,
  });
}

function validateKnownEvent(
  value: unknown,
  vocabulary: UnknownRecord | null,
  path: string,
  issues: MutableIssues,
): void {
  if (value === null) return;
  if (!isRecord(value)) {
    issue(issues, path, 'object_or_null_required');
    return;
  }
  hasExactKeys(value, ['eventId', 'bodyArea', 'side'], path, issues);
  if (typeof value.eventId !== 'string' || !isUuid(value.eventId))
    issue(issues, `${path}.eventId`, 'id_invalid');
  if (
    value.bodyArea !== null &&
    (!Array.isArray(vocabulary?.bodyAreas) || !vocabulary.bodyAreas.includes(value.bodyArea))
  ) {
    issue(issues, `${path}.bodyArea`, 'controlled_value_invalid');
  }
  if (
    value.side !== null &&
    (!Array.isArray(vocabulary?.bodySides) || !vocabulary.bodySides.includes(value.side))
  ) {
    issue(issues, `${path}.side`, 'controlled_value_invalid');
  }
}

export function validateDiscomfortObservationExtractionInput(
  value: unknown,
): AIContractValidationResult<DiscomfortObservationExtractionInput> {
  const issues: MutableIssues = [];
  if (!isRecord(value))
    return failure('INVALID_TASK_INPUT', [{ path: '$', reasonCode: 'object_required' }]);
  hasExactKeys(
    value,
    ['task', 'contractVersion', 'reportText', 'controlledVocabulary', 'knownEvent'],
    '$',
    issues,
  );
  if (value.task !== 'discomfort_observation_extraction') issue(issues, '$.task', 'task_invalid');
  validateVersion(value.contractVersion, '$.contractVersion', issues);
  if (!isNonEmptyString(value.reportText, maximumTextLength))
    issue(issues, '$.reportText', 'report_text_invalid');
  validateDiscomfortVocabulary(value.controlledVocabulary, '$.controlledVocabulary', issues);
  validateKnownEvent(
    value.knownEvent,
    isRecord(value.controlledVocabulary) ? value.controlledVocabulary : null,
    '$.knownEvent',
    issues,
  );
  return issues.length === 0
    ? success(value as unknown as DiscomfortObservationExtractionInput)
    : failure('INVALID_TASK_INPUT', issues);
}

function validateSafety(value: unknown, path: string, issues: MutableIssues): void {
  if (!isRecord(value)) {
    issue(issues, path, 'object_required');
    return;
  }
  const fields = [
    'traumaticOrSuddenOnset',
    'swelling',
    'instabilityOrGivingWay',
    'weightBearingLimitation',
    'visibleDeformity',
    'numbnessOrWeakness',
    'chestPainOrBreathingDifficulty',
    'fainting',
    'severeSystemicSymptoms',
  ] as const;
  hasExactKeys(value, fields, path, issues);
  for (const field of fields) {
    if (!isOneOf(value[field], painSafetyTriStateValues)) {
      issue(issues, `${path}.${field}`, 'tri_state_invalid');
    }
  }
}

function validateMovementTriggers(
  value: unknown,
  vocabulary: DiscomfortObservationExtractionInput['controlledVocabulary'],
  path: string,
  issues: MutableIssues,
): void {
  if (!Array.isArray(value)) {
    issue(issues, path, 'array_required');
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      issue(issues, entryPath, 'object_required');
      return;
    }
    if (entry.kind === 'movement_pattern') {
      hasExactKeys(entry, ['kind', 'movementPattern'], entryPath, issues);
      if (!vocabulary.movementPatterns.includes(entry.movementPattern as never))
        issue(issues, `${entryPath}.movementPattern`, 'controlled_value_invalid');
    } else if (entry.kind === 'exercise') {
      hasExactKeys(entry, ['kind', 'exerciseId'], entryPath, issues);
      if (!vocabulary.exerciseIds.includes(entry.exerciseId as never))
        issue(issues, `${entryPath}.exerciseId`, 'controlled_value_invalid');
    } else if (entry.kind === 'exercise_family') {
      hasExactKeys(entry, ['kind', 'exerciseFamilyId'], entryPath, issues);
      if (!vocabulary.exerciseFamilyIds.includes(entry.exerciseFamilyId as never))
        issue(issues, `${entryPath}.exerciseFamilyId`, 'controlled_value_invalid');
    } else if (entry.kind === 'activity') {
      hasExactKeys(entry, ['kind', 'activityContext'], entryPath, issues);
      if (!vocabulary.activityContexts.includes(entry.activityContext as never))
        issue(issues, `${entryPath}.activityContext`, 'controlled_value_invalid');
    } else {
      issue(issues, `${entryPath}.kind`, 'movement_trigger_invalid');
    }
  });
}

export function validateDiscomfortObservationExtractionOutput(
  input: DiscomfortObservationExtractionInput,
  value: unknown,
): AIContractValidationResult<DiscomfortObservationExtractionOutput> {
  const issues: MutableIssues = [];
  if (!isRecord(value))
    return failure('INVALID_TASK_OUTPUT', [{ path: '$', reasonCode: 'object_required' }]);
  hasExactKeys(
    value,
    [
      'task',
      'contractVersion',
      'bodyArea',
      'side',
      'severity',
      'onsetPattern',
      'activityContext',
      'trend',
      'movementTriggerStatus',
      'movementTriggers',
      'safety',
    ],
    '$',
    issues,
  );
  if (value.task !== input.task) issue(issues, '$.task', 'task_mismatch');
  if (value.contractVersion !== input.contractVersion)
    issue(issues, '$.contractVersion', 'version_mismatch');
  if (
    value.bodyArea !== null &&
    !input.controlledVocabulary.bodyAreas.includes(value.bodyArea as never)
  )
    issue(issues, '$.bodyArea', 'controlled_value_invalid');
  if (value.side !== null && !input.controlledVocabulary.bodySides.includes(value.side as never))
    issue(issues, '$.side', 'controlled_value_invalid');
  if (
    value.severity !== null &&
    (!Number.isInteger(value.severity) ||
      typeof value.severity !== 'number' ||
      value.severity < 0 ||
      value.severity > 10)
  ) {
    issue(issues, '$.severity', 'severity_invalid');
  }
  if (!isOneOf(value.onsetPattern, discomfortOnsetPatterns))
    issue(issues, '$.onsetPattern', 'controlled_value_invalid');
  if (!input.controlledVocabulary.activityContexts.includes(value.activityContext as never))
    issue(issues, '$.activityContext', 'controlled_value_invalid');
  if (!isOneOf(value.trend, discomfortTrends)) issue(issues, '$.trend', 'controlled_value_invalid');
  if (!input.controlledVocabulary.triStateValues.includes(value.movementTriggerStatus as never))
    issue(issues, '$.movementTriggerStatus', 'tri_state_invalid');
  validateMovementTriggers(
    value.movementTriggers,
    input.controlledVocabulary,
    '$.movementTriggers',
    issues,
  );
  validateSafety(value.safety, '$.safety', issues);
  return issues.length === 0
    ? success(value as unknown as DiscomfortObservationExtractionOutput)
    : failure('INVALID_TASK_OUTPUT', issues);
}

function validateEvidence(value: unknown, path: string, issues: MutableIssues): void {
  if (!Array.isArray(value)) {
    issue(issues, path, 'array_required');
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      issue(issues, entryPath, 'object_required');
      return;
    }
    hasExactKeys(entry, ['evidenceId', 'kind', 'fact'], entryPath, issues);
    if (!isNonEmptyString(entry.evidenceId))
      issue(issues, `${entryPath}.evidenceId`, 'identifier_invalid');
    else if (seen.has(entry.evidenceId))
      issue(issues, `${entryPath}.evidenceId`, 'duplicate_value');
    else seen.add(entry.evidenceId);
    if (!isOneOf(entry.kind, aiDecisionEvidenceKinds))
      issue(issues, `${entryPath}.kind`, 'controlled_value_invalid');
    if (!isNonEmptyString(entry.fact, 500)) issue(issues, `${entryPath}.fact`, 'fact_invalid');
  });
}

function validateAuthoritativeDecision(value: unknown, path: string, issues: MutableIssues): void {
  if (!isRecord(value)) {
    issue(issues, path, 'object_required');
    return;
  }
  hasExactKeys(
    value,
    ['kind', 'decisionId', 'action', 'reasonCodes', 'evidence', 'version', 'decidedAt'],
    path,
    issues,
  );
  if (typeof value.decisionId !== 'string' || !isUuid(value.decisionId))
    issue(issues, `${path}.decisionId`, 'id_invalid');
  validateEngineVersion(value.version, `${path}.version`, issues);
  if (!isIsoTimestamp(value.decidedAt)) issue(issues, `${path}.decidedAt`, 'timestamp_invalid');
  validateEvidence(value.evidence, `${path}.evidence`, issues);

  if (value.kind === 'workout') {
    if (!isRecord(value.action)) issue(issues, `${path}.action`, 'object_required');
    else {
      hasExactKeys(value.action, ['kind', 'origin'], `${path}.action`, issues);
      if (value.action.kind !== 'generated_workout')
        issue(issues, `${path}.action.kind`, 'controlled_value_invalid');
      if (!isOneOf(value.action.origin, workoutOrigins))
        issue(issues, `${path}.action.origin`, 'controlled_value_invalid');
    }
    validateUniqueStringArray(value.reasonCodes, `${path}.reasonCodes`, issues);
  } else if (value.kind === 'progression') {
    if (!isOneOf(value.action, progressionRecommendationActions))
      issue(issues, `${path}.action`, 'controlled_value_invalid');
    validateUniqueStringArray(value.reasonCodes, `${path}.reasonCodes`, issues, {
      allowed: progressionRecommendationReasonCodes,
    });
  } else if (value.kind === 'pain_safety') {
    if (!isOneOf(value.action, [...painSafetyClassifications, 'information_required'] as const))
      issue(issues, `${path}.action`, 'controlled_value_invalid');
    validateUniqueStringArray(value.reasonCodes, `${path}.reasonCodes`, issues, {
      allowed: [
        ...painSafetyClassificationReasonCodes,
        ...painSafetyInformationRequiredReasonCodes,
      ],
    });
  } else {
    issue(issues, `${path}.kind`, 'decision_kind_invalid');
  }
}

export function validateGroundedDecisionExplanationInput(
  value: unknown,
): AIContractValidationResult<GroundedDecisionExplanationInput> {
  const issues: MutableIssues = [];
  if (!isRecord(value))
    return failure('INVALID_TASK_INPUT', [{ path: '$', reasonCode: 'object_required' }]);
  hasExactKeys(
    value,
    ['task', 'contractVersion', 'decision', 'locale', 'maximumCharacters'],
    '$',
    issues,
  );
  if (value.task !== 'grounded_decision_explanation') issue(issues, '$.task', 'task_invalid');
  validateVersion(value.contractVersion, '$.contractVersion', issues);
  validateAuthoritativeDecision(value.decision, '$.decision', issues);
  if (typeof value.locale !== 'string' || !localePattern.test(value.locale))
    issue(issues, '$.locale', 'locale_invalid');
  if (
    !isPositiveInteger(value.maximumCharacters) ||
    value.maximumCharacters > maximumExplanationCharacters
  ) {
    issue(issues, '$.maximumCharacters', 'explanation_bound_invalid');
  }
  return issues.length === 0
    ? success(value as unknown as GroundedDecisionExplanationInput)
    : failure('INVALID_TASK_INPUT', issues);
}

export function validateGroundedDecisionExplanationOutput(
  input: GroundedDecisionExplanationInput,
  value: unknown,
): AIContractValidationResult<GroundedDecisionExplanationOutput> {
  const issues: MutableIssues = [];
  if (!isRecord(value))
    return failure('INVALID_TASK_OUTPUT', [{ path: '$', reasonCode: 'object_required' }]);
  hasExactKeys(
    value,
    ['task', 'contractVersion', 'explanationText', 'reasonCodeReferences', 'evidenceIdReferences'],
    '$',
    issues,
  );
  if (value.task !== input.task) issue(issues, '$.task', 'task_mismatch');
  if (value.contractVersion !== input.contractVersion)
    issue(issues, '$.contractVersion', 'version_mismatch');
  if (!isNonEmptyString(value.explanationText, input.maximumCharacters))
    issue(issues, '$.explanationText', 'explanation_invalid');
  validateUniqueStringArray(value.reasonCodeReferences, '$.reasonCodeReferences', issues, {
    allowed: input.decision.reasonCodes,
  });
  validateUniqueStringArray(value.evidenceIdReferences, '$.evidenceIdReferences', issues, {
    allowed: input.decision.evidence.map((entry) => entry.evidenceId),
  });
  return issues.length === 0
    ? success(value as unknown as GroundedDecisionExplanationOutput)
    : failure('INVALID_TASK_OUTPUT', issues);
}

export function validateAITaskInput(value: unknown): AIContractValidationResult<AITaskInput> {
  if (!isRecord(value) || !isOneOf(value.task, aiTaskKinds)) {
    return failure('UNSUPPORTED_TASK', [{ path: '$.task', reasonCode: 'unsupported_task' }]);
  }
  if (value.task === 'workout_intent_extraction')
    return validateWorkoutIntentExtractionInput(value);
  if (value.task === 'discomfort_observation_extraction')
    return validateDiscomfortObservationExtractionInput(value);
  return validateGroundedDecisionExplanationInput(value);
}

export function validateAITaskOutput(
  input: AITaskInput,
  value: unknown,
): AIContractValidationResult<AITaskOutput> {
  if (input.task === 'workout_intent_extraction')
    return validateWorkoutIntentExtractionOutput(input, value);
  if (input.task === 'discomfort_observation_extraction')
    return validateDiscomfortObservationExtractionOutput(input, value);
  return validateGroundedDecisionExplanationOutput(input, value);
}

export function validateAIProviderDefinition(
  value: unknown,
): AIContractValidationResult<AIProviderDefinition> {
  const issues: MutableIssues = [];
  if (!isRecord(value))
    return failure('INVALID_PROVIDER_DEFINITION', [{ path: '$', reasonCode: 'object_required' }]);
  hasExactKeys(value, ['providerId', 'modelId', 'supportedTasks'], '$', issues);
  if (!isNonEmptyString(value.providerId)) issue(issues, '$.providerId', 'identifier_invalid');
  if (!isNonEmptyString(value.modelId)) issue(issues, '$.modelId', 'identifier_invalid');
  validateUniqueStringArray(value.supportedTasks, '$.supportedTasks', issues, {
    allowed: aiTaskKinds,
  });
  if (Array.isArray(value.supportedTasks) && value.supportedTasks.length === 0)
    issue(issues, '$.supportedTasks', 'capability_required');
  return issues.length === 0
    ? success(value as unknown as AIProviderDefinition)
    : failure('INVALID_PROVIDER_DEFINITION', issues);
}

export function validateAIUsageMetadata(
  value: unknown,
): AIContractValidationResult<AIUsageMetadata> {
  const issues: MutableIssues = [];
  if (!isRecord(value))
    return failure('INVALID_USAGE_METADATA', [{ path: '$', reasonCode: 'object_required' }]);
  hasExactKeys(value, ['inputTokens', 'outputTokens', 'totalTokens'], '$', issues);
  for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
    if (value[field] !== null && !isNonNegativeInteger(value[field]))
      issue(issues, `$.${field}`, 'token_count_invalid');
  }
  if (
    typeof value.inputTokens === 'number' &&
    typeof value.outputTokens === 'number' &&
    typeof value.totalTokens === 'number' &&
    value.inputTokens + value.outputTokens !== value.totalTokens
  ) {
    issue(issues, '$.totalTokens', 'token_total_mismatch');
  }
  return issues.length === 0
    ? success(value as unknown as AIUsageMetadata)
    : failure('INVALID_USAGE_METADATA', issues);
}

function validateResponseMetadata(value: unknown, path: string, issues: MutableIssues): void {
  if (!isRecord(value)) {
    issue(issues, path, 'object_required');
    return;
  }
  hasExactKeys(
    value,
    ['providerId', 'modelId', 'providerRequestId', 'receivedAt', 'latencyMilliseconds'],
    path,
    issues,
  );
  if (!isNonEmptyString(value.providerId))
    issue(issues, `${path}.providerId`, 'identifier_invalid');
  if (!isNonEmptyString(value.modelId)) issue(issues, `${path}.modelId`, 'identifier_invalid');
  if (value.providerRequestId !== null && !isNonEmptyString(value.providerRequestId))
    issue(issues, `${path}.providerRequestId`, 'identifier_invalid');
  if (!isIsoTimestamp(value.receivedAt)) issue(issues, `${path}.receivedAt`, 'timestamp_invalid');
  if (!isNonNegativeInteger(value.latencyMilliseconds))
    issue(issues, `${path}.latencyMilliseconds`, 'latency_invalid');
}

function validateProviderFailure(value: unknown, path: string, issues: MutableIssues): void {
  if (!isRecord(value)) {
    issue(issues, path, 'object_required');
    return;
  }
  hasExactKeys(value, ['code', 'message', 'retryable', 'reasonCodes'], path, issues);
  if (!isOneOf(value.code, aiProviderFailureCodes))
    issue(issues, `${path}.code`, 'failure_code_invalid');
  if (!isNonEmptyString(value.message, 500)) issue(issues, `${path}.message`, 'message_invalid');
  if (typeof value.retryable !== 'boolean') issue(issues, `${path}.retryable`, 'boolean_required');
  validateUniqueStringArray(value.reasonCodes, `${path}.reasonCodes`, issues);
}

export function validateAIProviderRequest(
  value: unknown,
): AIContractValidationResult<AIProviderRequest> {
  const issues: MutableIssues = [];
  if (!isRecord(value))
    return failure('INVALID_TASK_INPUT', [{ path: '$', reasonCode: 'object_required' }]);
  hasExactKeys(value, ['task', 'input', 'metadata'], '$', issues);
  const inputResult = validateAITaskInput(value.input);
  if (!inputResult.ok) issues.push(...inputResult.failure.issues);
  if (isRecord(value.input) && value.task !== value.input.task)
    issue(issues, '$.task', 'task_mismatch');
  if (!isRecord(value.metadata)) issue(issues, '$.metadata', 'object_required');
  else {
    hasExactKeys(
      value.metadata,
      ['requestId', 'requestedAt', 'timeoutMilliseconds'],
      '$.metadata',
      issues,
    );
    if (typeof value.metadata.requestId !== 'string' || !isUuid(value.metadata.requestId))
      issue(issues, '$.metadata.requestId', 'id_invalid');
    if (!isIsoTimestamp(value.metadata.requestedAt))
      issue(issues, '$.metadata.requestedAt', 'timestamp_invalid');
    if (
      !isPositiveInteger(value.metadata.timeoutMilliseconds) ||
      value.metadata.timeoutMilliseconds > maximumTimeoutMilliseconds
    ) {
      issue(issues, '$.metadata.timeoutMilliseconds', 'timeout_invalid');
    }
  }
  return issues.length === 0
    ? success(value as unknown as AIProviderRequest)
    : failure(inputResult.ok ? 'INVALID_TASK_INPUT' : inputResult.failure.code, issues);
}

export function validateAIProviderResult<Task extends AITaskKind>(
  request: AIProviderRequest<Task>,
  value: unknown,
): AIContractValidationResult<AIProviderResult<Task>> {
  const issues: MutableIssues = [];
  if (!isRecord(value))
    return failure('INVALID_PROVIDER_RESULT', [{ path: '$', reasonCode: 'object_required' }]);
  if (value.status === 'success') {
    hasExactKeys(value, ['status', 'task', 'output', 'responseMetadata', 'usage'], '$', issues);
    if (value.task !== request.task) issue(issues, '$.task', 'task_mismatch');
    validateResponseMetadata(value.responseMetadata, '$.responseMetadata', issues);
    if (value.usage !== null) {
      const usage = validateAIUsageMetadata(value.usage);
      if (!usage.ok) issues.push(...usage.failure.issues);
    }
    const output = validateAITaskOutput(request.input, value.output);
    if (!output.ok) issues.push(...output.failure.issues);
  } else if (value.status === 'failure') {
    hasExactKeys(value, ['status', 'task', 'failure', 'responseMetadata', 'usage'], '$', issues);
    if (value.task !== request.task) issue(issues, '$.task', 'task_mismatch');
    validateProviderFailure(value.failure, '$.failure', issues);
    if (value.responseMetadata !== null)
      validateResponseMetadata(value.responseMetadata, '$.responseMetadata', issues);
    if (value.usage !== null) {
      const usage = validateAIUsageMetadata(value.usage);
      if (!usage.ok) issues.push(...usage.failure.issues);
    }
  } else {
    issue(issues, '$.status', 'result_status_invalid');
  }
  return issues.length === 0
    ? success(value as unknown as AIProviderResult<Task>)
    : failure('INVALID_PROVIDER_RESULT', issues);
}

export function isSerializableAIValue(value: unknown): boolean {
  const visited = new Set<object>();
  const visit = (entry: unknown): boolean => {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return true;
    if (typeof entry === 'number') return Number.isFinite(entry);
    if (typeof entry !== 'object') return false;
    if (visited.has(entry)) return false;
    visited.add(entry);
    if (Array.isArray(entry)) return entry.every(visit);
    if (Object.getPrototypeOf(entry) !== Object.prototype) return false;
    return Object.values(entry as UnknownRecord).every(visit);
  };
  return visit(value);
}

export function isAIContractValidationFailureCode(
  value: unknown,
): value is AIContractValidationFailureCode {
  return isOneOf(value, aiContractValidationFailureCodes);
}
