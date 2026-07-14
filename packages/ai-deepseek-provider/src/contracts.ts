import type {
  AIProviderRequest,
  AIProviderResponseMetadata,
  AIUsageMetadata,
  AITaskContractMap,
  AITaskKind,
} from '@adaptive-workout/ai';
import type { ContractVersion } from '@adaptive-workout/domain';

/**
 * DeepSeek is the configured fallback AI provider (see docs/AI.md). The API key
 * lives in a server-only secret and is never read by this package's provider
 * code. The primary provider (GLM) is invoked first by the router.
 */
export const deepseekProviderId = 'deepseek' as const;
export type DeepSeekProviderId = typeof deepseekProviderId;

/**
 * Branded identity for the DeepSeek API key. It is a nominal type, not a plain
 * string alias, so callers cannot accidentally pass unrelated secrets. Only the
 * HTTP transport consumes it to build the Authorization header.
 */
declare const deepseekApiKeyIdBrand: unique symbol;
export type DeepSeekApiKeyId = string & { readonly [deepseekApiKeyIdBrand]: never };

export type DeepSeekModelId = string;

export const deepseekDefaultModelId = 'deepseek-chat' as DeepSeekModelId;

export interface DeepSeekRequestMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/**
 * Serialized HTTP body handed to the transport. Field names mirror the
 * DeepSeek chat-completions convention so a transport can forward them with
 * minimal reshaping, but the structure is owned here to keep provider specifics
 * out of the generic transport contract.
 */
export interface DeepSeekRequestPayload {
  readonly model: DeepSeekModelId;
  readonly messages: readonly DeepSeekRequestMessage[];
  readonly responseFormat: { readonly type: 'json_object' };
  readonly temperature: number;
  readonly requestId: string;
  readonly task: AITaskKind;
  readonly contractVersion: ContractVersion;
}

export interface DeepSeekResponsePayload {
  readonly id: string | null;
  readonly content: unknown;
  readonly finishReason: string | null;
}

export interface DeepSeekTransportCall {
  readonly payload: DeepSeekRequestPayload;
  readonly abortSignal: AbortSignal;
}

export interface DeepSeekTransportResult {
  readonly responseMetadata: AIProviderResponseMetadata;
  readonly payload: DeepSeekResponsePayload;
  readonly usage: AIUsageMetadata | null;
}

export type DeepSeekTransportFailure =
  | { readonly kind: 'timeout' }
  | { readonly kind: 'authentication_failed' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'malformed_response'; readonly message: string };

export interface DeepSeekTransport {
  /**
   * Invokes the DeepSeek HTTP endpoint. Implementations must attach the API key
   * from a server-only secret store and never expose it to the caller or
   * browser.
   */
  call(
    call: DeepSeekTransportCall,
  ): Promise<
    | { readonly status: 'ok'; readonly value: DeepSeekTransportResult }
    | { readonly status: 'failure'; readonly failure: DeepSeekTransportFailure }
  >;
}

export type DeepSeekTaskHandlerOutput<Task extends AITaskKind> =
  | {
      readonly status: 'ok';
      readonly output: AITaskContractMap[Task]['output'];
    }
  | { readonly status: 'failure'; readonly message: string };

/**
 * Per-task handler that builds the DeepSeek request payload from the validated
 * task input and parses the provider's raw response content back into the
 * versioned task output contract. AI-003 defines this port; the concrete
 * handlers are implemented by the structured-task tasks AI-004, AI-005, and
 * AI-006.
 */
export interface DeepSeekTaskHandler<Task extends AITaskKind> {
  buildRequestPayload(request: AIProviderRequest<Task>): DeepSeekRequestPayload;
  parseTaskOutput(
    request: AIProviderRequest<Task>,
    response: DeepSeekResponsePayload,
  ): DeepSeekTaskHandlerOutput<Task>;
}

export const deepseekRequestErrorReasons = {
  unsupportedTask: 'deepseek.unsupported_task',
  transportException: 'deepseek.transport_exception',
  timeout: 'deepseek.timeout',
  authenticationFailed: 'deepseek.authentication_failed',
  rateLimited: 'deepseek.rate_limited',
  unavailable: 'deepseek.unavailable',
  malformedResponse: 'deepseek.malformed_response',
  structuredOutputInvalid: 'deepseek.structured_output_invalid',
} as const;
export type DeepSeekRequestErrorReason =
  (typeof deepseekRequestErrorReasons)[keyof typeof deepseekRequestErrorReasons];
