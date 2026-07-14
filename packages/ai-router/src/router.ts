import type {
  AIProvider,
  AIProviderFailure,
  AIProviderRequest,
  AIProviderResult,
  AITaskKind,
} from '@adaptive-workout/ai';
import { aiProviderFailureCodes } from '@adaptive-workout/ai';
import {
  aiRouterErrorReasons,
  type AiRouterAttempt,
  type AiRouterResult,
  type AiRouterValidationFailure,
  type AiRouterValidationResult,
  type AiRoutingRuleSet,
} from './contracts.js';

export interface AiRouterOptions {
  /**
   * Ordered providers. The router calls them in order: index 0 is primary
   * (GLM), later entries are fallbacks (DeepSeek). The router does not import
   * any provider package; it only depends on the `AIProvider` abstraction.
   */
  readonly providers: readonly AIProvider[];
  readonly ruleSet: AiRoutingRuleSet;
}

/**
 * Deterministic, bounded provider router behind the existing `AIProvider`
 * abstraction. Calls the primary provider first; advances to the next provider
 * only when the previous attempt returned a fallback-eligible failure. Bounded
 * by `maximumProviderAttempts` — never retries a provider and never loops.
 *
 * The router never weakens schema validation or safety boundaries: it only
 * selects which provider's already-validated result to return. Each provider
 * validates its own structured output through the shared AI task validators.
 */
export class AiRouter implements AIProvider {
  readonly definition = primaryRouterDefinition;
  private readonly providers: readonly AIProvider[];
  private readonly ruleSet: AiRoutingRuleSet;

  constructor(options: AiRouterOptions) {
    this.providers = options.providers;
    this.ruleSet = options.ruleSet;
  }

  async execute<Task extends AITaskKind>(
    request: AIProviderRequest<Task>,
  ): Promise<AIProviderResult<Task>> {
    const result = await this.route(request);
    return result.result;
  }

  /**
   * Routes a request across providers and returns the typed final result plus
   * the full ordered attempt lineage. The lineage preserves provider/model
   * metadata, fallback eligibility, and each provider result so the decision is
   * fully traceable.
   */
  async route<Task extends AITaskKind>(
    request: AIProviderRequest<Task>,
  ): Promise<AiRouterResult<Task>> {
    const attempts: AiRouterAttempt<Task>[] = [];
    const attemptLimit = Math.min(this.ruleSet.maximumProviderAttempts, this.providers.length);

    for (let index = 0; index < attemptLimit; index += 1) {
      const provider = this.providers[index];
      if (provider === undefined) break;
      if (!provider.definition.supportedTasks.includes(request.task)) {
        continue;
      }

      const result = await provider.execute(request);
      const eligible = isFallbackEligible(result, this.ruleSet);
      attempts.push({
        providerId: provider.definition.providerId,
        modelId: provider.definition.modelId,
        attemptIndex: index,
        result,
        fallbackEligible: eligible,
      });

      if (result.status === 'success') {
        return finalize(attempts, this.ruleSet);
      }
      if (!eligible) {
        return finalize(attempts, this.ruleSet);
      }
      // Fallback-eligible failure: advance to the next provider if any remain.
    }

    return finalize(fallbackExhausted(request, attempts), this.ruleSet);
  }
}

const primaryRouterDefinition = Object.freeze({
  providerId: 'ai-router',
  modelId: 'router',
  supportedTasks: [
    'workout_intent_extraction',
    'discomfort_observation_extraction',
    'grounded_decision_explanation',
  ] as readonly AITaskKind[],
});

/**
 * Validates router configuration deterministically. Returns a typed failure
 * when providers are missing, attempts are unbounded, fallback codes are
 * invalid, a provider cannot serve the expected tasks, or a provider is
 * duplicated. Pure — does not invoke providers.
 */
