import type {
  AIProvider,
  AIProviderDefinition,
  AIProviderFailure,
  AIProviderRequest,
  AIProviderResult,
  AITaskKind,
} from '@adaptive-workout/ai';
import type {
  ContractVersion,
  DomainId,
  EngineVersion,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import { describe, expect, it } from 'vitest';
import { AiRouter, validateAiRouterOptions } from './router';
import {
  aiRouterErrorReasons,
  defaultAiRoutingRuleSet,
  type AiRouterResult,
  type AiRoutingRuleSet,
} from './contracts';
import { packageName } from './index';

const contractVersion = 'ai-contract-1' as ContractVersion;
const requestId = '00000000-0000-0000-0000-000000000002' as DomainId<'ai-request'>;
const decisionId = '00000000-0000-0000-0000-000000000001' as DomainId<'decision'>;

const engineVersion = '1.0.0' as EngineVersion;
const ruleSetVersion = 'rules-1' as RuleSetVersion;

const routerRuleSet = defaultAiRoutingRuleSet;

const supportedTasks: readonly AITaskKind[] = [
  'workout_intent_extraction',
  'discomfort_observation_extraction',
  'grounded_decision_explanation',
];

const explanationRequest: AIProviderRequest<'grounded_decision_explanation'> = {
  task: 'grounded_decision_explanation',
  input: {
    task: 'grounded_decision_explanation',
    contractVersion,
    locale: 'en-US',
    maximumCharacters: 240,
    decision: {
      kind: 'workout',
      decisionId,
      action: { kind: 'generated_workout', origin: 'generated' },
      reasonCodes: ['TARGET_MUSCLE_COVERAGE'],
      evidence: [{ evidenceId: 'exercise:press', kind: 'exercise', fact: 'Press was selected.' }],
      version: { engineName: 'workout-engine', engineVersion, ruleSetVersion },
      decidedAt: '2026-07-14T10:00:00.000Z',
    },
  },
  metadata: {
    requestId,
    requestedAt: '2026-07-14T10:00:00.000Z',
    timeoutMilliseconds: 10_000,
  },
};

function defineProvider(providerId: string, modelId: string): AIProviderDefinition {
  return Object.freeze({ providerId, modelId, supportedTasks });
}

/**
 * Test stub that records calls and returns a fixed outcome. The outcome is
 * shaped for the explanation task used across the routing tests; `execute`
 * preserves the request's actual task so returned results stay type-correct.
 */
function stubProvider(
  definition: AIProviderDefinition,
  outcome:
    | AIProviderResult<'grounded_decision_explanation'>
    | (() => AIProviderResult<'grounded_decision_explanation'>),
): AIProvider & { readonly callCount: () => number } {
  let count = 0;
  const provider: AIProvider & { readonly callCount: () => number } = {
    definition,
    execute<T extends AITaskKind>(request: AIProviderRequest<T>): Promise<AIProviderResult<T>> {
      count += 1;
      const resolved = typeof outcome === 'function' ? outcome() : outcome;
      return Promise.resolve({ ...resolved, task: request.task } as AIProviderResult<T>);
    },
    callCount: () => count,
  };
  return provider;
}

function successResult(
  providerId: string,
  modelId: string,
): AIProviderResult<'grounded_decision_explanation'> {
  return {
    status: 'success',
    task: 'grounded_decision_explanation',
    output: {
      task: 'grounded_decision_explanation',
      contractVersion,
      explanationText: `${providerId} explained the decision.`,
      reasonCodeReferences: ['TARGET_MUSCLE_COVERAGE'],
      evidenceIdReferences: ['exercise:press'],
    },
    responseMetadata: {
      providerId,
      modelId,
      providerRequestId: `${providerId}-request-1`,
      receivedAt: '2026-07-14T10:00:01.000Z',
      latencyMilliseconds: 1_000,
    },
    usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
  };
}

function failureResult(
  code: AIProviderFailure['code'],
  providerId: string,
  modelId: string,
  retryable: boolean,
): AIProviderResult<'grounded_decision_explanation'> {
  return {
    status: 'failure',
    task: 'grounded_decision_explanation',
    failure: {
      code,
      message: `${providerId} failed with ${code}.`,
      retryable,
      reasonCodes: [`${providerId}.${code.toLowerCase()}`],
    },
    responseMetadata: {
      providerId,
      modelId,
      providerRequestId: null,
      receivedAt: '2026-07-14T10:00:01.000Z',
      latencyMilliseconds: 500,
    },
    usage: null,
  };
}

const glm = defineProvider('glm', 'glm-4-plus');
const deepseek = defineProvider('deepseek', 'deepseek-chat');

describe('ai-router package', () => {
  it('exports the documented package name', () => {
    expect(packageName).toBe('@adaptive-workout/ai-router');
  });
});

describe('AiRouter routing', () => {
  it('returns GLM success without calling DeepSeek', async () => {
    const primary = stubProvider(glm, successResult('glm', 'glm-4-plus'));
    const fallback = stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'));
    const router = new AiRouter({ providers: [primary, fallback], ruleSet: routerRuleSet });

    const result = await router.execute(explanationRequest);

    expect(result.status).toBe('success');
    expect(primary.callCount()).toBe(1);
    expect(fallback.callCount()).toBe(0);
    if (result.status === 'success') {
      expect(result.responseMetadata.providerId).toBe('glm');
    }
  });

  it('triggers DeepSeek fallback on GLM timeout', async () => {
    const primary = stubProvider(glm, failureResult('PROVIDER_TIMEOUT', 'glm', 'glm-4-plus', true));
    const fallback = stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'));
    const router = new AiRouter({ providers: [primary, fallback], ruleSet: routerRuleSet });

    const routed = await router.route(explanationRequest);

    expect(primary.callCount()).toBe(1);
    expect(fallback.callCount()).toBe(1);
    expect(routed.result.status).toBe('success');
    expect(routed.attempts).toHaveLength(2);
  });

  it('triggers DeepSeek fallback on GLM unavailability', async () => {
    const primary = stubProvider(
      glm,
      failureResult('PROVIDER_UNAVAILABLE', 'glm', 'glm-4-plus', true),
    );
    const fallback = stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'));
    const router = new AiRouter({ providers: [primary, fallback], ruleSet: routerRuleSet });

    const routed = await router.route(explanationRequest);

    expect(fallback.callCount()).toBe(1);
    expect(routed.result.status).toBe('success');
  });

  it('triggers DeepSeek fallback on GLM malformed provider response', async () => {
    const primary = stubProvider(
      glm,
      failureResult('MALFORMED_PROVIDER_RESPONSE', 'glm', 'glm-4-plus', false),
    );
    const fallback = stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'));
    const router = new AiRouter({ providers: [primary, fallback], ruleSet: routerRuleSet });

    const routed = await router.route(explanationRequest);

    expect(fallback.callCount()).toBe(1);
    expect(routed.result.status).toBe('success');
  });

  it('triggers DeepSeek fallback on GLM structured-output validation failure', async () => {
    const primary = stubProvider(
      glm,
      failureResult('STRUCTURED_OUTPUT_VALIDATION_FAILED', 'glm', 'glm-4-plus', false),
    );
    const fallback = stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'));
    const router = new AiRouter({ providers: [primary, fallback], ruleSet: routerRuleSet });

    const routed = await router.route(explanationRequest);

    expect(fallback.callCount()).toBe(1);
    expect(routed.result.status).toBe('success');
  });

  it('does not call DeepSeek when GLM rejects the task as invalid input', async () => {
    const primary = stubProvider(
      glm,
      failureResult('INVALID_TASK_INPUT', 'glm', 'glm-4-plus', false),
    );
    const fallback = stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'));
    const router = new AiRouter({ providers: [primary, fallback], ruleSet: routerRuleSet });

    const routed = await router.route(explanationRequest);

    expect(fallback.callCount()).toBe(0);
    expect(routed.result.status).toBe('failure');
    if (routed.result.status === 'failure') {
      expect(routed.result.failure.code).toBe('INVALID_TASK_INPUT');
    }
  });

  it('does not call DeepSeek when GLM reports an unsupported task', async () => {
    const primary = stubProvider(
      glm,
      failureResult('UNSUPPORTED_TASK', 'glm', 'glm-4-plus', false),
    );
    const fallback = stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'));
    const router = new AiRouter({ providers: [primary, fallback], ruleSet: routerRuleSet });

    const routed = await router.route(explanationRequest);

    expect(fallback.callCount()).toBe(0);
    if (routed.result.status === 'failure') {
      expect(routed.result.failure.code).toBe('UNSUPPORTED_TASK');
    }
  });

  it('does not fall back on GLM authentication failure (terminal)', async () => {
    const primary = stubProvider(
      glm,
      failureResult('PROVIDER_AUTHENTICATION_FAILED', 'glm', 'glm-4-plus', false),
    );
    const fallback = stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'));
    const router = new AiRouter({ providers: [primary, fallback], ruleSet: routerRuleSet });

    const routed = await router.route(explanationRequest);

    expect(fallback.callCount()).toBe(0);
    if (routed.result.status === 'failure') {
      expect(routed.result.failure.code).toBe('PROVIDER_AUTHENTICATION_FAILED');
    }
  });

  it('returns DeepSeek success with correct provider metadata after GLM failure', async () => {
    const primary = stubProvider(glm, failureResult('PROVIDER_TIMEOUT', 'glm', 'glm-4-plus', true));
    const fallback = stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'));
    const router = new AiRouter({ providers: [primary, fallback], ruleSet: routerRuleSet });

    const result = await router.execute(explanationRequest);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.responseMetadata.providerId).toBe('deepseek');
      expect(result.responseMetadata.modelId).toBe('deepseek-chat');
    }
  });

  it('returns fallback exhausted when both providers fail with fallback-eligible codes', async () => {
    const primary = stubProvider(glm, failureResult('PROVIDER_TIMEOUT', 'glm', 'glm-4-plus', true));
    const fallback = stubProvider(
      deepseek,
      failureResult('PROVIDER_UNAVAILABLE', 'deepseek', 'deepseek-chat', true),
    );
    const router = new AiRouter({ providers: [primary, fallback], ruleSet: routerRuleSet });

    const routed = await router.route(explanationRequest);

    expect(routed.result.status).toBe('failure');
    if (routed.result.status === 'failure') {
      expect(routed.result.failure.code).toBe('FALLBACK_EXHAUSTED');
      expect(routed.result.failure.reasonCodes).toContain(aiRouterErrorReasons.fallbackExhausted);
    }
    expect(routed.attempts).toHaveLength(3);
  });

  it('preserves provider attempt order in the lineage', async () => {
    const primary = stubProvider(glm, failureResult('PROVIDER_TIMEOUT', 'glm', 'glm-4-plus', true));
    const fallback = stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'));
    const router = new AiRouter({ providers: [primary, fallback], ruleSet: routerRuleSet });

    const routed = await router.route(explanationRequest);

    const providerOrder = routed.attempts.map((attempt) => attempt.providerId);
    expect(providerOrder).toEqual(['glm', 'deepseek']);
    expect(routed.attempts[0]?.attemptIndex).toBe(0);
    expect(routed.attempts[1]?.attemptIndex).toBe(1);
  });

  it('bounds attempts to maximumProviderAttempts and never retries a provider', async () => {
    // Three providers configured but maximumProviderAttempts is 2.
    const third = defineProvider('openai-like', 'unused');
    const primary = stubProvider(glm, failureResult('PROVIDER_TIMEOUT', 'glm', 'glm-4-plus', true));
    const fallback = stubProvider(
      deepseek,
      failureResult('PROVIDER_TIMEOUT', 'deepseek', 'deepseek-chat', true),
    );
    const unused = stubProvider(third, successResult('openai-like', 'unused'));
    const boundedRuleSet: AiRoutingRuleSet = {
      ruleSetVersion: routerRuleSet.ruleSetVersion,
      fallbackEligibleFailureCodes: routerRuleSet.fallbackEligibleFailureCodes,
      maximumProviderAttempts: 2,
    };
    const router = new AiRouter({
      providers: [primary, fallback, unused],
      ruleSet: boundedRuleSet,
    });

    const routed = await router.route(explanationRequest);

    expect(primary.callCount()).toBe(1);
    expect(fallback.callCount()).toBe(1);
    expect(unused.callCount()).toBe(0);
    expect(routed.attempts).toHaveLength(3);
    if (routed.result.status === 'failure') {
      expect(routed.result.failure.code).toBe('FALLBACK_EXHAUSTED');
    }
  });

  it('produces deterministic results for identical configured outcomes', async () => {
    const outcome = () => failureResult('PROVIDER_TIMEOUT', 'glm', 'glm-4-plus', true);
    const buildRouter = () =>
      new AiRouter({
        providers: [
          stubProvider(glm, outcome),
          stubProvider(deepseek, successResult('deepseek', 'deepseek-chat')),
        ],
        ruleSet: routerRuleSet,
      });

    const first = await buildRouter().route(explanationRequest);
    const second = await buildRouter().route(explanationRequest);

    expect(first.result).toEqual(second.result);
    expect(first.attempts.map((a) => a.providerId)).toEqual(
      second.attempts.map((a) => a.providerId),
    );
    expect(first.routingRuleSetVersion).toBe(second.routingRuleSetVersion);
  });
});

