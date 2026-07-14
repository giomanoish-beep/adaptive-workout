import type {
  ContractVersion,
  DomainId,
  EquipmentId,
  ExerciseFamilyId,
  ExerciseId,
  MuscleId,
} from '@adaptive-workout/domain';
import {
  discomfortActivityContexts,
  discomfortBodyAreas,
  discomfortBodySides,
  discomfortMovementPatterns,
  painSafetyTriStateValues,
} from '@adaptive-workout/pain-safety';
import { describe, expect, it } from 'vitest';
import type {
  AIProviderRequest,
  AITaskInput,
  DiscomfortObservationExtractionInput,
  DiscomfortObservationExtractionOutput,
  GroundedDecisionExplanationInput,
  GroundedDecisionExplanationOutput,
  WorkoutIntentExtractionInput,
  WorkoutIntentExtractionOutput,
} from './contracts';
import {
  isSerializableAIValue,
  validateAIProviderDefinition,
  validateAIProviderResult,
  validateAITaskInput,
  validateAIUsageMetadata,
  validateDiscomfortObservationExtractionOutput,
  validateGroundedDecisionExplanationInput,
  validateGroundedDecisionExplanationOutput,
  validateWorkoutIntentExtractionInput,
  validateWorkoutIntentExtractionOutput,
} from './validation';

const contractVersion = 'ai-contract-1' as ContractVersion;
const chestId = '00000000-0000-0000-0000-000000000001' as MuscleId;
const backId = '00000000-0000-0000-0000-000000000002' as MuscleId;
const dumbbellId = '00000000-0000-0000-0000-000000000003' as EquipmentId;
const benchId = '00000000-0000-0000-0000-000000000004' as EquipmentId;
const pressId = '00000000-0000-0000-0000-000000000005' as ExerciseId;
const rowId = '00000000-0000-0000-0000-000000000006' as ExerciseId;
const pressFamilyId = '00000000-0000-0000-0000-000000000007' as ExerciseFamilyId;
const requestId = '00000000-0000-0000-0000-000000000008' as DomainId<'ai-request'>;
const decisionId = '00000000-0000-0000-0000-000000000009' as DomainId<'decision'>;
const eventId = '00000000-0000-0000-0000-000000000010' as DomainId<'pain-event'>;

const workoutInput: WorkoutIntentExtractionInput = {
  task: 'workout_intent_extraction',
  contractVersion,
  requestText: 'Give me a 45 minute chest workout with dumbbells.',
  controlledVocabulary: {
    muscleIds: [chestId, backId],
    equipmentIds: [dumbbellId, benchId],
    exerciseIds: [pressId, rowId],
    exerciseFamilyIds: [pressFamilyId],
  },
  currentWorkout: null,
};

const workoutOutput: WorkoutIntentExtractionOutput = {
  task: 'workout_intent_extraction',
  contractVersion,
  targetMuscleIds: [chestId],
  excludedMuscleIds: [],
  availableDurationMinutes: 45,
  equipmentIntent: {
    kind: 'specified',
    availableEquipmentIds: [dumbbellId, benchId],
    unavailableEquipmentIds: [],
  },
  excludedExerciseIds: [],
  excludedExerciseFamilyIds: [],
  preferredMuscleIds: [chestId],
  constraints: [],
  missingInformation: [],
};

const discomfortInput: DiscomfortObservationExtractionInput = {
  task: 'discomfort_observation_extraction',
  contractVersion,
  reportText: 'My knee feels a little uncomfortable when I squat.',
  controlledVocabulary: {
    bodyAreas: discomfortBodyAreas,
    bodySides: discomfortBodySides,
    movementPatterns: discomfortMovementPatterns,
    activityContexts: discomfortActivityContexts,
    triStateValues: painSafetyTriStateValues,
    exerciseIds: [pressId],
    exerciseFamilyIds: [pressFamilyId],
  },
  knownEvent: {
    eventId,
    bodyArea: 'knee',
    side: null,
  },
};

const unknownSafety = {
  traumaticOrSuddenOnset: 'unknown',
  swelling: 'unknown',
  instabilityOrGivingWay: 'unknown',
  weightBearingLimitation: 'unknown',
  visibleDeformity: 'unknown',
  numbnessOrWeakness: 'unknown',
  chestPainOrBreathingDifficulty: 'unknown',
  fainting: 'unknown',
  severeSystemicSymptoms: 'unknown',
} as const;

const discomfortOutput: DiscomfortObservationExtractionOutput = {
  task: 'discomfort_observation_extraction',
  contractVersion,
  bodyArea: 'knee',
  side: null,
  severity: null,
  onsetPattern: 'unknown',
  activityContext: 'training',
  trend: 'unknown',
  movementTriggerStatus: 'present',
  movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'squatting' }],
  safety: unknownSafety,
};

