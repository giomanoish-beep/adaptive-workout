import type {
  AIProviderRequest,
  AIProviderResponseMetadata,
  AIUsageMetadata,
  AITaskContractMap,
  AITaskKind,
} from '@adaptive-workout/ai';
import type { ContractVersion } from '@adaptive-workout/domain';

/**
 * GLM is the planned primary AI provider (see docs/AI.md). The API key lives in
 * a server-only secret and is never read by this package's provider code.
 */
export const glmProviderId = 'glm' as const;
export type GlmProviderId = typeof glmProviderId;

/**
 * Branded identity for the GLM API key. It is a nominal type, not a plain
 * string alias, so callers cannot accidentally pass unrelated secrets. Only the
 * HTTP transport consumes it to build the Authorization header.
 */
declare const glmApiKeyIdBrand: unique symbol;
export type GlmApiKeyId = string & { readonly [glmApiKeyIdBrand]: never };

export type GlmModelId = string;

export const glmDefaultModelId = 'glm-4-plus' as GlmModelId;

export interface GlmRequestMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/**
 * Serialized HTTP body handed to the transport. Field names mirror the GLM
 * chat-completions convention so a transport can forward them with minimal
 * reshaping, but the structure is owned here to keep provider specifics out of
 * the generic transport contract.
 */
export interface GlmRequestPayload {
  readonly model: GlmModelId;
  readonly messages: readonly GlmRequestMessage[];
  readonly responseFormat: { readonly type: 'json_object' };
  readonly temperature: number;
  readonly requestId: string;
  readonly task: AITaskKind;
  readonly contractVersion: ContractVersion;
}

export interface GlmResponsePayload {
  readonly id: string | null;
  readonly content: unknown;
  readonly finishReason: string | null;
}

export interface GlmTransportCall {
  readonly payload: GlmRequestPayload;
  readonly abortSignal: AbortSignal;
}

export interface GlmTransportResult {
  readonly responseMetadata: AIProviderResponseMetadata;
  readonly payload: GlmResponsePayload;
  readonly usage: AIUsageMetadata | null;
}

export type GlmTransportFailure =
  | { readonly kind: 'timeout' }
  | { readonly kind: 'authentication_failed' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'malformed_response'; readonly message: string };

export interface GlmTransport {
  /**
   * Invokes the GLM HTTP endpoint. Implementations must attach the API key from
   * a server-only secret store and never expose it to the caller or browser.
   */
  call(
    call: GlmTransportCall,
  ): Promise<
    | { readonly status: 'ok'; readonly value: GlmTransportResult }
    | { readonly status: 'failure'; readonly failure: GlmTransportFailure }
  >;
}

export type GlmTaskHandlerOutput<Task extends AITaskKind> =
  | {
      readonly status: 'ok';
      readonly output: AITaskContractMap[Task]['output'];
    }
  | { readonly status: 'failure'; readonly message: string };

/**
 * Per-task handler that builds the GLM request payload from the validated task
 * input and parses the provider's raw response content back into the versioned
 * task output contract. AI-002 defines this port; the concrete handlers are
 * implemented by the structured-task tasks AI-004, AI-005, and AI-006.
 */
export interface GlmTaskHandler<Task extends AITaskKind> {
  buildRequestPayload(request: AIProviderRequest<Task>): GlmRequestPayload;
  parseTaskOutput(
    request: AIProviderRequest<Task>,
    response: GlmResponsePayload,
  ): GlmTaskHandlerOutput<Task>;
}

export const glmRequestErrorReasons = {
  unsupportedTask: 'glm.unsupported_task',
  transportException: 'glm.transport_exception',
  timeout: 'glm.timeout',
  authenticationFailed: 'glm.authentication_failed',
  rateLimited: 'glm.rate_limited',
  unavailable: 'glm.unavailable',
  malformedResponse: 'glm.malformed_response',
  structuredOutputInvalid: 'glm.structured_output_invalid',
} as const;
export type GlmRequestErrorReason =
  (typeof glmRequestErrorReasons)[keyof typeof glmRequestErrorReasons];
