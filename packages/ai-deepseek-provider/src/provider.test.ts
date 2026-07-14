import {
  validateAIProviderResult,
  type AIProviderRequest,
  type AIProviderResponseMetadata,
  type AIDecisionId,
  type AIRequestId,
  type GroundedDecisionExplanationOutput,
} from '@adaptive-workout/ai';
import type { ContractVersion, EngineVersion, RuleSetVersion } from '@adaptive-workout/domain';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearDeepSeekTaskHandlers,
  DeepSeekAiProvider,
  deepseekProviderDefinition,
  registerDeepSeekTaskHandler,
} from './provider';
import {
  packageName,
  type DeepSeekRequestPayload,
  type DeepSeekResponsePayload,
  type DeepSeekTransport,
  type DeepSeekTransportCall,
  type DeepSeekTransportFailure,
  type DeepSeekTransportResult,
} from './index';

const fixedTimestamp = '2026-07-14T10:00:01.000Z';

function fixedClock(): string {
  return fixedTimestamp;
}

describe('ai-deepseek-provider package', () => {
  it('exports the documented package name and provider identity', () => {
    expect(packageName).toBe('@adaptive-workout/ai-deepseek-provider');
    expect(deepseekProviderDefinition.providerId).toBe('deepseek');
    expect(deepseekProviderDefinition.supportedTasks).toContain('workout_intent_extraction');
  });
});

afterEach(() => {
  clearDeepSeekTaskHandlers();
});

const fakeProviderRequest: AIProviderRequest<'grounded_decision_explanation'> = {
  task: 'grounded_decision_explanation',
  input: {
    task: 'grounded_decision_explanation',
    contractVersion: 'ai-contract-1' as ContractVersion,
    locale: 'en-US',
    maximumCharacters: 240,
    decision: {
      kind: 'workout',
      decisionId: '00000000-0000-0000-0000-000000000001' as AIDecisionId,
      action: { kind: 'generated_workout', origin: 'generated' },
      reasonCodes: ['TARGET_MUSCLE_COVERAGE'],
      evidence: [{ evidenceId: 'exercise:press', kind: 'exercise', fact: 'Press was selected.' }],
      version: {
        engineName: 'workout-engine',
        engineVersion: '1.0.0' as EngineVersion,
        ruleSetVersion: 'rules-1' as RuleSetVersion,
      },
      decidedAt: '2026-07-14T10:00:00.000Z',
    },
  },
  metadata: {
    requestId: '00000000-0000-0000-0000-000000000002' as AIRequestId,
    requestedAt: '2026-07-14T10:00:00.000Z',
    timeoutMilliseconds: 10_000,
  },
};

const validExplanationOutput: GroundedDecisionExplanationOutput = {
  task: 'grounded_decision_explanation',
  contractVersion: 'ai-contract-1' as ContractVersion,
  explanationText: 'The deterministic decision follows the supplied evidence.',
  reasonCodeReferences: ['TARGET_MUSCLE_COVERAGE'],
  evidenceIdReferences: ['exercise:press'],
};

function okResponseMetadata(
  overrides: Partial<AIProviderResponseMetadata> = {},
): AIProviderResponseMetadata {
  return {
    providerId: 'deepseek',
    modelId: 'deepseek-chat',
    providerRequestId: 'provider-request-1',
    receivedAt: fixedTimestamp,
    latencyMilliseconds: 1_000,
    ...overrides,
  };
}

function okTransportResult(
  content: unknown,
  overrides: Partial<DeepSeekTransportResult> = {},
): DeepSeekTransportResult {
  return {
    responseMetadata: okResponseMetadata(),
    payload: {
      id: 'provider-request-1',
      content,
      finishReason: 'stop',
    },
    usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
    ...overrides,
  };
}

function fakeTransport(
  behavior:
    | { readonly kind: 'ok'; readonly result: DeepSeekTransportResult }
    | { readonly kind: 'failure'; readonly failure: DeepSeekTransportFailure }
    | { readonly kind: 'throw'; readonly error: unknown },
): DeepSeekTransport & { readonly calls: DeepSeekTransportCall[] } {
  const calls: DeepSeekTransportCall[] = [];
  return {
    calls,
    call(call: DeepSeekTransportCall) {
      calls.push(call);
      if (behavior.kind === 'throw') {
        const thrown =
          behavior.error instanceof Error ? behavior.error : new Error(String(behavior.error));
        return Promise.reject(thrown);
      }
      if (behavior.kind === 'failure')
        return Promise.resolve({ status: 'failure', failure: behavior.failure });
      return Promise.resolve({ status: 'ok', value: behavior.result });
    },
  };
}

