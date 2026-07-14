import { isUuid, parseVersionIdentifier, type ExerciseId } from '@adaptive-workout/domain';
import {
  progressionExposureStatuses,
  progressionLoadUnits,
  progressionSetClassifications,
  type CompletedProgressionSet,
  type ExerciseExposureId,
  type PerformedSetId,
  type ProgressionEngineInput,
  type ProgressionExerciseExposure,
  type ProgressionFailure,
  type ProgressionFailureCode,
  type ProgressionLoadUnit,
  type ProgressionPerformedSet,
  type ProgressionRuleSet,
  type ProgressionValidationReasonCode,
} from './contracts.js';

export interface ValidatedProgressionInput {
  readonly input: ProgressionEngineInput;
  readonly usableCompletedWorkingSets: readonly CompletedProgressionSet[];
  readonly usableExposureIds: readonly ExerciseExposureId[];
}

export type ProgressionInputValidationResult =
  | { readonly ok: true; readonly value: ValidatedProgressionInput }
  | { readonly ok: false; readonly failure: ProgressionFailure };

export const progressionRuleSetValidationCodes = [
  'INVALID_RULE_CONTRACT_VERSION',
  'INVALID_RULE_SET_VERSION',
  'INVALID_MINIMUM_USABLE_EXPOSURES',
  'INVALID_MAXIMUM_EXPOSURE_HISTORY',
  'INVALID_ANALYSIS_WINDOW',
  'INVALID_INCREASE_EXPOSURE_COUNT',
  'INVALID_REDUCTION_EXPOSURE_COUNT',
  'INVALID_KNOWN_RIR_REQUIREMENT',
  'INVALID_RIR_REDUCTION_MARGIN',
  'INVALID_LOAD_REDUCTION_FRACTION',
  'INVALID_PLATEAU_EXPOSURE_COUNT',
  'INVALID_PLATEAU_REP_CHANGE',
  'INVALID_SUBSTITUTION_REVIEW_EXPOSURE_COUNT',
  'INVALID_SUBSTITUTION_HIGH_EFFORT_COUNT',
  'INVALID_DELOAD_REVIEW_EXPOSURE_COUNT',
  'INVALID_DELOAD_HIGH_EFFORT_COUNT',
  'MINIMUM_EXCEEDS_HISTORY_LIMIT',
] as const;

export type ProgressionRuleSetValidationCode = (typeof progressionRuleSetValidationCodes)[number];

export interface ProgressionRuleSetValidationIssue {
  readonly code: ProgressionRuleSetValidationCode;
  readonly path: string;
}

