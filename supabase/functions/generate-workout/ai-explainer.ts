import {
  validateAIProviderRequest,
  type AIProvider,
  type AIProviderRequest,
  type AIProviderResult,
  type AIDecisionId,
  type AIRequestId,
} from '../../../packages/ai/src/index.ts';
import {
  createDeepSeekProviderFromEnvironment,
  registerDeepSeekTaskHandler,
} from '../../../packages/ai-deepseek-provider/src/index.ts';
import {
  GlmAiProvider,
  GlmHttpTransport,
  registerGlmTaskHandler,
  type GlmApiKeyId,
} from '../../../packages/ai-glm-provider/src/index.ts';
import {
  AiRouter,
  defaultAiRoutingRuleSet,
  validateAiRouterOptions,
} from '../../../packages/ai-router/src/index.ts';
import {
  deepseekExplanationHandler,
  glmExplanationHandler,
} from '../../../packages/ai-decision-explanation/src/index.ts';
import type {
  WorkoutDecisionExplainer,
  WorkoutDecisionExplanationFailureCode,
  WorkoutDecisionExplanationRequest,
  WorkoutDecisionExplanationResult,
} from '../../../packages/workout-gen-orchestrator/src/contracts.ts';

interface ServerEnvironment {
  get(name: string): string | undefined;
}

interface ProductionDecisionExplainerOptions {
  readonly env: ServerEnvironment;
  readonly fetch?: typeof fetch;
  readonly clock?: () => string;
}

/**
 * Creates the production AI explainer for the generate-workout Edge Function.
 *
 * Server-only: reads provider secrets exclusively from Edge Function
 * environment variables and returns a browser-safe explainer interface. It
 * registers the existing grounded-decision task handlers but never exposes
 * keys, prompts, provider responses, provider IDs, model IDs, or routing
 * metadata to the browser-facing workout DTO.
 */
export function createProductionDecisionExplainer(
  options: ProductionDecisionExplainerOptions,
): WorkoutDecisionExplainer | null {
  registerGlmTaskHandler('grounded_decision_explanation', glmExplanationHandler);
  registerDeepSeekTaskHandler('grounded_decision_explanation', deepseekExplanationHandler);

  const providers = configuredProviders(options);
  if (providers.length === 0) {
    return null;
  }

  const provider =
    providers.length === 1
      ? providers[0]!
      : new AiRouter({ providers, ruleSet: defaultAiRoutingRuleSet });

  if (providers.length > 1) {
    const validation = validateAiRouterOptions(providerOptions(providers), [
      'grounded_decision_explanation',
    ]);
    if (!validation.ok) {
      return null;
    }
  }

  return new ProviderBackedDecisionExplainer(provider, options.clock);
}

function providerOptions(providers: readonly AIProvider[]) {
  return { providers, ruleSet: defaultAiRoutingRuleSet };
}

function configuredProviders(options: ProductionDecisionExplainerOptions): readonly AIProvider[] {
  const providers: AIProvider[] = [];
  const glmKey = readNonEmpty(options.env, 'ZAI_API_KEY');
  if (glmKey !== null) {
    providers.push(
      new GlmAiProvider({
        transport: new GlmHttpTransport({
          apiKey: glmKey as GlmApiKeyId,
          fetch: options.fetch,
          clock: options.clock,
        }),
        clock: options.clock,
      }),
    );
  }

  const deepSeek = createDeepSeekProviderFromEnvironment({
    env: options.env,
    fetch: options.fetch,
    clock: options.clock,
  });
  if (deepSeek.status === 'ok') {
    providers.push(deepSeek.provider);
  }

  return providers;
}

class ProviderBackedDecisionExplainer implements WorkoutDecisionExplainer {
  private readonly provider: AIProvider;
  private readonly clock: () => string;

  constructor(provider: AIProvider, clock: (() => string) | undefined) {
    this.provider = provider;
    this.clock = clock ?? defaultIsoClock;
  }

  async explainWorkoutDecision(
    request: WorkoutDecisionExplanationRequest,
  ): Promise<WorkoutDecisionExplanationResult> {
    const providerRequest = toProviderRequest(request, this.clock);
    const validation = validateAIProviderRequest(providerRequest);
    if (!validation.ok) {
      return { status: 'failure', code: 'invalid_output', retryable: false };
    }

    let result: AIProviderResult<'grounded_decision_explanation'>;
    try {
      result = await this.provider.execute(providerRequest);
    } catch {
      return { status: 'failure', code: 'provider_failure', retryable: true };
    }

    if (result.status === 'failure') {
      return {
        status: 'failure',
        code: mapProviderFailure(result),
        retryable: result.failure.retryable,
      };
    }

    return {
      status: 'success',
      explanation: { text: result.output.explanationText },
    };
  }
}

function toProviderRequest(
  request: WorkoutDecisionExplanationRequest,
  clock: () => string,
): AIProviderRequest<'grounded_decision_explanation'> {
  return {
    task: 'grounded_decision_explanation',
    input: {
      task: 'grounded_decision_explanation',
      contractVersion:
        request.contractVersion as AIProviderRequest<'grounded_decision_explanation'>['input']['contractVersion'],
      decision: {
        kind: 'workout',
        decisionId: request.decisionId as AIDecisionId,
        action: request.action,
        reasonCodes: request.reasonCodes,
        evidence: request.evidence,
        version: request.engineVersion,
        decidedAt: request.decidedAt,
      },
      locale: request.locale,
      maximumCharacters: request.maximumCharacters,
    },
    metadata: {
      requestId: request.requestId as AIRequestId,
      requestedAt: clock(),
      timeoutMilliseconds: request.timeoutMilliseconds,
    },
  };
}

function mapProviderFailure(
  result: AIProviderResult<'grounded_decision_explanation'> & { readonly status: 'failure' },
): WorkoutDecisionExplanationFailureCode {
  switch (result.failure.code) {
    case 'PROVIDER_TIMEOUT':
      return 'provider_timeout';
    case 'MALFORMED_PROVIDER_RESPONSE':
    case 'STRUCTURED_OUTPUT_VALIDATION_FAILED':
    case 'INVALID_TASK_INPUT':
      return 'invalid_output';
    default:
      return 'provider_failure';
  }
}

function readNonEmpty(env: ServerEnvironment, key: string): string | null {
  const value = env.get(key);
  if (value === undefined || value.trim().length === 0) return null;
  return value.trim();
}

function defaultIsoClock(): string {
  return new Date().toISOString();
}
