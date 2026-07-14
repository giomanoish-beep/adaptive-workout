import type {
  ContractVersion,
  DeterministicEngineVersion,
  DomainId,
  ExerciseFamilyId,
  ExerciseId,
} from '@adaptive-workout/domain';

export type PainSafetySubjectId = DomainId<'user'>;
export type DiscomfortEventId = DomainId<'pain-event'>;
export type DiscomfortObservationId = DomainId<'pain-event-observation'>;

export const painSafetyTriStateValues = ['present', 'absent', 'unknown'] as const;
export type PainSafetyTriState = (typeof painSafetyTriStateValues)[number];

export const discomfortBodyAreas = [
  'head',
  'neck',
  'chest',
  'upper_back',
  'lower_back',
  'shoulder',
  'upper_arm',
  'elbow',
  'forearm',
  'wrist',
  'hand',
  'abdomen',
  'hip',
  'groin',
  'thigh',
  'knee',
  'lower_leg',
  'ankle',
  'foot',
  'other',
] as const;
export type DiscomfortBodyArea = (typeof discomfortBodyAreas)[number];

export const discomfortBodySides = [
  'left',
  'right',
  'bilateral',
  'midline',
  'not_applicable',
] as const;
export type DiscomfortBodySide = (typeof discomfortBodySides)[number];

export const discomfortObservationKinds = ['initial', 'follow_up'] as const;
export type DiscomfortObservationKind = (typeof discomfortObservationKinds)[number];

export const discomfortOnsetPatterns = ['sudden', 'gradual', 'unknown'] as const;
export type DiscomfortOnsetPattern = (typeof discomfortOnsetPatterns)[number];

export const discomfortActivityContexts = [
  'training',
  'daily_activity',
  'rest',
  'other',
  'unknown',
] as const;
export type DiscomfortActivityContext = (typeof discomfortActivityContexts)[number];

export const discomfortTrends = [
  'improving',
  'unchanged',
  'worsening',
  'resolved',
  'unknown',
] as const;
export type DiscomfortTrend = (typeof discomfortTrends)[number];

export const discomfortMovementPatterns = [
  'deep_flexion',
  'pressing',
  'pulling',
  'squatting',
  'hinging',
  'overhead',
  'rotation',
  'impact',
  'weight_bearing',
  'other',
] as const;
export type DiscomfortMovementPattern = (typeof discomfortMovementPatterns)[number];

export type DiscomfortMovementTrigger =
  | {
      readonly kind: 'movement_pattern';
      readonly movementPattern: DiscomfortMovementPattern;
    }
  | { readonly kind: 'exercise'; readonly exerciseId: ExerciseId }
  | { readonly kind: 'exercise_family'; readonly exerciseFamilyId: ExerciseFamilyId }
  | { readonly kind: 'activity'; readonly activityContext: DiscomfortActivityContext };

export interface DiscomfortSafetyObservations {
  readonly traumaticOrSuddenOnset: PainSafetyTriState;
  readonly swelling: PainSafetyTriState;
  readonly instabilityOrGivingWay: PainSafetyTriState;
  readonly weightBearingLimitation: PainSafetyTriState;
  readonly visibleDeformity: PainSafetyTriState;
  readonly numbnessOrWeakness: PainSafetyTriState;
  readonly chestPainOrBreathingDifficulty: PainSafetyTriState;
  readonly fainting: PainSafetyTriState;
  readonly severeSystemicSymptoms: PainSafetyTriState;
}

export interface DiscomfortObservation {
  readonly observationId: DiscomfortObservationId;
  readonly eventId: DiscomfortEventId;
  readonly subjectId: PainSafetySubjectId;
  readonly kind: DiscomfortObservationKind;
  readonly observedAt: string;
  readonly bodyArea: DiscomfortBodyArea;
  readonly side: DiscomfortBodySide;
  readonly severity: number | null;
  readonly onsetPattern: DiscomfortOnsetPattern;
  readonly activityContext: DiscomfortActivityContext;
  readonly trend: DiscomfortTrend;
  readonly movementTriggerStatus: PainSafetyTriState;
  readonly movementTriggers: readonly DiscomfortMovementTrigger[];
  readonly safety: DiscomfortSafetyObservations;
}

export const requestedTrainingContexts = [
  'planned_workout',
  'active_workout',
  'general_training',
] as const;
export type RequestedTrainingContextKind = (typeof requestedTrainingContexts)[number];

export interface RequestedTrainingContext {
  readonly kind: RequestedTrainingContextKind;
  readonly requestedAt: string;
  readonly movementPatterns: readonly DiscomfortMovementPattern[];
  readonly exerciseIds: readonly ExerciseId[];
  readonly exerciseFamilyIds: readonly ExerciseFamilyId[];
}

export interface DiscomfortEventContract {
  readonly contractVersion: ContractVersion;
  readonly eventId: DiscomfortEventId;
  readonly subjectId: PainSafetySubjectId;
  readonly reportedText: string;
  readonly occurredAt: string;
  readonly observations: readonly DiscomfortObservation[];
  readonly requestedTrainingContext: RequestedTrainingContext | null;
  readonly version: DeterministicEngineVersion;
  readonly evaluatedAt: string;
}

export const painSafetyMissingQuestionCodes = [
  'severity',
  'traumatic_or_sudden_onset',
  'swelling',
  'instability_or_giving_way',
  'weight_bearing_limitation',
  'visible_deformity',
  'numbness_or_weakness',
  'systemic_warning_signals',
  'movement_trigger',
  'symptom_trend',
] as const;
export type PainSafetyMissingQuestionCode = (typeof painSafetyMissingQuestionCodes)[number];