export function validateProgressionRuleSet(
  ruleSet: ProgressionRuleSet,
  expectedRuleSetVersion?: ProgressionEngineInput['version']['ruleSetVersion'],
): readonly ProgressionRuleSetValidationIssue[] {
  const issues: ProgressionRuleSetValidationIssue[] = [];
  if (!parseVersionIdentifier(ruleSet.contractVersion, 'contract').ok) {
    issues.push({ code: 'INVALID_RULE_CONTRACT_VERSION', path: 'contractVersion' });
  }
  if (!parseVersionIdentifier(ruleSet.ruleSetVersion, 'rule-set').ok) {
    issues.push({ code: 'INVALID_RULE_SET_VERSION', path: 'ruleSetVersion' });
  }
  if (expectedRuleSetVersion !== undefined && ruleSet.ruleSetVersion !== expectedRuleSetVersion) {
    issues.push({ code: 'INVALID_RULE_SET_VERSION', path: 'ruleSetVersion' });
  }
  if (
    !Number.isInteger(ruleSet.minimumUsableExposureCount) ||
    ruleSet.minimumUsableExposureCount <= 0
  ) {
    issues.push({
      code: 'INVALID_MINIMUM_USABLE_EXPOSURES',
      path: 'minimumUsableExposureCount',
    });
  }
  if (
    !Number.isInteger(ruleSet.deloadReviewRequiredExposureCount) ||
    ruleSet.deloadReviewRequiredExposureCount < 2 ||
    ruleSet.deloadReviewRequiredExposureCount > ruleSet.analysisWindowExposureCount
  ) {
    issues.push({
      code: 'INVALID_DELOAD_REVIEW_EXPOSURE_COUNT',
      path: 'deloadReviewRequiredExposureCount',
    });
  }
  if (
    !Number.isInteger(ruleSet.deloadReviewMinimumHighEffortExposureCount) ||
    ruleSet.deloadReviewMinimumHighEffortExposureCount < 1 ||
    ruleSet.deloadReviewMinimumHighEffortExposureCount > ruleSet.deloadReviewRequiredExposureCount
  ) {
    issues.push({
      code: 'INVALID_DELOAD_HIGH_EFFORT_COUNT',
      path: 'deloadReviewMinimumHighEffortExposureCount',
    });
  }
  if (
    !Number.isInteger(ruleSet.plateauRequiredExposureCount) ||
    ruleSet.plateauRequiredExposureCount < 2 ||
    ruleSet.plateauRequiredExposureCount > ruleSet.analysisWindowExposureCount
  ) {
    issues.push({
      code: 'INVALID_PLATEAU_EXPOSURE_COUNT',
      path: 'plateauRequiredExposureCount',
    });
  }
  if (!Number.isInteger(ruleSet.plateauMaximumRepChange) || ruleSet.plateauMaximumRepChange < 0) {
    issues.push({ code: 'INVALID_PLATEAU_REP_CHANGE', path: 'plateauMaximumRepChange' });
  }
  if (
    !Number.isInteger(ruleSet.substitutionReviewRequiredExposureCount) ||
    ruleSet.substitutionReviewRequiredExposureCount < ruleSet.plateauRequiredExposureCount ||
    ruleSet.substitutionReviewRequiredExposureCount > ruleSet.analysisWindowExposureCount
  ) {
    issues.push({
      code: 'INVALID_SUBSTITUTION_REVIEW_EXPOSURE_COUNT',
      path: 'substitutionReviewRequiredExposureCount',
    });
  }
  if (
    !Number.isInteger(ruleSet.substitutionReviewMinimumHighEffortExposureCount) ||
    ruleSet.substitutionReviewMinimumHighEffortExposureCount < 0 ||
    ruleSet.substitutionReviewMinimumHighEffortExposureCount >
      ruleSet.substitutionReviewRequiredExposureCount
  ) {
    issues.push({
      code: 'INVALID_SUBSTITUTION_HIGH_EFFORT_COUNT',
      path: 'substitutionReviewMinimumHighEffortExposureCount',
    });
  }
  if (!Number.isInteger(ruleSet.maximumExposureHistory) || ruleSet.maximumExposureHistory <= 0) {
    issues.push({
      code: 'INVALID_MAXIMUM_EXPOSURE_HISTORY',
      path: 'maximumExposureHistory',
    });
  }
  if (
    !Number.isInteger(ruleSet.analysisWindowExposureCount) ||
    ruleSet.analysisWindowExposureCount <= 0 ||
    ruleSet.analysisWindowExposureCount > ruleSet.maximumExposureHistory
  ) {
    issues.push({ code: 'INVALID_ANALYSIS_WINDOW', path: 'analysisWindowExposureCount' });
  }
  if (
    !Number.isInteger(ruleSet.increaseRequiredExposureCount) ||
    ruleSet.increaseRequiredExposureCount <= 0 ||
    ruleSet.increaseRequiredExposureCount > ruleSet.analysisWindowExposureCount
  ) {
    issues.push({
      code: 'INVALID_INCREASE_EXPOSURE_COUNT',
      path: 'increaseRequiredExposureCount',
    });
  }
  if (
    !Number.isInteger(ruleSet.reductionRequiredExposureCount) ||
    ruleSet.reductionRequiredExposureCount <= 0 ||
    ruleSet.reductionRequiredExposureCount > ruleSet.analysisWindowExposureCount
  ) {
    issues.push({
      code: 'INVALID_REDUCTION_EXPOSURE_COUNT',
      path: 'reductionRequiredExposureCount',
    });
  }
  if (
    !Number.isInteger(ruleSet.minimumKnownRirSetsPerExposureForIncrease) ||
    ruleSet.minimumKnownRirSetsPerExposureForIncrease < 0
  ) {
    issues.push({
      code: 'INVALID_KNOWN_RIR_REQUIREMENT',
      path: 'minimumKnownRirSetsPerExposureForIncrease',
    });
  }
  if (!Number.isFinite(ruleSet.rirReductionMargin) || ruleSet.rirReductionMargin < 0) {
    issues.push({ code: 'INVALID_RIR_REDUCTION_MARGIN', path: 'rirReductionMargin' });
  }
  if (
    !Number.isFinite(ruleSet.maximumLoadReductionFraction) ||
    ruleSet.maximumLoadReductionFraction <= 0 ||
    ruleSet.maximumLoadReductionFraction > 1
  ) {
    issues.push({
      code: 'INVALID_LOAD_REDUCTION_FRACTION',
      path: 'maximumLoadReductionFraction',
    });
  }
  if (ruleSet.minimumUsableExposureCount > ruleSet.maximumExposureHistory) {
    issues.push({
      code: 'MINIMUM_EXCEEDS_HISTORY_LIMIT',
      path: 'minimumUsableExposureCount',
    });
  }
  return issues;
}