function explanationInput(
  kind: 'workout' | 'progression' | 'pain_safety',
): GroundedDecisionExplanationInput {
  const base = {
    task: 'grounded_decision_explanation' as const,
    contractVersion,
    locale: 'en-US',
    maximumCharacters: 240,
  };
  const version = {
    engineName: `${kind}-engine`,
    engineVersion:
      '1.0.0' as GroundedDecisionExplanationInput['decision']['version']['engineVersion'],
    ruleSetVersion:
      'rules-1' as GroundedDecisionExplanationInput['decision']['version']['ruleSetVersion'],
  };
  if (kind === 'workout') {
    return {
      ...base,
      decision: {
        kind,
        decisionId,
        action: { kind: 'generated_workout', origin: 'generated' },
        reasonCodes: ['TARGET_MUSCLE_COVERAGE'],
        evidence: [{ evidenceId: 'exercise:press', kind: 'exercise', fact: 'Press was selected.' }],
        version,
        decidedAt: '2026-07-14T10:00:00.000Z',
      },
    };
  }
  if (kind === 'progression') {
    return {
      ...base,
      decision: {
        kind,
        decisionId,
        action: 'increase_load',
        reasonCodes: ['TARGET_REPS_ACHIEVED'],
        evidence: [
          { evidenceId: 'exposure:latest', kind: 'exposure', fact: 'Target reps were achieved.' },
        ],
        version,
        decidedAt: '2026-07-14T10:00:00.000Z',
      },
    };
  }
  return {
    ...base,
    decision: {
      kind,
      decisionId,
      action: 'ADAPT',
      reasonCodes: ['MOVEMENT_AGGRAVATION_REPORTED'],
      evidence: [
        {
          evidenceId: 'observation:latest',
          kind: 'observation',
          fact: 'Movement aggravation was reported.',
        },
      ],
      version,
      decidedAt: '2026-07-14T10:00:00.000Z',
    },
  };
}

function explanationOutput(
  input: GroundedDecisionExplanationInput,
): GroundedDecisionExplanationOutput {
  return {
    task: 'grounded_decision_explanation',
    contractVersion,
    explanationText: 'The deterministic decision follows the supplied evidence.',
    reasonCodeReferences: [input.decision.reasonCodes[0] ?? ''],
    evidenceIdReferences: [input.decision.evidence[0]?.evidenceId ?? ''],
  };
}

function providerRequest(input: AITaskInput): AIProviderRequest {
  return {
    task: input.task,
    input,
    metadata: {
      requestId,
      requestedAt: '2026-07-14T10:00:00.000Z',
      timeoutMilliseconds: 10_000,
    },
  };
}

