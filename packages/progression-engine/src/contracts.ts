import type {
  ContractVersion,
  DeterministicEngineVersion,
  DomainId,
  ExerciseId,
  RuleSetVersion,
} from '@adaptive-workout/domain';

export type ProgressionSubjectId = DomainId<'user'>;
export type ExerciseExposureId = DomainId<'workout-session-exercise'>;
export type PerformedSetId = DomainId<'set-log'>;

export const progressionLoadUnits = ['kg', 'lb'] as const;
export type ProgressionLoadUnit = (typeof progressionLoadUnits)[number];

export const progressionSetClassifications = ['warm_up', 'working'] as const;
export type ProgressionSetClassification = (typeof progressionSetClassifications)[number];

export interface CompletedProgressionSet {
  readonly setId: PerformedSetId;
  readonly setNumber: number;
  readonly classification: ProgressionSetClassification;
  readonly status: 'completed';
  readonly load: number | null;
  readonly loadUnit: ProgressionLoadUnit | null;
  readonly reps: number | null;
  readonly rir: number | null;
  readonly performedAt: string;
}

export interface UnusableProgressionSet {
  readonly setId: PerformedSetId;
  readonly setNumber: number;
  readonly classification: ProgressionSetClassification;
  readonly status: 'skipped' | 'incomplete';
  readonly load: null;
  readonly loadUnit: null;
  readonly reps: null;
  readonly rir: null;
  readonly performedAt: null;
}

export type ProgressionPerformedSet = CompletedProgressionSet | UnusableProgressionSet;

export const progressionExposureStatuses = ['completed', 'incomplete', 'skipped'] as const;
export type ProgressionExposureStatus = (typeof progressionExposureStatuses)[number];

export interface ProgressionHistoricalPrescription {
  readonly plannedWorkingSets: number;
  readonly targetRepRange: ProgressionRepRange | null;
  readonly targetRirRange: ProgressionRirRange | null;
}

export interface ProgressionSubstitutionContext {
  readonly plannedExerciseId: ExerciseId;
  readonly reasonCode: string;
}

export interface ProgressionExerciseExposure {
  readonly exposureId: ExerciseExposureId;
  readonly exerciseId: ExerciseId;
  readonly status: ProgressionExposureStatus;
  readonly occurredAt: string;
  readonly prescription: ProgressionHistoricalPrescription | null;
  readonly substitution: ProgressionSubstitutionContext | null;
  readonly wasDeload: boolean;
  readonly sets: readonly ProgressionPerformedSet[];
}

export interface ProgressionRepRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface ProgressionRirRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface ProgressionLoad {
  readonly value: number;
  readonly unit: ProgressionLoadUnit;
}

export interface ProgressionLoadIncrementConfiguration {
  readonly unit: ProgressionLoadUnit;
  readonly increments: readonly number[];
}

export interface ProgressionPrescriptionContext {
  readonly targetRepRange: ProgressionRepRange;
  readonly targetRirRange?: ProgressionRirRange;
  readonly currentPlannedLoad: ProgressionLoad | null;
  readonly availableLoadIncrements: ProgressionLoadIncrementConfiguration | null;
}

export interface ProgressionEngineInput {
  readonly contractVersion: ContractVersion;
  readonly subjectId: ProgressionSubjectId;
  readonly exerciseId: ExerciseId;
  readonly exposures: readonly ProgressionExerciseExposure[];
  readonly prescription: ProgressionPrescriptionContext;
  readonly version: DeterministicEngineVersion;
  readonly calculatedAt: string;
}

export interface ProgressionRuleSet {
  readonly contractVersion: ContractVersion;
  readonly ruleSetVersion: RuleSetVersion;
  readonly minimumUsableExposureCount: number;
  readonly maximumExposureHistory: number;
  readonly analysisWindowExposureCount: number;
  readonly increaseRequiredExposureCount: number;
  readonly reductionRequiredExposureCount: number;
  readonly minimumKnownRirSetsPerExposureForIncrease: number;
  readonly rirReductionMargin: number;
  readonly maximumLoadReductionFraction: number;
  readonly plateauRequiredExposureCount: number;
  readonly plateauMaximumRepChange: number;
  readonly substitutionReviewRequiredExposureCount: number;
  readonly substitutionReviewMinimumHighEffortExposureCount: number;
  readonly deloadReviewRequiredExposureCount: number;
  readonly deloadReviewMinimumHighEffortExposureCount: number;
}