export function validateProgressionInput(
  input: ProgressionEngineInput,
  ruleSet: ProgressionRuleSet,
): ProgressionInputValidationResult {
  const collector = new FailureCollector(input, ruleSet);
  validateIdentityAndVersions(input, ruleSet, collector);
  validatePrescription(input, collector);
  const history = validateExposureHistory(input, collector);
  const ruleIssues = validateProgressionRuleSet(ruleSet, input.version.ruleSetVersion);
  if (ruleIssues.length > 0) {
    collector.add('INVALID_RULE_SET', 'rule_set_invalid');
  }
  if (input.exposures.length === 0) {
    collector.add('NO_EXPOSURE_HISTORY', 'exposure_history_empty');
  }
  if (input.exposures.length > ruleSet.maximumExposureHistory) {
    collector.add('INVALID_INPUT', 'exposure_history_exceeds_limit');
  }
  if (history.usableCompletedWorkingSets.length === 0 && input.exposures.length > 0) {
    collector.add('NO_USABLE_COMPLETED_WORKING_SETS', 'no_completed_working_sets');
  }
  if (
    history.usableExposureIds.length > 0 &&
    history.usableExposureIds.length < ruleSet.minimumUsableExposureCount
  ) {
    collector.add(
      'INSUFFICIENT_USABLE_HISTORY',
      'usable_history_below_minimum',
      history.usableExposureIds,
    );
  }
  validateLoadUnits(input, history.usableCompletedWorkingSets, collector);

  const failure = collector.failure();
  if (failure !== undefined) {
    return { ok: false, failure };
  }
  return {
    ok: true,
    value: {
      input,
      usableCompletedWorkingSets: history.usableCompletedWorkingSets,
      usableExposureIds: history.usableExposureIds,
    },
  };
}

function validateIdentityAndVersions(
  input: ProgressionEngineInput,
  ruleSet: ProgressionRuleSet,
  collector: FailureCollector,
): void {
  if (!isUuid(input.subjectId)) {
    collector.add('INVALID_INPUT', 'subject_id_invalid');
  }
  if (!isUuid(input.exerciseId)) {
    collector.add('INVALID_INPUT', 'exercise_id_invalid');
  }
  if (
    !parseVersionIdentifier(input.contractVersion, 'contract').ok ||
    input.version.engineName.trim().length === 0 ||
    input.version.engineName.trim().length > 64 ||
    !parseVersionIdentifier(input.version.engineVersion, 'engine').ok ||
    !parseVersionIdentifier(input.version.ruleSetVersion, 'rule-set').ok ||
    !parseVersionIdentifier(ruleSet.contractVersion, 'contract').ok ||
    !parseVersionIdentifier(ruleSet.ruleSetVersion, 'rule-set').ok
  ) {
    collector.add('INVALID_VERSION_CONTRACT', 'version_invalid');
  }
  if (!isTimestamp(input.calculatedAt)) {
    collector.add('INVALID_INPUT', 'timestamp_invalid');
  }
}

