import type {
  AIAuthoritativeDecision,
  AIDecisionId,
  AIProviderRequest,
  GroundedDecisionExplanationInput,
} from '@adaptive-workout/ai';
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
import type { ContractVersion, EngineVersion, RuleSetVersion } from '@adaptive-workout/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { deepseekExplanationHandler, glmExplanationHandler } from './index';

const contractVersion = 'ai-contract-1' as ContractVersion;
const decisionId = '00000000-0000-0000-0000-000000000001' as AIDecisionId;
const engineVersion = '1.0.0' as EngineVersion;
const ruleSetVersion = 'rules-1' as RuleSetVersion;
const decidedAt = '2026-07-14T10:00:00.000Z';

const progressionDecision: AIAuthoritativeDecision = {
  kind: 'progression',
  decisionId,
  action: 'increase_load',
  reasonCodes: ['TARGET_REPS_ACHIEVED', 'TARGET_RIR_ACHIEVED', 'LOAD_INCREMENT_APPLIED'],
  evidence: [
    { evidenceId: 'exposure:latest', kind: 'exposure', fact: '32 kg for 10 reps at RIR 2.' },
    {
      evidenceId: 'rule:smallest-increment',
      kind: 'rule',
      fact: 'Smallest valid increment is 2 kg.',
    },
  ],
  version: { engineName: 'progression-engine', engineVersion, ruleSetVersion },
  decidedAt,
};

const explanationRequest: AIProviderRequest<'grounded_decision_explanation'> = {
  task: 'grounded_decision_explanation',
  input: {
    task: 'grounded_decision_explanation',
    contractVersion,
    decision: progressionDecision,
    locale: 'fr-FR',
    maximumCharacters: 500,
  } satisfies GroundedDecisionExplanationInput,
  metadata: {
    requestId: '00000000-0000-0000-0000-000000000099' as never,
    requestedAt: decidedAt,
    timeoutMilliseconds: 10_000,
  },
};

const validModelJson = {
  explanationText:
    'Charge passée de 32 kg à 34 kg après des performances répétées dans la fourchette cible avec RIR connu.',
  reasonCodeReferences: ['TARGET_REPS_ACHIEVED', 'TARGET_RIR_ACHIEVED', 'LOAD_INCREMENT_APPLIED'],
  evidenceIdReferences: ['exposure:latest', 'rule:smallest-increment'],
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
      latencyMilliseconds: 900,
    },
    payload: { id: 'glm-req-1', content, finishReason: 'stop' } satisfies GlmResponsePayload,
    usage: { inputTokens: 30, outputTokens: 15, totalTokens: 45 },
  };
}

function okDeepSeekResult(content: unknown): DeepSeekTransportResult {
  return {
    responseMetadata: {
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
      providerRequestId: 'deepseek-req-1',
      receivedAt: '2026-07-14T10:00:01.000Z',
      latencyMilliseconds: 1_100,
    },
    payload: {
      id: 'deepseek-req-1',
      content,
      finishReason: 'stop',
    } satisfies DeepSeekResponsePayload,
    usage: { inputTokens: 28, outputTokens: 14, totalTokens: 42 },
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

describe('GLM explanation handler through GlmAiProvider', () => {
  it('returns a validated explanation grounded in supplied codes and evidence', async () => {
    registerGlmTaskHandler('grounded_decision_explanation', glmExplanationHandler);
    const provider = new GlmAiProvider({
      transport: fakeGlmTransport(okGlmResult(validModelJson)),
    });

    const result = await provider.execute(explanationRequest);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.explanationText).toContain('32 kg');
      expect(result.output.reasonCodeReferences).toEqual([
        'TARGET_REPS_ACHIEVED',
        'TARGET_RIR_ACHIEVED',
        'LOAD_INCREMENT_APPLIED',
      ]);
      expect(result.output.evidenceIdReferences).toEqual([
        'exposure:latest',
        'rule:smallest-increment',
      ]);
    }
  });

  it('sends the task and json response format to the transport', async () => {
    registerGlmTaskHandler('grounded_decision_explanation', glmExplanationHandler);
    const transport = fakeGlmTransport(okGlmResult(validModelJson));
    await new GlmAiProvider({ transport }).execute(explanationRequest);

    expect(transport.lastPayload()?.task).toBe('grounded_decision_explanation');
    expect(transport.lastPayload()?.responseFormat).toEqual({ type: 'json_object' });
  });

  it('returns a structured-output failure when the model invents a reason code', async () => {
    registerGlmTaskHandler('grounded_decision_explanation', glmExplanationHandler);
    const provider = new GlmAiProvider({
      transport: fakeGlmTransport(
        okGlmResult({ ...validModelJson, reasonCodeReferences: ['INVENTED'] }),
      ),
    });

    const result = await provider.execute(explanationRequest);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.failure.code).toBe('STRUCTURED_OUTPUT_VALIDATION_FAILED');
    }
  });
});

describe('DeepSeek explanation handler through DeepSeekAiProvider', () => {
  it('returns the same canonical contract as GLM', async () => {
    registerDeepSeekTaskHandler('grounded_decision_explanation', deepseekExplanationHandler);
    const provider = new DeepSeekAiProvider({
      transport: fakeDeepSeekTransport(okDeepSeekResult(validModelJson)),
    });

    const result = await provider.execute(explanationRequest);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output.explanationText).toBe(validModelJson.explanationText);
      expect(result.output.reasonCodeReferences).toEqual(validModelJson.reasonCodeReferences);
      expect(result.output.evidenceIdReferences).toEqual(validModelJson.evidenceIdReferences);
      expect(result.responseMetadata.providerId).toBe('deepseek');
    }
  });

  it('returns a structured-output failure when the model invents an evidence id', async () => {
    registerDeepSeekTaskHandler('grounded_decision_explanation', deepseekExplanationHandler);
    const provider = new DeepSeekAiProvider({
      transport: fakeDeepSeekTransport(
        okDeepSeekResult({ ...validModelJson, evidenceIdReferences: ['invented:evidence'] }),
      ),
    });

    const result = await provider.execute(explanationRequest);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.failure.code).toBe('STRUCTURED_OUTPUT_VALIDATION_FAILED');
    }
  });

  it('rejects a replacement action field in the output', async () => {
    registerDeepSeekTaskHandler('grounded_decision_explanation', deepseekExplanationHandler);
    const provider = new DeepSeekAiProvider({
      transport: fakeDeepSeekTransport(
        okDeepSeekResult({ ...validModelJson, action: 'maintain_load' }),
      ),
    });

    const result = await provider.execute(explanationRequest);

    expect(result.status).toBe('failure');
  });
});
