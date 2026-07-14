import type { AIProviderRequest } from '@adaptive-workout/ai';
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
import {
  discomfortActivityContexts,
  discomfortBodyAreas,
  discomfortBodySides,
  discomfortMovementPatterns,
  painSafetyTriStateValues,
} from '@adaptive-workout/pain-safety';
import type {
  ContractVersion,
  DomainId,
  ExerciseFamilyId,
  ExerciseId,
} from '@adaptive-workout/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { deepseekDiscomfortHandler, glmDiscomfortHandler } from './index';

const contractVersion = 'ai-contract-1' as ContractVersion;
const pressId = '00000000-0000-0000-0000-000000000020' as ExerciseId;
const pressFamilyId = '00000000-0000-0000-0000-000000000030' as ExerciseFamilyId;
const requestId = '00000000-0000-0000-0000-000000000099' as DomainId<'ai-request'>;

const discomfortRequest: AIProviderRequest<'discomfort_observation_extraction'> = {
  task: 'discomfort_observation_extraction',
  input: {
    task: 'discomfort_observation_extraction',
    contractVersion,
    reportText: 'J\u2019ai mal au genou gauche, 3 sur 10. La flexion profonde me gêne.',
    controlledVocabulary: {
      bodyAreas: discomfortBodyAreas,
      bodySides: discomfortBodySides,
      movementPatterns: discomfortMovementPatterns,
      activityContexts: discomfortActivityContexts,
      triStateValues: painSafetyTriStateValues,
      exerciseIds: [pressId],
      exerciseFamilyIds: [pressFamilyId],
    },
    knownEvent: null,
  },
  metadata: {
    requestId,
    requestedAt: '2026-07-14T10:00:00.000Z',
    timeoutMilliseconds: 10_000,
  },
};

const allUnknownSafety = {
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

const validModelJson = {
  bodyArea: 'knee',
  side: 'left',
  severity: 3,
  onsetPattern: 'unknown',
  activityContext: 'training',
  trend: 'unknown',
  movementTriggerStatus: 'present',
  movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'deep_flexion' }],
  safety: allUnknownSafety,
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
    usage: { inputTokens: 24, outputTokens: 12, totalTokens: 36 },
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
    usage: { inputTokens: 22, outputTokens: 11, totalTokens: 33 },
  };
}

function fakeGlmTransport(result: GlmTransportResult): GlmTransport & {
  readonly lastPayload: () => GlmRequestPayload | null;
} {
  let lastPayload: GlmRequestPayload | null = null;
  return {
    lastPayload: () => lastPayload,
    call(call: GlmTransportCall) {
      lastPayload = call.payload;
      return Promise.resolve({ status: 'ok', value: result });
    },
  };
}

function fakeDeepSeekTransport(result: DeepSeekTransportResult): DeepSeekTransport & {
  readonly lastPayload: () => DeepSeekRequestPayload | null;
} {
  let lastPayload: DeepSeekRequestPayload | null = null;
  return {
    lastPayload: () => lastPayload,
    call(call: DeepSeekTransportCall) {
      lastPayload = call.payload;
      return Promise.resolve({ status: 'ok', value: result });
    },
  };
}

describe('GLM discomfort handler through GlmAiProvider', () => {
  it('returns a validated structured output', async () => {
    registerGlmTaskHandler('discomfort_observation_extraction', glmDiscomfortHandler);
    const provider = new GlmAiProvider({
      transport: fakeGlmTransport(okGlmResult(validModelJson)),
    });

    const result = await provider.execute(discomfortRequest);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.bodyArea).toBe('knee');
      expect(result.output.side).toBe('left');
      expect(result.output.severity).toBe(3);
      expect(result.output.movementTriggers).toEqual([
        { kind: 'movement_pattern', movementPattern: 'deep_flexion' },
      ]);
    }
  });

  it('sends the task and json response format to the transport', async () => {
    registerGlmTaskHandler('discomfort_observation_extraction', glmDiscomfortHandler);
    const transport = fakeGlmTransport(okGlmResult(validModelJson));
    await new GlmAiProvider({ transport }).execute(discomfortRequest);

    expect(transport.lastPayload()?.task).toBe('discomfort_observation_extraction');
    expect(transport.lastPayload()?.responseFormat).toEqual({ type: 'json_object' });
  });

  it('returns a structured-output failure for diagnosis-shaped output (router fallback-eligible)', async () => {
    registerGlmTaskHandler('discomfort_observation_extraction', glmDiscomfortHandler);
    const provider = new GlmAiProvider({
      transport: fakeGlmTransport(okGlmResult({ ...validModelJson, diagnosis: 'meniscus_tear' })),
    });

    const result = await provider.execute(discomfortRequest);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      // STRUCTURED_OUTPUT_VALIDATION_FAILED is in the router's fallback-eligible set.
      expect(result.failure.code).toBe('STRUCTURED_OUTPUT_VALIDATION_FAILED');
    }
  });
});

describe('DeepSeek discomfort handler through DeepSeekAiProvider', () => {
  it('returns the same canonical output contract as GLM', async () => {
    registerDeepSeekTaskHandler('discomfort_observation_extraction', deepseekDiscomfortHandler);
    const provider = new DeepSeekAiProvider({
      transport: fakeDeepSeekTransport(okDeepSeekResult(validModelJson)),
    });

    const result = await provider.execute(discomfortRequest);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      // Same canonical contract: identical fields and controlled values.
      expect(result.output.bodyArea).toBe('knee');
      expect(result.output.side).toBe('left');
      expect(result.output.severity).toBe(3);
      expect(result.output.movementTriggerStatus).toBe('present');
      expect(result.output.safety.swelling).toBe('unknown');
      expect(result.responseMetadata.providerId).toBe('deepseek');
    }
  });

  it('keeps unstated safety fields unknown through DeepSeek', async () => {
    registerDeepSeekTaskHandler('discomfort_observation_extraction', deepseekDiscomfortHandler);
    const provider = new DeepSeekAiProvider({
      transport: fakeDeepSeekTransport(okDeepSeekResult(validModelJson)),
    });

    const result = await provider.execute(discomfortRequest);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      for (const value of Object.values(result.output.safety)) {
        expect(value).toBe('unknown');
      }
    }
  });

  it('returns a structured-output failure when severity exceeds 10', async () => {
    registerDeepSeekTaskHandler('discomfort_observation_extraction', deepseekDiscomfortHandler);
    const provider = new DeepSeekAiProvider({
      transport: fakeDeepSeekTransport(okDeepSeekResult({ ...validModelJson, severity: 15 })),
    });

    const result = await provider.execute(discomfortRequest);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.failure.code).toBe('STRUCTURED_OUTPUT_VALIDATION_FAILED');
    }
  });
});
