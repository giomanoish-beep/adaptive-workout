import type {
  ContractVersion,
  DeterministicEngineVersion,
  DomainId,
  EquipmentId,
  ExerciseFamilyId,
  ExerciseId,
  MuscleId,
} from '@adaptive-workout/domain';
import type {
  DiscomfortActivityContext,
  DiscomfortBodyArea,
  DiscomfortBodySide,
  DiscomfortEventId,
  DiscomfortMovementPattern,
  DiscomfortMovementTrigger,
  DiscomfortOnsetPattern,
  DiscomfortSafetyObservations,
  DiscomfortTrend,
  PainSafetyClassification,
  PainSafetyClassificationReasonCode,
  PainSafetyInformationRequiredReasonCode,
  PainSafetyTriState,
} from '@adaptive-workout/pain-safety';
import type {
  ProgressionRecommendationAction,
  ProgressionRecommendationReasonCode,
} from '@adaptive-workout/progression-engine';
import type { WorkoutOrigin } from '@adaptive-workout/workout-engine';

export type AIRequestId = DomainId<'ai-request'>;
export type AIDecisionId = DomainId<'decision'>;

export const aiTaskKinds = [
  'workout_intent_extraction',
  'discomfort_observation_extraction',
  'grounded_decision_explanation',
] as const;
export type AITaskKind = (typeof aiTaskKinds)[number];

export interface AIProviderDefinition {
  readonly providerId: string;
  readonly modelId: string;
  readonly supportedTasks: readonly AITaskKind[];
}

export interface AIRequestMetadata {
  readonly requestId: AIRequestId;
  readonly requestedAt: string;
  readonly timeoutMilliseconds: number;
}

export interface AIProviderResponseMetadata {
  readonly providerId: string;
  readonly modelId: string;
  readonly providerRequestId: string | null;
  readonly receivedAt: string;
  readonly latencyMilliseconds: number;
}

export interface AIUsageMetadata {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
}

export interface AIControlledWorkoutVocabulary {
  readonly muscleIds: readonly MuscleId[];
  readonly equipmentIds: readonly EquipmentId[];
  readonly exerciseIds: readonly ExerciseId[];
  readonly exerciseFamilyIds: readonly ExerciseFamilyId[];
}

export interface AICurrentWorkoutContext {
  readonly origin: WorkoutOrigin;
  readonly targetMuscleIds: readonly MuscleId[];
  readonly exerciseIds: readonly ExerciseId[];
}

export interface WorkoutIntentExtractionInput {
  readonly task: 'workout_intent_extraction';
  readonly contractVersion: ContractVersion;
  readonly requestText: string;
  readonly controlledVocabulary: AIControlledWorkoutVocabulary;
  readonly currentWorkout: AICurrentWorkoutContext | null;
}

export type AIEquipmentIntent =
  | { readonly kind: 'unspecified' }
  | {
      readonly kind: 'specified';
      readonly availableEquipmentIds: readonly EquipmentId[];
      readonly unavailableEquipmentIds: readonly EquipmentId[];
    };

export type AIWorkoutIntentConstraint =
  | {
      readonly kind: 'reduced_exercise_priority';
      readonly exerciseIds: readonly ExerciseId[];
    }
  | {
      readonly kind: 'preferred_exercises';
      readonly exerciseIds: readonly ExerciseId[];
    }
  | {
      readonly kind: 'maximum_workout_duration';
      readonly maximumMinutes: number;
    };

export const workoutIntentInformationCodes = [
  'target_muscles_unclear',
  'duration_unclear',
  'equipment_context_unclear',
  'constraint_unclear',
] as const;
export type WorkoutIntentInformationCode = (typeof workoutIntentInformationCodes)[number];