function validatePrescription(input: ProgressionEngineInput, collector: FailureCollector): void {
  const { prescription } = input;
  if (
    !Number.isInteger(prescription.targetRepRange.minimum) ||
    !Number.isInteger(prescription.targetRepRange.maximum) ||
    prescription.targetRepRange.minimum <= 0 ||
    prescription.targetRepRange.maximum < prescription.targetRepRange.minimum
  ) {
    collector.add('INVALID_TARGET_REP_RANGE', 'target_rep_range_invalid');
  }
  if (
    prescription.targetRirRange !== undefined &&
    (!isBoundedRir(prescription.targetRirRange.minimum) ||
      !isBoundedRir(prescription.targetRirRange.maximum) ||
      prescription.targetRirRange.maximum < prescription.targetRirRange.minimum)
  ) {
    collector.add('INVALID_TARGET_RIR', 'target_rir_range_invalid');
  }
  if (
    prescription.currentPlannedLoad !== null &&
    (!isNonNegativeFinite(prescription.currentPlannedLoad.value) ||
      !isLoadUnit(prescription.currentPlannedLoad.unit))
  ) {
    collector.add('INVALID_INPUT', 'load_value_invalid');
  }
  const increments = prescription.availableLoadIncrements;
  if (
    increments !== null &&
    (!isLoadUnit(increments.unit) ||
      increments.increments.length === 0 ||
      increments.increments.some((increment) => !isPositiveFinite(increment)) ||
      !isStrictlyIncreasing(increments.increments))
  ) {
    collector.add('INVALID_LOAD_INCREMENTS', 'load_increment_invalid');
  }
}

function validateExposureHistory(
  input: ProgressionEngineInput,
  collector: FailureCollector,
): {
  readonly usableCompletedWorkingSets: readonly CompletedProgressionSet[];
  readonly usableExposureIds: readonly ExerciseExposureId[];
} {
  const exposureIds = new Set<string>();
  const setIds = new Set<string>();
  const usableCompletedWorkingSets: CompletedProgressionSet[] = [];
  const usableExposureIds: ExerciseExposureId[] = [];
  let previousOccurredAt = Number.NEGATIVE_INFINITY;

  input.exposures.forEach((exposure) => {
    if (exposureIds.has(exposure.exposureId)) {
      collector.add('DUPLICATE_EXPOSURE_ID', 'exposure_id_duplicated', [exposure.exposureId]);
    }
    exposureIds.add(exposure.exposureId);
    validateExposureIdentity(exposure, input.exerciseId, collector);
    const occurredAt = Date.parse(exposure.occurredAt);
    if (!Number.isFinite(occurredAt) || occurredAt < previousOccurredAt) {
      collector.add(
        'MALFORMED_EXPOSURE_CHRONOLOGY',
        Number.isFinite(occurredAt) ? 'exposure_order_invalid' : 'timestamp_invalid',
        [exposure.exposureId],
      );
    }
    previousOccurredAt = occurredAt;
    if (Number.isFinite(occurredAt) && occurredAt > Date.parse(input.calculatedAt)) {
      collector.add('MALFORMED_EXPOSURE_CHRONOLOGY', 'exposure_order_invalid', [
        exposure.exposureId,
      ]);
    }

    const usableSets = validateSets(exposure, setIds, collector);
    if (usableSets.length > 0) {
      usableExposureIds.push(exposure.exposureId);
      usableCompletedWorkingSets.push(...usableSets);
    }
  });
  return { usableCompletedWorkingSets, usableExposureIds };
}

function validateExposureIdentity(
  exposure: ProgressionExerciseExposure,
  expectedExerciseId: ExerciseId,
  collector: FailureCollector,
): void {
  if (!isUuid(exposure.exposureId)) {
    collector.add('INVALID_INPUT', 'exercise_id_invalid');
  }
  if (!isUuid(exposure.exerciseId) || exposure.exerciseId !== expectedExerciseId) {
    collector.add('INVALID_INPUT', 'exercise_identity_mismatch', [exposure.exposureId]);
  }
  if (!(progressionExposureStatuses as readonly string[]).includes(exposure.status)) {
    collector.add('INVALID_INPUT', 'completed_set_data_invalid', [exposure.exposureId]);
  }
  if (typeof exposure.wasDeload !== 'boolean') {
    collector.add('INVALID_INPUT', 'historical_prescription_invalid', [exposure.exposureId]);
  }
  const prescription = exposure.prescription;
  if (
    prescription !== null &&
    (!Number.isInteger(prescription.plannedWorkingSets) ||
      prescription.plannedWorkingSets <= 0 ||
      (prescription.targetRepRange !== null &&
        (!isValidRepRange(
          prescription.targetRepRange.minimum,
          prescription.targetRepRange.maximum,
        ) ||
          prescription.targetRepRange.minimum <= 0)) ||
      (prescription.targetRirRange !== null &&
        (!isBoundedRir(prescription.targetRirRange.minimum) ||
          !isBoundedRir(prescription.targetRirRange.maximum) ||
          prescription.targetRirRange.maximum < prescription.targetRirRange.minimum)))
  ) {
    collector.add('INVALID_INPUT', 'historical_prescription_invalid', [exposure.exposureId]);
  }
  if (
    exposure.substitution !== null &&
    (!isUuid(exposure.substitution.plannedExerciseId) ||
      exposure.substitution.plannedExerciseId === exposure.exerciseId ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(exposure.substitution.reasonCode))
  ) {
    collector.add('INVALID_INPUT', 'substitution_context_invalid', [exposure.exposureId]);
  }
}