export interface ProgressionPlateauEvidence {
  readonly plateauExposureIds: readonly ExerciseExposureId[];
  readonly substitutionReviewExposureIds: readonly ExerciseExposureId[];
  readonly deloadExposureIds: readonly ExerciseExposureId[];
  readonly stableLoad: boolean;
  readonly stableSetCount: boolean;
  readonly stagnantReps: boolean;
  readonly recentProgression: boolean;
  readonly knownHighEffortExposureCount: number;
  readonly unknownRirExposureCount: number;
  readonly qualifiesAsPlateau: boolean;
  readonly qualifiesForSubstitutionReview: boolean;
}

export interface ProgressionDeloadEvidence {
  readonly reviewExposureIds: readonly ExerciseExposureId[];
  readonly priorDeloadExposureIds: readonly ExerciseExposureId[];
  readonly performanceTrend: ProgressionTrendEvidence;
  readonly knownHighEffortExposureCount: number;
  readonly unknownRirExposureCount: number;
  readonly degradationSignal: boolean;
  readonly highEffortSignal: boolean;
  readonly suppressedByRecentDeload: boolean;
  readonly qualifiesForDeloadReview: boolean;
}

export const progressionRecommendationActions = [
  'increase_load',
  'maintain_load',
  'reduce_load',
  'review_deload',
  'change_rep_range',
  'consider_substitution',
] as const;

export type ProgressionRecommendationAction = (typeof progressionRecommendationActions)[number];

export const progressionRecommendationReasonCodes = [
  'TARGET_REPS_ACHIEVED',
  'TARGET_RIR_ACHIEVED',
  'BELOW_TARGET_REPS',
  'RIR_BELOW_TARGET',
  'INSUFFICIENT_HISTORY',
  'MIXED_PERFORMANCE',
  'PLATEAU_SIGNAL',
  'PERFORMANCE_DECLINING',
  'REPEATED_HIGH_EFFORT',
  'DELOAD_REVIEW_SIGNAL',
  'SUBSTITUTION_REVIEW_SIGNAL',
  'LOAD_INCREMENT_APPLIED',
  'LOAD_REDUCTION_APPLIED',
  'WITHIN_TARGET_REP_RANGE',
  'RIR_UNKNOWN',
  'LOAD_MAINTAINED',
  'REP_RANGE_CHANGE_RECOMMENDED',
] as const;

export type ProgressionRecommendationReasonCode =
  (typeof progressionRecommendationReasonCodes)[number];

export interface ProgressionObservedRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface ProgressionTrendEvidence {
  readonly direction: 'improving' | 'stable' | 'declining' | 'mixed';
  readonly exposureCount: number;
}

export type ProgressionRirTargetPosition =
  'above_target' | 'at_target' | 'below_target' | 'mixed' | 'unknown';

export type ProgressionDirectionalTrend =
  'increasing' | 'stable' | 'decreasing' | 'mixed' | 'unknown';

export interface ProgressionExposureAnalysis {
  readonly exposureId: ExerciseExposureId;
  readonly occurredAt: string;
  readonly usableSetIds: readonly PerformedSetId[];
  readonly usableWorkingSetCount: number;
  readonly ignoredWorkingSetCount: number;
  readonly representativeLoad: ProgressionLoad | null;
  readonly observedRepRange: ProgressionObservedRange | null;
  readonly totalObservedReps: number;
  readonly observedRirRange: ProgressionObservedRange | null;
  readonly knownRirSetCount: number;
  readonly allSetsAtOrAboveTargetMaximum: boolean;
  readonly allSetsWithinTargetRange: boolean;
  readonly allSetsBelowTargetMinimum: boolean;
  readonly rirTargetPosition: ProgressionRirTargetPosition;
  readonly rirBelowReductionThreshold: boolean;
  readonly wasDeload: boolean;
  readonly wasSubstitution: boolean;
}