export interface WorkoutIntentExtractionOutput {
  readonly task: 'workout_intent_extraction';
  readonly contractVersion: ContractVersion;
  readonly targetMuscleIds: readonly MuscleId[];
  readonly excludedMuscleIds: readonly MuscleId[];
  readonly availableDurationMinutes: number | null;
  readonly equipmentIntent: AIEquipmentIntent;
  readonly excludedExerciseIds: readonly ExerciseId[];
  readonly excludedExerciseFamilyIds: readonly ExerciseFamilyId[];
  readonly preferredMuscleIds: readonly MuscleId[];
  readonly constraints: readonly AIWorkoutIntentConstraint[];
  readonly missingInformation: readonly WorkoutIntentInformationCode[];
}

export interface AIControlledDiscomfortVocabulary {
  readonly bodyAreas: readonly DiscomfortBodyArea[];
  readonly bodySides: readonly DiscomfortBodySide[];
  readonly movementPatterns: readonly DiscomfortMovementPattern[];
  readonly activityContexts: readonly DiscomfortActivityContext[];
  readonly triStateValues: readonly PainSafetyTriState[];
  readonly exerciseIds: readonly ExerciseId[];
  readonly exerciseFamilyIds: readonly ExerciseFamilyId[];
}

export interface AIKnownDiscomfortEventContext {
  readonly eventId: DiscomfortEventId;
  readonly bodyArea: DiscomfortBodyArea | null;
  readonly side: DiscomfortBodySide | null;
}

export interface DiscomfortObservationExtractionInput {
  readonly task: 'discomfort_observation_extraction';
  readonly contractVersion: ContractVersion;
  readonly reportText: string;
  readonly controlledVocabulary: AIControlledDiscomfortVocabulary;
  readonly knownEvent: AIKnownDiscomfortEventContext | null;
}

export interface DiscomfortObservationExtractionOutput {
  readonly task: 'discomfort_observation_extraction';
  readonly contractVersion: ContractVersion;
  readonly bodyArea: DiscomfortBodyArea | null;
  readonly side: DiscomfortBodySide | null;
  readonly severity: number | null;
  readonly onsetPattern: DiscomfortOnsetPattern;
  readonly activityContext: DiscomfortActivityContext;
  readonly trend: DiscomfortTrend;
  readonly movementTriggerStatus: PainSafetyTriState;
  readonly movementTriggers: readonly DiscomfortMovementTrigger[];
  readonly safety: DiscomfortSafetyObservations;
}

export const aiDecisionEvidenceKinds = [
  'constraint',
  'exercise',
  'exposure',
  'set',
  'observation',
  'rule',
] as const;
export type AIDecisionEvidenceKind = (typeof aiDecisionEvidenceKinds)[number];

export interface AIDecisionEvidence {
  readonly evidenceId: string;
  readonly kind: AIDecisionEvidenceKind;
  readonly fact: string;
}

interface AIAuthoritativeDecisionBase<Kind extends string, Action, ReasonCode extends string> {
  readonly kind: Kind;
  readonly decisionId: AIDecisionId;
  readonly action: Action;
  readonly reasonCodes: readonly ReasonCode[];
  readonly evidence: readonly AIDecisionEvidence[];
  readonly version: DeterministicEngineVersion;
  readonly decidedAt: string;
}

export type AIWorkoutDecision = AIAuthoritativeDecisionBase<
  'workout',
  { readonly kind: 'generated_workout'; readonly origin: WorkoutOrigin },
  string
>;

export type AIProgressionDecision = AIAuthoritativeDecisionBase<
  'progression',
  ProgressionRecommendationAction,
  ProgressionRecommendationReasonCode
>;

export type AIPainSafetyDecision = AIAuthoritativeDecisionBase<
  'pain_safety',
  PainSafetyClassification | 'information_required',
  PainSafetyClassificationReasonCode | PainSafetyInformationRequiredReasonCode
>;

export type AIAuthoritativeDecision =
  AIWorkoutDecision | AIProgressionDecision | AIPainSafetyDecision;