function validateSets(
  exposure: ProgressionExerciseExposure,
  setIds: Set<string>,
  collector: FailureCollector,
): readonly CompletedProgressionSet[] {
  const usableSets: CompletedProgressionSet[] = [];
  let previousSetNumber = 0;
  let previousPerformedAt = Number.NEGATIVE_INFINITY;
  exposure.sets.forEach((set) => {
    if (setIds.has(set.setId)) {
      collector.add('DUPLICATE_SET_ID', 'set_id_duplicated', [exposure.exposureId], [set.setId]);
    }
    setIds.add(set.setId);
    if (!isUuid(set.setId)) {
      collector.add('INVALID_INPUT', 'completed_set_data_invalid', [exposure.exposureId]);
    }
    if (!Number.isInteger(set.setNumber) || set.setNumber <= previousSetNumber) {
      collector.add('INVALID_INPUT', 'set_order_invalid', [exposure.exposureId], [set.setId]);
    }
    previousSetNumber = set.setNumber;
    if (!(progressionSetClassifications as readonly string[]).includes(set.classification)) {
      collector.add(
        'INVALID_INPUT',
        'completed_set_data_invalid',
        [exposure.exposureId],
        [set.setId],
      );
    }
    if (set.status === 'completed') {
      const performedAt = validateCompletedSet(set, exposure, collector);
      if (performedAt < previousPerformedAt) {
        collector.add(
          'MALFORMED_EXPOSURE_CHRONOLOGY',
          'set_order_invalid',
          [exposure.exposureId],
          [set.setId],
        );
      }
      previousPerformedAt = performedAt;
      if (
        set.classification === 'working' &&
        exposure.status === 'completed' &&
        set.reps !== null
      ) {
        usableSets.push(set);
      }
    } else {
      validateUnusableSet(set, exposure, collector);
    }
  });
  return usableSets;
}

function validateCompletedSet(
  set: CompletedProgressionSet,
  exposure: ProgressionExerciseExposure,
  collector: FailureCollector,
): number {
  const performedAt = Date.parse(set.performedAt);
  const loadPairValid =
    (set.load === null && set.loadUnit === null) ||
    (set.load !== null && isNonNegativeFinite(set.load) && isLoadUnit(set.loadUnit));
  if (
    !Number.isFinite(performedAt) ||
    performedAt > Date.parse(exposure.occurredAt) ||
    !loadPairValid ||
    (set.reps !== null && (!Number.isInteger(set.reps) || set.reps < 0)) ||
    (set.rir !== null && !isBoundedRir(set.rir))
  ) {
    collector.add(
      'INVALID_INPUT',
      Number.isFinite(performedAt) ? 'completed_set_data_invalid' : 'timestamp_invalid',
      [exposure.exposureId],
      [set.setId],
    );
  }
  return performedAt;
}

function validateUnusableSet(
  set: ProgressionPerformedSet,
  exposure: ProgressionExerciseExposure,
  collector: FailureCollector,
): void {
  if (
    set.load !== null ||
    set.loadUnit !== null ||
    set.reps !== null ||
    set.rir !== null ||
    set.performedAt !== null
  ) {
    collector.add(
      'INVALID_INPUT',
      'unusable_set_contains_performance',
      [exposure.exposureId],
      [set.setId],
    );
  }
}