export function validateAiRouterOptions(
  options: AiRouterOptions,
  expectedTasks: readonly AITaskKind[] = [
    'workout_intent_extraction',
    'discomfort_observation_extraction',
    'grounded_decision_explanation',
  ],
): AiRouterValidationResult {
  if (options.providers.length === 0) {
    return failure('NO_PROVIDERS_CONFIGURED', 'At least one provider is required.');
  }
  if (
    !Number.isInteger(options.ruleSet.maximumProviderAttempts) ||
    options.ruleSet.maximumProviderAttempts < 1
  ) {
    return failure(
      'MAXIMUM_ATTEMPTS_INVALID',
      'maximumProviderAttempts must be a positive integer.',
    );
  }
  if (
    options.ruleSet.maximumProviderAttempts < options.providers.length &&
    options.ruleSet.maximumProviderAttempts < 2
  ) {
    return failure(
      'MAXIMUM_ATTEMPTS_INVALID',
      'maximumProviderAttempts must allow at least one primary plus one fallback attempt.',
    );
  }
  if (options.ruleSet.fallbackEligibleFailureCodes.length === 0 && options.providers.length > 1) {
    return failure(
      'FALLBACK_CODES_INVALID',
      'fallbackEligibleFailureCodes must be configured when multiple providers are present.',
    );
  }
  for (const code of options.ruleSet.fallbackEligibleFailureCodes) {
    if (!aiProviderFailureCodes.includes(code)) {
      return failure('FALLBACK_CODES_INVALID', `Unknown failure code "${code}".`);
    }
  }

  const seenProviders = new Set<string>();
  for (const provider of options.providers) {
    if (seenProviders.has(provider.definition.providerId)) {
      return failure(
        'DUPLICATE_PROVIDER',
        `Duplicate provider "${provider.definition.providerId}".`,
      );
    }
    seenProviders.add(provider.definition.providerId);
    for (const task of expectedTasks) {
      if (!provider.definition.supportedTasks.includes(task)) {
        return failure(
          'PROVIDER_UNSUPPORTED_TASK',
          `Provider "${provider.definition.providerId}" does not support task "${task}".`,
        );
      }
    }
  }

  return { ok: true };
}

function isFallbackEligible(
  result: AIProviderResult<AITaskKind>,
  ruleSet: AiRoutingRuleSet,
): boolean {
  if (result.status !== 'failure') return false;
  return ruleSet.fallbackEligibleFailureCodes.includes(result.failure.code);
}

function finalize<Task extends AITaskKind>(
  attempts: readonly AiRouterAttempt<Task>[],
  ruleSet: AiRoutingRuleSet,
): AiRouterResult<Task> {
  const last = attempts[attempts.length - 1];
  if (last === undefined) {
    throw new Error('AiRouter finalized with no attempts; this is a router bug.');
  }
  return {
    result: last.result,
    attempts,
    routingRuleSetVersion: ruleSet.ruleSetVersion,
  };
}

function fallbackExhausted<Task extends AITaskKind>(
  request: AIProviderRequest<Task>,
  attempts: readonly AiRouterAttempt<Task>[],
): AiRouterAttempt<Task>[] {
  const last = attempts[attempts.length - 1];
  const exhaustedFailure: AIProviderFailure = {
    code: 'FALLBACK_EXHAUSTED',
    message: 'All configured fallback attempts failed.',
    retryable: false,
    reasonCodes: [aiRouterErrorReasons.fallbackExhausted],
  };
  const exhaustedResult: AIProviderResult<Task> = {
    status: 'failure',
    task: request.task,
    failure: exhaustedFailure,
    responseMetadata: last?.result.responseMetadata ?? null,
    usage: last?.result.usage ?? null,
  };
  return [
    ...attempts,
    {
      providerId: 'ai-router',
      modelId: 'router',
      attemptIndex: attempts.length,
      result: exhaustedResult,
      fallbackEligible: false,
    },
  ];
}

function failure(
  code: AiRouterValidationFailure['code'],
  message: string,
): AiRouterValidationResult {
  return { ok: false, failure: { code, message } satisfies AiRouterValidationFailure };
}