describe('AiRouter lineage metadata', () => {
  it('marks fallback-eligible failures and records the terminal result', async () => {
    const primary = stubProvider(glm, failureResult('PROVIDER_TIMEOUT', 'glm', 'glm-4-plus', true));
    const fallback = stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'));
    const router = new AiRouter({ providers: [primary, fallback], ruleSet: routerRuleSet });

    const routed: AiRouterResult<'grounded_decision_explanation'> =
      await router.route(explanationRequest);

    expect(routed.attempts[0]?.fallbackEligible).toBe(true);
    expect(routed.attempts[1]?.fallbackEligible).toBe(false);
  });

  it('preserves the routing rule-set version on the result', async () => {
    const primary = stubProvider(glm, successResult('glm', 'glm-4-plus'));
    const router = new AiRouter({
      providers: [primary, stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'))],
      ruleSet: routerRuleSet,
    });

    const routed = await router.route(explanationRequest);

    expect(routed.routingRuleSetVersion).toBe(routerRuleSet.ruleSetVersion);
  });
});

describe('validateAiRouterOptions', () => {
  const okProvider = stubProvider(glm, successResult('glm', 'glm-4-plus'));

  it('rejects an empty provider list', () => {
    const result = validateAiRouterOptions({
      providers: [],
      ruleSet: routerRuleSet,
    });
    expect(result).toMatchObject({ ok: false, failure: { code: 'NO_PROVIDERS_CONFIGURED' } });
  });

  it('rejects a non-positive maximum attempts value', () => {
    const result = validateAiRouterOptions({
      providers: [okProvider],
      ruleSet: { ...routerRuleSet, maximumProviderAttempts: 0 },
    });
    expect(result).toMatchObject({ ok: false, failure: { code: 'MAXIMUM_ATTEMPTS_INVALID' } });
  });

  it('rejects duplicate providers', () => {
    const result = validateAiRouterOptions({
      providers: [okProvider, okProvider],
      ruleSet: routerRuleSet,
    });
    expect(result).toMatchObject({ ok: false, failure: { code: 'DUPLICATE_PROVIDER' } });
  });

  it('rejects an unknown fallback-eligible failure code', () => {
    const result = validateAiRouterOptions({
      providers: [okProvider, stubProvider(deepseek, successResult('deepseek', 'deepseek-chat'))],
      ruleSet: {
        ...routerRuleSet,
        fallbackEligibleFailureCodes: ['NOT_A_REAL_CODE' as AIProviderFailure['code']],
      },
    });
    expect(result).toMatchObject({ ok: false, failure: { code: 'FALLBACK_CODES_INVALID' } });
  });

  it('accepts a valid single-provider configuration', () => {
    expect(validateAiRouterOptions({ providers: [okProvider], ruleSet: routerRuleSet })).toEqual({
      ok: true,
    });
  });
});