function validateLoadUnits(
  input: ProgressionEngineInput,
  usableSets: readonly CompletedProgressionSet[],
  collector: FailureCollector,
): void {
  const units = new Set<ProgressionLoadUnit>();
  usableSets.forEach((set) => {
    if (set.loadUnit !== null) {
      units.add(set.loadUnit);
    }
  });
  const currentLoad = input.prescription.currentPlannedLoad;
  if (currentLoad !== null && isLoadUnit(currentLoad.unit)) {
    units.add(currentLoad.unit);
  }
  const increments = input.prescription.availableLoadIncrements;
  if (increments !== null && isLoadUnit(increments.unit)) {
    units.add(increments.unit);
  }
  if (units.size > 1) {
    collector.add('INCONSISTENT_LOAD_UNITS', 'load_unit_inconsistent');
  }
}

class FailureCollector {
  readonly #input: ProgressionEngineInput;
  readonly #ruleSet: ProgressionRuleSet;
  readonly #codes: ProgressionFailureCode[] = [];
  readonly #reasons = new Set<ProgressionValidationReasonCode>();
  readonly #exposureIds = new Set<ExerciseExposureId>();
  readonly #setIds = new Set<PerformedSetId>();

  constructor(input: ProgressionEngineInput, ruleSet: ProgressionRuleSet) {
    this.#input = input;
    this.#ruleSet = ruleSet;
  }

  add(
    code: ProgressionFailureCode,
    reason: ProgressionValidationReasonCode,
    exposureIds: readonly ExerciseExposureId[] = [],
    setIds: readonly PerformedSetId[] = [],
  ): void {
    this.#codes.push(code);
    this.#reasons.add(reason);
    exposureIds.forEach((id) => this.#exposureIds.add(id));
    setIds.forEach((id) => this.#setIds.add(id));
  }

  failure(): ProgressionFailure | undefined {
    const code = failurePriority.find((candidate) => this.#codes.includes(candidate));
    if (code === undefined) {
      return undefined;
    }
    return {
      status: 'failure',
      code,
      reasonCodes: progressionValidationReasonOrder.filter((reason) => this.#reasons.has(reason)),
      relatedExposureIds: [...this.#exposureIds].sort(),
      relatedSetIds: [...this.#setIds].sort(),
      inputContractVersion: this.#input.contractVersion,
      ruleSetContractVersion: this.#ruleSet.contractVersion,
      version: this.#input.version,
      calculatedAt: this.#input.calculatedAt,
    };
  }
}

const failurePriority: readonly ProgressionFailureCode[] = [
  'INVALID_VERSION_CONTRACT',
  'INVALID_RULE_SET',
  'DUPLICATE_EXPOSURE_ID',
  'DUPLICATE_SET_ID',
  'MALFORMED_EXPOSURE_CHRONOLOGY',
  'INVALID_TARGET_REP_RANGE',
  'INVALID_TARGET_RIR',
  'INCONSISTENT_LOAD_UNITS',
  'INVALID_LOAD_INCREMENTS',
  'INVALID_INPUT',
  'NO_EXPOSURE_HISTORY',
  'NO_USABLE_COMPLETED_WORKING_SETS',
  'INSUFFICIENT_USABLE_HISTORY',
];

const progressionValidationReasonOrder: readonly ProgressionValidationReasonCode[] = [
  'subject_id_invalid',
  'exercise_id_invalid',
  'exposure_history_empty',
  'exposure_id_duplicated',
  'set_id_duplicated',
  'exposure_order_invalid',
  'exposure_history_exceeds_limit',
  'set_order_invalid',
  'timestamp_invalid',
  'exercise_identity_mismatch',
  'historical_prescription_invalid',
  'substitution_context_invalid',
  'completed_set_data_invalid',
  'unusable_set_contains_performance',
  'no_completed_working_sets',
  'usable_history_below_minimum',
  'target_rep_range_invalid',
  'target_rir_range_invalid',
  'load_value_invalid',
  'load_unit_inconsistent',
  'load_increment_invalid',
  'version_invalid',
  'rule_set_invalid',
];

function isTimestamp(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isLoadUnit(value: unknown): value is ProgressionLoadUnit {
  return (progressionLoadUnits as readonly unknown[]).includes(value);
}

function isBoundedRir(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 10;
}

function isValidRepRange(minimum: number, maximum: number): boolean {
  return Number.isInteger(minimum) && Number.isInteger(maximum) && maximum >= minimum;
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isStrictlyIncreasing(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value > values[index - 1]!);
}