export const painSafetyExpectedAnswerTypes = [
  'severity_0_to_10_or_unknown',
  'tri_state',
  'movement_trigger_list',
  'trend',
] as const;
export type PainSafetyExpectedAnswerType = (typeof painSafetyExpectedAnswerTypes)[number];

export interface PainSafetyMissingInformationEntry {
  readonly questionCode: PainSafetyMissingQuestionCode;
  readonly priority: number;
  readonly expectedAnswerType: PainSafetyExpectedAnswerType;
  readonly relatedField: string;
}

export const painSafetyClassifications = ['GREEN', 'ADAPT', 'STOP'] as const;
export type PainSafetyClassification = (typeof painSafetyClassifications)[number];

export const painSafetyClassificationReasonCodes = [
  'NO_RULE_BASED_RESTRICTION_FOUND',
  'REPORTED_DISCOMFORT_PRESENT',
  'MOVEMENT_AGGRAVATION_REPORTED',
  'TRAUMATIC_OR_SUDDEN_ONSET_REPORTED',
  'MAJOR_WEIGHT_BEARING_LIMITATION_REPORTED',
  'VISIBLE_DEFORMITY_REPORTED',
  'SIGNIFICANT_SWELLING_REPORTED',
  'INSTABILITY_OR_GIVING_WAY_REPORTED',
  'NUMBNESS_OR_WEAKNESS_REPORTED',
  'SYSTEMIC_WARNING_SIGNAL_REPORTED',
  'SEVERE_REPORTED_DISCOMFORT',
  'WORSENING_REPORTED',
] as const;
export type PainSafetyClassificationReasonCode =
  (typeof painSafetyClassificationReasonCodes)[number];

export const painSafetyReportedStopSignalCodes = [
  'traumatic_or_sudden_onset',
  'major_weight_bearing_limitation',
  'visible_deformity',
  'significant_swelling',
  'instability_or_giving_way',
  'numbness_or_weakness',
  'systemic_warning_signal',
] as const;
export type PainSafetyReportedStopSignalCode = (typeof painSafetyReportedStopSignalCodes)[number];

export interface PainSafetyClassificationEvidence {
  readonly severity: number | null;
  readonly trend: DiscomfortTrend;
  readonly movementTriggerStatus: PainSafetyTriState;
  readonly movementTriggers: readonly DiscomfortMovementTrigger[];
  readonly safety: DiscomfortSafetyObservations;
  readonly reportedStopSignals: readonly PainSafetyReportedStopSignalCode[];
}

interface PainSafetyConstraintBase<Kind extends string> {
  readonly constraintId: string;
  readonly kind: Kind;
  readonly reasonCode: PainSafetyClassificationReasonCode;
}

export type PainSafetyAdaptationConstraint =
  | (PainSafetyConstraintBase<'exclude_movement_pattern'> & {
      readonly movementPatterns: readonly DiscomfortMovementPattern[];
    })
  | (PainSafetyConstraintBase<'reduce_movement_pattern_priority'> & {
      readonly movementPatterns: readonly DiscomfortMovementPattern[];
    })
  | (PainSafetyConstraintBase<'exclude_exercises'> & {
      readonly exerciseIds: readonly ExerciseId[];
    })
  | (PainSafetyConstraintBase<'exclude_exercise_families'> & {
      readonly exerciseFamilyIds: readonly ExerciseFamilyId[];
    })
  | (PainSafetyConstraintBase<'reduce_volume'> & {
      readonly movementPattern: DiscomfortMovementPattern;
      readonly maximumWorkingSets: number;
    })
  | (PainSafetyConstraintBase<'prefer_movement_emphasis'> & {
      readonly movementPatterns: readonly DiscomfortMovementPattern[];
    });

export interface PainSafetyClassificationOutput {
  readonly status: 'classified';
  readonly contractVersion: ContractVersion;
  readonly subjectId: PainSafetySubjectId;
  readonly eventId: DiscomfortEventId;
  readonly sourceObservationIds: readonly DiscomfortObservationId[];
  readonly classification: PainSafetyClassification;
  readonly reasonCodes: readonly PainSafetyClassificationReasonCode[];
  readonly missingInformation: readonly PainSafetyMissingInformationEntry[];
  readonly currentQuestionBatch: readonly PainSafetyMissingInformationEntry[];
  readonly evidence: PainSafetyClassificationEvidence;
  readonly constraints: readonly PainSafetyAdaptationConstraint[];
  readonly version: DeterministicEngineVersion;
  readonly classifiedAt: string;
}

export const painSafetyInformationRequiredReasonCodes = [
  'REQUIRED_INFORMATION_UNAVAILABLE',
] as const;
export type PainSafetyInformationRequiredReasonCode =
  (typeof painSafetyInformationRequiredReasonCodes)[number];

export interface PainSafetyInformationRequiredOutput {
  readonly status: 'information_required';
  readonly contractVersion: ContractVersion;
  readonly subjectId: PainSafetySubjectId;
  readonly eventId: DiscomfortEventId;
  readonly sourceObservationIds: readonly DiscomfortObservationId[];
  readonly reasonCodes: readonly PainSafetyInformationRequiredReasonCode[];
  readonly missingInformation: readonly PainSafetyMissingInformationEntry[];
  readonly currentQuestionBatch: readonly PainSafetyMissingInformationEntry[];
  readonly evidence: PainSafetyClassificationEvidence;
  readonly version: DeterministicEngineVersion;
  readonly evaluatedAt: string;
}

export type PainSafetyClassificationEvaluation =
  PainSafetyClassificationOutput | PainSafetyInformationRequiredOutput;
