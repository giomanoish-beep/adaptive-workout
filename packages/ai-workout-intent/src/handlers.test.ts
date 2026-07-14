import type { AIProviderRequest } from '@adaptive-workout/ai';
import type {
  ContractVersion,
  DomainId,
  EquipmentId,
  ExerciseFamilyId,
  ExerciseId,
  MuscleId,
} from '@adaptive-workout/domain';
import {
  clearGlmTaskHandlers,
  GlmAiProvider,
  registerGlmTaskHandler,
  type GlmRequestPayload,
  type GlmResponsePayload,
  type GlmTransport,
  type GlmTransportCall,
  type GlmTransportResult,
} from '@adaptive-workout/ai-glm-provider';
import {
  clearDeepSeekTaskHandlers,
  DeepSeekAiProvider,
  registerDeepSeekTaskHandler,
  type DeepSeekRequestPayload,
  type DeepSeekResponsePayload,
  type DeepSeekTransport,
  type DeepSeekTransportCall,
  type DeepSeekTransportResult,
} from '@adaptive-workout/ai-deepseek-provider';
import { afterEach, describe, expect, it } from 'vitest';
import { deepseekWorkoutIntentHandler, glmWorkoutIntentHandler } from './index';

const contractVersion = 'ai-contract-1' as ContractVersion;
const chestId = '00000000-0000-0000-0000-000000000001' as MuscleId;
const dumbbellId = '00000000-0000-0000-0000-000000000010' as EquipmentId;
const pressId = '00000000-0000-0000-0000-000000000020' as ExerciseId;
const pressFamilyId = '00000000-0000-0000-0000-000000000030' as ExerciseFamilyId;
const requestId = '00000000-0000-0000-0000-000000000099' as DomainId<'ai-request'>;

const workoutIntentRequest: AIProviderRequest<'workout_intent_extraction'> = {
  task: 'workout_intent_extraction',
  input: {
    task: 'workout_intent_extraction',
    contractVersion,
    requestText: '45 minute chest workout with dumbbells',
    controlledVocabulary: {
      muscleIds: [chestId],
      equipmentIds: [dumbbellId],
      exerciseIds: [pressId],
      exerciseFamilyIds: [pressFamilyId],
    },
    currentWorkout: null,
  },
  metadata: {
    requestId,
    requestedAt: '2026-07-14T10:00:00.000Z',
    timeoutMilliseconds: 10_000,
  },
};

const validModelJson = {
  targetMuscleIds: [chestId],
  excludedMuscleIds: [],
  availableDurationMinutes: 45,
  equipmentIntent: {
    kind: 'specified',
    availableEquipmentIds: [dumbbellId],
    unavailableEquipmentIds: [],
  },
  excludedExerciseIds: [],
  excludedExerciseFamilyIds: [],
  preferredMuscleIds: [chestId],
  constraints: [],
  missingInformation: [],
};

afterEach(() => {
  clearGlmTaskHandlers();
  clearDeepSeekTaskHandlers();
});

function okGlmResult(content: unknown): GlmTransportResult {
  return {
    responseMetadata: {
      providerId: 'glm',
      modelId: 'glm-4-plus',
      providerRequestId: 'glm-req-1',
      receivedAt: '2026-07-14T10:00:01.000Z',
      latencyMilliseconds: 1_000,
    },
    payload: { id: 'glm-req-1', content, finishReason: 'stop' } satisfies GlmResponsePayload,
    usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
  };
}

function okDeepSeekResult(content: unknown): DeepSeekTransportResult {
  return {
    responseMetadata: {
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
      providerRequestId: 'deepseek-req-1',
      receivedAt: '2026-07-14T10:00:01.000Z',
      latencyMilliseconds: 1_200,
    },
    payload: {
      id: 'deepseek-req-1',
      content,
      finishReason: 'stop',
    } satisfies DeepSeekResponsePayload,
    usage: { inputTokens: 18, outputTokens: 9, totalTokens: 27 },
  };
}

function fakeGlmTransport(result: GlmTransportResult): GlmTransport & {
  readonly lastPayload: () => GlmRequestPayload | null;
} {
  let lastPayload: GlmRequestPayload | null = null;
  const transport: GlmTransport & { readonly lastPayload: () => GlmRequestPayload | null } = {
    lastPayload: () => lastPayload,
    call(call: GlmTransportCall) {
      lastPayload = call.payload;
      return Promise.resolve({ status: 'ok', value: result });
    },
  };
  return transport;
}