describe('AI contracts', () => {
  it('accepts a replaceable provider definition', () => {
    expect(
      validateAIProviderDefinition({
        providerId: 'provider-a',
        modelId: 'structured-model-1',
        supportedTasks: ['workout_intent_extraction', 'grounded_decision_explanation'],
      }).ok,
    ).toBe(true);
  });

  it('accepts a valid workout intent request', () => {
    expect(validateWorkoutIntentExtractionInput(workoutInput)).toEqual({
      ok: true,
      value: workoutInput,
    });
    expect(validateWorkoutIntentExtractionOutput(workoutInput, workoutOutput)).toEqual({
      ok: true,
      value: workoutOutput,
    });
  });

  it('rejects duplicate target muscles', () => {
    const output = { ...workoutOutput, targetMuscleIds: [chestId, chestId] };
    expect(validateWorkoutIntentExtractionOutput(workoutInput, output)).toMatchObject({
      ok: false,
      failure: { code: 'INVALID_TASK_OUTPUT' },
    });
  });

  it('rejects target and excluded muscle collisions', () => {
    const output = { ...workoutOutput, excludedMuscleIds: [chestId] };
    expect(validateWorkoutIntentExtractionOutput(workoutInput, output)).toMatchObject({
      ok: false,
    });
  });

  it('rejects non-positive duration', () => {
    const output = { ...workoutOutput, availableDurationMinutes: 0 };
    expect(validateWorkoutIntentExtractionOutput(workoutInput, output)).toMatchObject({
      ok: false,
    });
  });

  it('rejects unsupported controlled muscle and equipment values', () => {
    const unsupportedId = '00000000-0000-0000-0000-000000000099';
    const output = {
      ...workoutOutput,
      targetMuscleIds: [unsupportedId],
      equipmentIntent: {
        kind: 'specified',
        availableEquipmentIds: [unsupportedId],
        unavailableEquipmentIds: [],
      },
    };
    const result = validateWorkoutIntentExtractionOutput(workoutInput, output);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.issues).toHaveLength(2);
  });

  it('accepts vague knee discomfort with explicitly unknown safety observations', () => {
    expect(
      validateDiscomfortObservationExtractionOutput(discomfortInput, discomfortOutput),
    ).toEqual({
      ok: true,
      value: discomfortOutput,
    });
  });

  it('preserves severity zero as observed evidence', () => {
    const output = { ...discomfortOutput, severity: 0 };
    expect(validateDiscomfortObservationExtractionOutput(discomfortInput, output)).toEqual({
      ok: true,
      value: output,
    });
  });

  it('preserves null severity as unknown', () => {
    expect(
      validateDiscomfortObservationExtractionOutput(discomfortInput, discomfortOutput),
    ).toMatchObject({
      ok: true,
      value: { severity: null },
    });
  });

  it('requires omitted swelling to remain explicit instead of becoming absent', () => {
    const safety = Object.fromEntries(
      Object.entries(discomfortOutput.safety).filter(([field]) => field !== 'swelling'),
    );
    const result = validateDiscomfortObservationExtractionOutput(discomfortInput, {
      ...discomfortOutput,
      safety,
    });
    expect(result).toMatchObject({ ok: false });
    expect(discomfortOutput.safety.swelling).toBe('unknown');
  });

  it('accepts explicit swelling absence', () => {
    const output = {
      ...discomfortOutput,
      safety: { ...unknownSafety, swelling: 'absent' as const },
    };
    expect(validateDiscomfortObservationExtractionOutput(discomfortInput, output)).toMatchObject({
      ok: true,
    });
  });

  it('rejects unsupported body areas', () => {
    const result = validateDiscomfortObservationExtractionOutput(discomfortInput, {
      ...discomfortOutput,
      bodyArea: 'whole_body',
    });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects diagnosis-shaped structured output', () => {
    const result = validateDiscomfortObservationExtractionOutput(discomfortInput, {
      ...discomfortOutput,
      diagnosis: 'injury',
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok)
      expect(result.failure.issues).toContainEqual({
        path: '$.diagnosis',
        reasonCode: 'unsupported_field',
      });
  });

  it.each(['workout', 'progression', 'pain_safety'] as const)(
    'accepts a grounded %s decision explanation task',
    (kind) => {
      const input = explanationInput(kind);
      expect(validateGroundedDecisionExplanationInput(input)).toMatchObject({ ok: true });
      expect(
        validateGroundedDecisionExplanationOutput(input, explanationOutput(input)),
      ).toMatchObject({ ok: true });
    },
  );

  it('rejects explanation output that replaces an authoritative action', () => {
    const input = explanationInput('progression');
    const result = validateGroundedDecisionExplanationOutput(input, {
      ...explanationOutput(input),
      action: 'maintain_load',
    });
    expect(result).toMatchObject({ ok: false });
  });

  it('keeps provider and model metadata outside task output', () => {
    const request = providerRequest(workoutInput);
    const result = validateAIProviderResult(request, {
      status: 'success',
      task: request.task,
      output: workoutOutput,
      responseMetadata: {
        providerId: 'provider-a',
        modelId: 'structured-model-1',
        providerRequestId: 'provider-request-1',
        receivedAt: '2026-07-14T10:00:01.000Z',
        latencyMilliseconds: 1_000,
      },
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        output: { task: 'workout_intent_extraction' },
        responseMetadata: { providerId: 'provider-a', modelId: 'structured-model-1' },
      },
    });
    expect(workoutOutput).not.toHaveProperty('providerId');
  });

  it('returns a typed failure for malformed structured output', () => {
    const request = providerRequest(workoutInput);
    expect(
      validateAIProviderResult(request, {
        status: 'success',
        task: request.task,
        output: { task: 'workout_intent_extraction' },
        responseMetadata: {
          providerId: 'provider-a',
          modelId: 'model-a',
          providerRequestId: null,
          receivedAt: '2026-07-14T10:00:01.000Z',
          latencyMilliseconds: 100,
        },
        usage: null,
      }),
    ).toMatchObject({ ok: false, failure: { code: 'INVALID_PROVIDER_RESULT' } });
  });

  it('returns a typed unsupported-task failure', () => {
    expect(validateAITaskInput({ task: 'generate_authoritative_workout' })).toEqual({
      ok: false,
      failure: {
        code: 'UNSUPPORTED_TASK',
        issues: [{ path: '$.task', reasonCode: 'unsupported_task' }],
      },
    });
  });

  it('keeps provider failures serializable', () => {
    const failure = {
      status: 'failure',
      task: 'workout_intent_extraction',
      failure: {
        code: 'PROVIDER_TIMEOUT',
        message: 'The provider timed out.',
        retryable: true,
        reasonCodes: ['timeout'],
      },
      responseMetadata: null,
      usage: null,
    };
    expect(isSerializableAIValue(failure)).toBe(true);
    expect(validateAIProviderResult(providerRequest(workoutInput), failure)).toMatchObject({
      ok: true,
    });
  });

  it('validates identical structured inputs deterministically without mutation', () => {
    const before = structuredClone(workoutInput);
    const first = validateWorkoutIntentExtractionInput(workoutInput);
    const second = validateWorkoutIntentExtractionInput(workoutInput);
    expect(first).toEqual(second);
    expect(workoutInput).toEqual(before);
  });

  it('rejects inconsistent usage totals', () => {
    expect(
      validateAIUsageMetadata({ inputTokens: 10, outputTokens: 5, totalTokens: 20 }),
    ).toMatchObject({
      ok: false,
      failure: { code: 'INVALID_USAGE_METADATA' },
    });
  });
});