function registerEchoHandler(
  output: GroundedDecisionExplanationOutput,
  options?: {
    readonly parseFailure?: string;
  },
): void {
  registerDeepSeekTaskHandler('grounded_decision_explanation', {
    buildRequestPayload(request): DeepSeekRequestPayload {
      return {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'explain this decision' }],
        responseFormat: { type: 'json_object' },
        temperature: 0,
        requestId: request.metadata.requestId,
        task: 'grounded_decision_explanation',
        contractVersion: request.input.contractVersion,
      };
    },
    parseTaskOutput(_request, response: DeepSeekResponsePayload) {
      if (options?.parseFailure !== undefined) {
        return { status: 'failure', message: options.parseFailure };
      }
      const content = response.content as GroundedDecisionExplanationOutput | null;
      if (content === null) {
        return { status: 'failure', message: 'DeepSeek returned no content.' };
      }
      return { status: 'ok', output };
    },
  });
}

describe('DeepSeekAiProvider execute', () => {
  it('returns a typed success result validated against the AI contract', async () => {
    const transport = fakeTransport({ kind: 'ok', result: okTransportResult({ valid: true }) });
    registerEchoHandler(validExplanationOutput);
    const provider = new DeepSeekAiProvider({ transport, clock: fixedClock });

    const result = await provider.execute(fakeProviderRequest);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.output).toEqual(validExplanationOutput);
      expect(result.responseMetadata.providerId).toBe('deepseek');
      expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10, totalTokens: 30 });
    }
    const validation = validateAIProviderResult(fakeProviderRequest, result);
    expect(validation.ok).toBe(true);
  });

  it('passes the request payload and abort signal to the transport', async () => {
    const transport = fakeTransport({ kind: 'ok', result: okTransportResult({ valid: true }) });
    registerEchoHandler(validExplanationOutput);
    const provider = new DeepSeekAiProvider({ transport, clock: fixedClock });

    await provider.execute(fakeProviderRequest);

    expect(transport.calls).toHaveLength(1);
    const call = transport.calls[0];
    expect(call?.payload.task).toBe('grounded_decision_explanation');
    expect(call?.payload.requestId).toBe(fakeProviderRequest.metadata.requestId);
    expect(call?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('reports UNSUPPORTED_TASK when the task has no registered handler', async () => {
    const transport = fakeTransport({ kind: 'ok', result: okTransportResult({ valid: true }) });
    const provider = new DeepSeekAiProvider({ transport, clock: fixedClock });

    const result = await provider.execute(fakeProviderRequest);

    expect(result).toMatchObject({
      status: 'failure',
      failure: { code: 'UNSUPPORTED_TASK', retryable: false },
    });
    expect(transport.calls).toHaveLength(0);
  });

  it('maps an authentication failure to PROVIDER_AUTHENTICATION_FAILED', async () => {
    const transport = fakeTransport({
      kind: 'failure',
      failure: { kind: 'authentication_failed' },
    });
    registerEchoHandler(validExplanationOutput);
    const provider = new DeepSeekAiProvider({ transport, clock: fixedClock });

    const result = await provider.execute(fakeProviderRequest);

    expect(result).toMatchObject({
      status: 'failure',
      failure: { code: 'PROVIDER_AUTHENTICATION_FAILED', retryable: false },
    });
  });

  it('maps a rate-limit failure to PROVIDER_RATE_LIMITED and stays retryable', async () => {
    const transport = fakeTransport({ kind: 'failure', failure: { kind: 'rate_limited' } });
    registerEchoHandler(validExplanationOutput);
    const provider = new DeepSeekAiProvider({ transport, clock: fixedClock });

    const result = await provider.execute(fakeProviderRequest);

    expect(result).toMatchObject({
      status: 'failure',
      failure: { code: 'PROVIDER_RATE_LIMITED', retryable: true },
    });
  });

  it('maps a timeout failure to PROVIDER_TIMEOUT', async () => {
    const transport = fakeTransport({ kind: 'failure', failure: { kind: 'timeout' } });
    registerEchoHandler(validExplanationOutput);
    const provider = new DeepSeekAiProvider({ transport, clock: fixedClock });

    const result = await provider.execute(fakeProviderRequest);

    expect(result).toMatchObject({
      status: 'failure',
      failure: { code: 'PROVIDER_TIMEOUT', retryable: true },
    });
  });

  it('maps an unavailable failure to PROVIDER_UNAVAILABLE', async () => {
    const transport = fakeTransport({ kind: 'failure', failure: { kind: 'unavailable' } });
    registerEchoHandler(validExplanationOutput);
    const provider = new DeepSeekAiProvider({ transport, clock: fixedClock });

    const result = await provider.execute(fakeProviderRequest);

    expect(result).toMatchObject({
      status: 'failure',
      failure: { code: 'PROVIDER_UNAVAILABLE', retryable: true },
    });
  });

  it('maps a malformed response failure to MALFORMED_PROVIDER_RESPONSE', async () => {
    const transport = fakeTransport({
      kind: 'failure',
      failure: { kind: 'malformed_response', message: 'choices array missing' },
    });
    registerEchoHandler(validExplanationOutput);
    const provider = new DeepSeekAiProvider({ transport, clock: fixedClock });

    const result = await provider.execute(fakeProviderRequest);

    expect(result).toMatchObject({
      status: 'failure',
      failure: {
        code: 'MALFORMED_PROVIDER_RESPONSE',
        message: 'choices array missing',
        retryable: false,
      },
    });
  });

  it('treats a transport exception as PROVIDER_UNAVAILABLE without leaking the stack', async () => {
    const transport = fakeTransport({
      kind: 'throw',
      error: new Error('connection reset'),
    });
    registerEchoHandler(validExplanationOutput);
    const provider = new DeepSeekAiProvider({ transport, clock: fixedClock });

    const result = await provider.execute(fakeProviderRequest);

    expect(result).toMatchObject({
      status: 'failure',
      failure: { code: 'PROVIDER_UNAVAILABLE', message: 'connection reset' },
    });
  });

  it('returns STRUCTURED_OUTPUT_VALIDATION_FAILED when the handler cannot parse output', async () => {
    const transport = fakeTransport({ kind: 'ok', result: okTransportResult({ valid: true }) });
    registerEchoHandler(validExplanationOutput, {
      parseFailure: 'JSON did not match the explanation schema.',
    });
    const provider = new DeepSeekAiProvider({ transport, clock: fixedClock });

    const result = await provider.execute(fakeProviderRequest);

    expect(result).toMatchObject({
      status: 'failure',
      failure: {
        code: 'STRUCTURED_OUTPUT_VALIDATION_FAILED',
        message: 'JSON did not match the explanation schema.',
      },
    });
    if (result.status === 'failure') {
      // Provider metadata and usage are retained even when the model output is invalid.
      expect(result.responseMetadata?.providerRequestId).toBe('provider-request-1');
      expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10, totalTokens: 30 });
    }
  });

  it('returns STRUCTURED_OUTPUT_VALIDATION_FAILED when the result fails provider-result validation', async () => {
    // Usage tokens do not sum, which validateAIUsageMetadata rejects.
    const transport = fakeTransport({
      kind: 'ok',
      result: okTransportResult(
        { valid: true },
        {
          usage: { inputTokens: 20, outputTokens: 10, totalTokens: 999 },
        },
      ),
    });
    registerEchoHandler(validExplanationOutput);
    const provider = new DeepSeekAiProvider({ transport, clock: fixedClock });

    const result = await provider.execute(fakeProviderRequest);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.failure.code).toBe('STRUCTURED_OUTPUT_VALIDATION_FAILED');
    }
  });
});

describe('DeepSeekAiProvider definition', () => {
  it('exposes the default model and advertises all structured tasks', () => {
    const transport = fakeTransport({ kind: 'ok', result: okTransportResult({ valid: true }) });
    const provider = new DeepSeekAiProvider({ transport, clock: fixedClock });
    expect(provider.definition.modelId).toBe('deepseek-chat');
    expect(provider.definition.supportedTasks).toHaveLength(3);
  });

  it('allows a custom model id without changing the provider id', () => {
    const transport = fakeTransport({ kind: 'ok', result: okTransportResult({ valid: true }) });
    const provider = new DeepSeekAiProvider({
      transport,
      modelId: 'deepseek-reasoner',
      clock: fixedClock,
    });
    expect(provider.definition.providerId).toBe('deepseek');
    expect(provider.definition.modelId).toBe('deepseek-reasoner');
  });
});