export interface ProgressionEvidenceAnalysis {
  readonly status: 'success';
  readonly contractVersion: ContractVersion;
  readonly subjectId: ProgressionSubjectId;
  readonly exerciseId: ExerciseId;
  readonly windowExposureCount: number;
  readonly excludedOlderExposureIds: readonly ExerciseExposureId[];
  readonly exposures: readonly ProgressionExposureAnalysis[];
  readonly performanceTrend: ProgressionTrendEvidence;
  readonly loadTrend: ProgressionDirectionalTrend;
  readonly rirTrend: ProgressionDirectionalTrend;
  readonly topRangeExposureCount: number;
  readonly belowRangeExposureCount: number;
  readonly deloadExposureIds: readonly ExerciseExposureId[];
  readonly version: DeterministicEngineVersion;
  readonly ruleSetContractVersion: ContractVersion;
  readonly calculatedAt: string;
}

export type ProgressionEvidenceAnalysisResult = ProgressionEvidenceAnalysis | ProgressionFailure;

export interface ProgressionRecommendationEvidence {
  readonly exposureIds: readonly ExerciseExposureId[];
  readonly setIds: readonly PerformedSetId[];
  readonly observedRepRange?: ProgressionObservedRange;
  readonly observedRirRange?: ProgressionObservedRange;
  readonly trend?: ProgressionTrendEvidence;
  readonly plateau?: ProgressionPlateauEvidence;
  readonly deload?: ProgressionDeloadEvidence;
  readonly analysis: ProgressionEvidenceAnalysis;
}

export interface ProgressionRecommendation {
  readonly status: 'success';
  readonly contractVersion: ContractVersion;
  readonly subjectId: ProgressionSubjectId;
  readonly exerciseId: ExerciseId;
  readonly action: ProgressionRecommendationAction;
  readonly previousLoad: ProgressionLoad | null;
  readonly recommendedLoad: ProgressionLoad | null;
  readonly targetRepRange: ProgressionRepRange;
  readonly targetRirRange?: ProgressionRirRange;
  readonly reasonCodes: readonly ProgressionRecommendationReasonCode[];
  readonly evidence: ProgressionRecommendationEvidence;
  readonly version: DeterministicEngineVersion;
  readonly calculatedAt: string;
}

export const progressionFailureCodes = [
  'NO_EXPOSURE_HISTORY',
  'NO_USABLE_COMPLETED_WORKING_SETS',
  'INVALID_TARGET_REP_RANGE',
  'INVALID_TARGET_RIR',
  'INCONSISTENT_LOAD_UNITS',
  'INVALID_LOAD_INCREMENTS',
  'MALFORMED_EXPOSURE_CHRONOLOGY',
  'DUPLICATE_EXPOSURE_ID',
  'DUPLICATE_SET_ID',
  'INVALID_VERSION_CONTRACT',
  'INSUFFICIENT_USABLE_HISTORY',
  'INVALID_INPUT',
  'INVALID_RULE_SET',
] as const;

export type ProgressionFailureCode = (typeof progressionFailureCodes)[number];

export interface ProgressionFailure {
  readonly status: 'failure';
  readonly code: ProgressionFailureCode;
  readonly reasonCodes: readonly ProgressionValidationReasonCode[];
  readonly relatedExposureIds: readonly ExerciseExposureId[];
  readonly relatedSetIds: readonly PerformedSetId[];
  readonly inputContractVersion: ContractVersion;
  readonly ruleSetContractVersion: ContractVersion;
  readonly version: DeterministicEngineVersion;
  readonly calculatedAt: string;
}

export const progressionValidationReasonCodes = [
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
] as const;

export type ProgressionValidationReasonCode = (typeof progressionValidationReasonCodes)[number];

export type ProgressionResult = ProgressionRecommendation | ProgressionFailure;