export interface GroundedDecisionExplanationInput {
  readonly task: 'grounded_decision_explanation';
  readonly contractVersion: ContractVersion;
  readonly decision: AIAuthoritativeDecision;
  readonly locale: string;
  readonly maximumCharacters: number;
}

export interface GroundedDecisionExplanationOutput {
  readonly task: 'grounded_decision_explanation';
  readonly contractVersion: ContractVersion;
  readonly explanationText: string;
  readonly reasonCodeReferences: readonly string[];
  readonly evidenceIdReferences: readonly string[];
}

export type AITaskInput =
  | WorkoutIntentExtractionInput
  | DiscomfortObservationExtractionInput
  | GroundedDecisionExplanationInput;

export type AITaskOutput =
  | WorkoutIntentExtractionOutput
  | DiscomfortObservationExtractionOutput
  | GroundedDecisionExplanationOutput;

export interface AITaskContractMap {
  readonly workout_intent_extraction: {
    readonly input: WorkoutIntentExtractionInput;
    readonly output: WorkoutIntentExtractionOutput;
  };
  readonly discomfort_observation_extraction: {
    readonly input: DiscomfortObservationExtractionInput;
    readonly output: DiscomfortObservationExtractionOutput;
  };
  readonly grounded_decision_explanation: {
    readonly input: GroundedDecisionExplanationInput;
    readonly output: GroundedDecisionExplanationOutput;
  };
}

export interface AIProviderRequest<Task extends AITaskKind = AITaskKind> {
  readonly task: Task;
  readonly input: AITaskContractMap[Task]['input'];
  readonly metadata: AIRequestMetadata;
}

export const aiProviderFailureCodes = [
  'UNSUPPORTED_TASK',
  'INVALID_TASK_INPUT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_AUTHENTICATION_FAILED',
  'MALFORMED_PROVIDER_RESPONSE',
  'STRUCTURED_OUTPUT_VALIDATION_FAILED',
  'UNSUPPORTED_PROVIDER_CAPABILITY',
  'FALLBACK_EXHAUSTED',
] as const;
export type AIProviderFailureCode = (typeof aiProviderFailureCodes)[number];

export interface AIProviderFailure {
  readonly code: AIProviderFailureCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly reasonCodes: readonly string[];
}

export interface AIProviderSuccess<Task extends AITaskKind = AITaskKind> {
  readonly status: 'success';
  readonly task: Task;
  readonly output: AITaskContractMap[Task]['output'];
  readonly responseMetadata: AIProviderResponseMetadata;
  readonly usage: AIUsageMetadata | null;
}

export interface AIProviderFailureResult<Task extends AITaskKind = AITaskKind> {
  readonly status: 'failure';
  readonly task: Task;
  readonly failure: AIProviderFailure;
  readonly responseMetadata: AIProviderResponseMetadata | null;
  readonly usage: AIUsageMetadata | null;
}

export type AIProviderResult<Task extends AITaskKind = AITaskKind> =
  AIProviderSuccess<Task> | AIProviderFailureResult<Task>;

export interface AIProvider {
  readonly definition: AIProviderDefinition;
  execute<Task extends AITaskKind>(
    request: AIProviderRequest<Task>,
  ): Promise<AIProviderResult<Task>>;
}

export const aiContractValidationFailureCodes = [
  'UNSUPPORTED_TASK',
  'INVALID_PROVIDER_DEFINITION',
  'INVALID_TASK_INPUT',
  'INVALID_TASK_OUTPUT',
  'INVALID_PROVIDER_RESULT',
  'INVALID_USAGE_METADATA',
] as const;
export type AIContractValidationFailureCode = (typeof aiContractValidationFailureCodes)[number];

export interface AIContractValidationIssue {
  readonly path: string;
  readonly reasonCode: string;
}

export interface AIContractValidationFailure {
  readonly code: AIContractValidationFailureCode;
  readonly issues: readonly AIContractValidationIssue[];
}

export type AIContractValidationResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly failure: AIContractValidationFailure };
