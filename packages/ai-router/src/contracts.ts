import type { AIProviderFailureCode, AIProviderResult, AITaskKind } from '@adaptive-workout/ai';
import type { RuleSetVersion } from '@adaptive-workout/domain';

const defaultFallbackEligibleFailureCodes: readonly AIProviderFailureCode[] = [
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
  'MALFORMED_PROVIDER_RESPONSE',
  'STRUCTURED_OUTPUT_VALIDATION_FAILED',
];

/**
 * Bounded, versioned routing rules. Deterministic for identical configuration.
 * The router never weakens schema validation or safety boundaries on fallback.
 */
export interface AiRoutingRuleSet {
  readonly ruleSetVersion: RuleSetVersion;
  /**
   * Failure codes that make the primary provider's result fallback-eligible.
   * Only these codes advance the router to the next provider. Every other
   * failure is terminal and returned immediately.
   */
  readonly fallbackEligibleFailureCodes: readonly AIProviderFailureCode[];
  /**
   * Hard ceiling on provider attempts. GLM → DeepSeek means two attempts.
   * The router never exceeds this and never retries the same provider twice.
   */
  readonly maximumProviderAttempts: number;
}

/**
 * Default rules derived from docs/AI.md: fallback is permitted only for
 * configured transient/provider-output failures — unavailability, timeout,
 * rate limit, malformed provider response, and invalid structured output.
 * Terminal failures (auth, invalid input, unsupported task/capability) never
 * trigger fallback.
 */
export const defaultAiRoutingRuleSet: AiRoutingRuleSet = Object.freeze({
  ruleSetVersion: 'ai-routing-1' as RuleSetVersion,
  fallbackEligibleFailureCodes: defaultFallbackEligibleFailureCodes,
  maximumProviderAttempts: 2,
});

/**
 * One provider attempt recorded in the routing lineage. Every attempt is
 * captured regardless of outcome so the final result is fully traceable.
 */
export interface AiRouterAttempt<Task extends AITaskKind> {
  readonly providerId: string;
  readonly modelId: string;
  readonly attemptIndex: number;
  readonly result: AIProviderResult<Task>;
  readonly fallbackEligible: boolean;
}

/**
 * The router result carries the typed final provider result plus the ordered
 * fallback lineage and the routing rule-set version that governed the decision.
 */
export interface AiRouterResult<Task extends AITaskKind> {
  readonly result: AIProviderResult<Task>;
  readonly attempts: readonly AiRouterAttempt<Task>[];
  readonly routingRuleSetVersion: RuleSetVersion;
}

export const aiRouterValidationFailureCodes = [
  'NO_PROVIDERS_CONFIGURED',
  'MAXIMUM_ATTEMPTS_INVALID',
  'FALLBACK_CODES_INVALID',
  'PROVIDER_UNSUPPORTED_TASK',
  'DUPLICATE_PROVIDER',
] as const;
export type AiRouterValidationFailureCode = (typeof aiRouterValidationFailureCodes)[number];

export interface AiRouterValidationFailure {
  readonly code: AiRouterValidationFailureCode;
  readonly message: string;
}

export type AiRouterValidationResult =
  { readonly ok: true } | { readonly ok: false; readonly failure: AiRouterValidationFailure };

export const aiRouterErrorReasons = {
  fallbackExhausted: 'ai-router.fallback_exhausted',
  routingTerminal: 'ai-router.routing_terminal',
} as const;