function fakeDeepSeekTransport(
  result: DeepSeekTransportResult,
): DeepSeekTransport & { readonly lastPayload: () => DeepSeekRequestPayload | null } {
  let lastPayload: DeepSeekRequestPayload | null = null;
  const transport: DeepSeekTransport & {
    readonly lastPayload: () => DeepSeekRequestPayload | null;
  } = {
    lastPayload: () => lastPayload,
    call(call: DeepSeekTransportCall) {
      lastPayload = call.payload;
      return Promise.resolve({ status: 'ok', value: result });
    },
  };
  return transport;
}

describe('GLM workout-intent handler through GlmAiProvider', () => {
  it('returns a validated structured output for a successful provider response', async () => {
    registerGlmTaskHandler('workout_intent_extraction', glmWorkoutIntentHandler);
    const provider = new GlmAiProvider({
      transport: fakeGlmTransport(okGlmResult(validModelJson)),
    });

    const result = await provider.execute(workoutIntentRequest);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.targetMuscleIds).toEqual([chestId]);
      expect(result.output.availableDurationMinutes).toBe(45);
      expect(result.output.equipmentIntent.kind).toBe('specified');
    }
  });

  it('sends the request id and json response format to the transport', async () => {
    registerGlmTaskHandler('workout_intent_extraction', glmWorkoutIntentHandler);
    const transport = fakeGlmTransport(okGlmResult(validModelJson));
    const provider = new GlmAiProvider({ transport });

    await provider.execute(workoutIntentRequest);

    expect(transport.lastPayload()?.requestId).toBe(requestId);
    expect(transport.lastPayload()?.responseFormat).toEqual({ type: 'json_object' });
    expect(transport.lastPayload()?.task).toBe('workout_intent_extraction');
  });

  it('returns a structured-output failure when the model emits invalid JSON', async () => {
    registerGlmTaskHandler('workout_intent_extraction', glmWorkoutIntentHandler);
    const provider = new GlmAiProvider({ transport: fakeGlmTransport(okGlmResult('not-json')) });

    const result = await provider.execute(workoutIntentRequest);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.failure.code).toBe('STRUCTURED_OUTPUT_VALIDATION_FAILED');
    }
  });
});

describe('DeepSeek workout-intent handler through DeepSeekAiProvider', () => {
  it('returns a validated structured output for a successful provider response', async () => {
    registerDeepSeekTaskHandler('workout_intent_extraction', deepseekWorkoutIntentHandler);
    const provider = new DeepSeekAiProvider({
      transport: fakeDeepSeekTransport(okDeepSeekResult(validModelJson)),
    });

    const result = await provider.execute(workoutIntentRequest);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.targetMuscleIds).toEqual([chestId]);
      expect(result.responseMetadata.providerId).toBe('deepseek');
    }
  });

  it('returns a structured-output failure when the model invents an id', async () => {
    const invented = {
      ...validModelJson,
      targetMuscleIds: ['ffffffff-ffff-ffff-ffff-ffffffffffff'],
    };
    registerDeepSeekTaskHandler('workout_intent_extraction', deepseekWorkoutIntentHandler);
    const provider = new DeepSeekAiProvider({
      transport: fakeDeepSeekTransport(okDeepSeekResult(invented)),
    });

    const result = await provider.execute(workoutIntentRequest);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.failure.code).toBe('STRUCTURED_OUTPUT_VALIDATION_FAILED');
    }
  });

  it('keeps unstated duration null and equipment unspecified', async () => {
    const sparse = {
      ...validModelJson,
      availableDurationMinutes: null,
      equipmentIntent: { kind: 'unspecified' },
    };
    registerDeepSeekTaskHandler('workout_intent_extraction', deepseekWorkoutIntentHandler);
    const provider = new DeepSeekAiProvider({
      transport: fakeDeepSeekTransport(okDeepSeekResult(sparse)),
    });

    const result = await provider.execute(workoutIntentRequest);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.availableDurationMinutes).toBeNull();
      expect(result.output.equipmentIntent.kind).toBe('unspecified');
    }
  });
});
