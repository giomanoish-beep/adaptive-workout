/**
 * Controlled event levels.
 */
export type ObservabilityEventLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Controlled event domains.
 */
export type ObservabilityEventDomain =
  'ai' | 'workout_decision' | 'progression_decision' | 'persistence' | 'system';

/**
 * Serializable metadata type. Only plain JSON-serializable values are allowed.
 * Callers must not include API keys, raw prompts, or full decision payloads.
 */
export type ObservabilityMetadataValue =
  | boolean
  | number
  | string
  | null
  | readonly ObservabilityMetadataValue[]
  | { readonly [key: string]: ObservabilityMetadataValue };

/**
 * Structured observability event contract.
 */
export interface ObservabilityEvent {
  readonly eventName: string;
  readonly level: ObservabilityEventLevel;
  readonly domain: ObservabilityEventDomain;
  readonly timestamp: string;
  readonly correlationId?: string;
  readonly metadata: ObservabilityMetadataValue;
}

/**
 * Injectable observability sink. Implementations are free to route events
 * to console, in-memory stores, or external services (not provided here).
 */
export interface ObservabilitySink {
  emit(event: ObservabilityEvent): void;
}

/**
 * Configuration for the observability layer. Inject a sink to control
 * where events go. No environment reads or global state.
 */
export interface ObservabilityConfig {
  readonly sink: ObservabilitySink;
  /** Include error stack traces in serialized errors (default false). */
  readonly includeErrorStack?: boolean;
}
