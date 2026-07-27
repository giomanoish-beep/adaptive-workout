import type { AIProviderResponseMetadata, AIUsageMetadata } from '@adaptive-workout/ai';
import {
  deepseekDefaultBaseUrl,
  deepseekDefaultModelId,
  type DeepSeekApiKeyId,
  type DeepSeekModelId,
  type DeepSeekRequestPayload,
  type DeepSeekResponsePayload,
  type DeepSeekTransport,
  type DeepSeekTransportCall,
  type DeepSeekTransportFailure,
  type DeepSeekTransportResult,
} from './contracts.js';

const deepseekChatCompletionsPath = '/chat/completions';
const retryableStatusCodes = new Set([429, 500, 503]);
const defaultMaximumAttempts = 3;
const defaultBackoffMilliseconds = 250;

/**
 * Injected HTTP primitive. Tests pass a fake; production passes a wrapper over
 * the global `fetch` available inside Supabase Edge Functions. The transport
 * never imports a provider SDK, keeping the provider boundary in this package.
 */
export type DeepSeekFetch = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
) => Promise<DeepSeekFetchResponse>;

export interface DeepSeekFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly text: () => Promise<string>;
}

export interface DeepSeekHttpTransportOptions {
  readonly apiKey: DeepSeekApiKeyId;
  readonly modelId?: DeepSeekModelId;
  readonly baseUrl?: string;
  readonly fetch?: DeepSeekFetch;
  readonly clock?: () => string;
  readonly maximumAttempts?: number;
  readonly backoffMilliseconds?: number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

/**
 * Server-only HTTP transport for DeepSeek. The API key is attached as a bearer
 * token here, never returned, and never reachable from browser code. This
 * package is marked `"browser": false` and is consumed only from trusted server
 * surfaces.
 */
export class DeepSeekHttpTransport implements DeepSeekTransport {
  private readonly apiKey: DeepSeekApiKeyId;
  private readonly modelId: DeepSeekModelId;
  private readonly endpointUrl: string;
  private readonly fetchImpl: DeepSeekFetch;
  private readonly clock: () => string;
  private readonly maximumAttempts: number;
  private readonly backoffMilliseconds: number;
  private readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;

  constructor(options: DeepSeekHttpTransportOptions) {
    this.apiKey = options.apiKey;
    this.modelId = options.modelId ?? deepseekDefaultModelId;
    this.endpointUrl = toChatCompletionsUrl(options.baseUrl ?? deepseekDefaultBaseUrl);
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.clock = options.clock ?? defaultIsoClock;
    this.maximumAttempts = Math.max(
      1,
      Math.min(options.maximumAttempts ?? defaultMaximumAttempts, 3),
    );
    this.backoffMilliseconds = Math.max(
      0,
      options.backoffMilliseconds ?? defaultBackoffMilliseconds,
    );
    this.sleep = options.sleep ?? defaultSleep;
  }

  async call(
    call: DeepSeekTransportCall,
  ): Promise<
    | { readonly status: 'ok'; readonly value: DeepSeekTransportResult }
    | { readonly status: 'failure'; readonly failure: DeepSeekTransportFailure }
  > {
    const body = serializeRequestBody(this.modelId, call.payload);
    for (let attemptIndex = 0; attemptIndex < this.maximumAttempts; attemptIndex += 1) {
      let response: DeepSeekFetchResponse;
      try {
        response = await this.fetchImpl(this.endpointUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          body,
          signal: call.abortSignal,
        });
      } catch (error) {
        if (isAbortError(error)) {
          return { status: 'failure', failure: { kind: 'timeout' } };
        }
        return { status: 'failure', failure: { kind: 'unavailable' } };
      }

      if (shouldRetry(response.status, attemptIndex, this.maximumAttempts)) {
        const waited = await waitForRetry(
          this.sleep,
          this.backoffMilliseconds * (attemptIndex + 1),
          call.abortSignal,
        );
        if (!waited) return { status: 'failure', failure: { kind: 'timeout' } };
        continue;
      }

      return mapHttpResponse(response, this.modelId, this.clock);
    }

    return { status: 'failure', failure: { kind: 'unavailable' } };
  }
}

function serializeRequestBody(modelId: DeepSeekModelId, payload: DeepSeekRequestPayload): string {
  return JSON.stringify({
    model: modelId,
    messages: payload.messages,
    response_format: payload.responseFormat,
    thinking: payload.thinking,
    temperature: payload.temperature,
    request_id: payload.requestId,
  });
}

async function mapHttpResponse(
  response: DeepSeekFetchResponse,
  modelId: DeepSeekModelId,
  clock: () => string,
): Promise<
  | { readonly status: 'ok'; readonly value: DeepSeekTransportResult }
  | { readonly status: 'failure'; readonly failure: DeepSeekTransportFailure }
> {
  if (response.status === 400 || response.status === 422) {
    return { status: 'failure', failure: { kind: 'invalid_request' } };
  }
  if (response.status === 401 || response.status === 403) {
    return { status: 'failure', failure: { kind: 'authentication_failed' } };
  }
  if (response.status === 402) {
    return { status: 'failure', failure: { kind: 'payment_required' } };
  }
  if (response.status === 429) {
    return { status: 'failure', failure: { kind: 'rate_limited' } };
  }
  if (response.status === 408 || response.status === 504) {
    return { status: 'failure', failure: { kind: 'timeout' } };
  }
  if (response.status >= 500) {
    return { status: 'failure', failure: { kind: 'unavailable' } };
  }
  if (!response.ok) {
    return { status: 'failure', failure: { kind: 'unavailable' } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await response.text()) as unknown;
  } catch {
    return {
      status: 'failure',
      failure: {
        kind: 'malformed_response',
        message: 'DeepSeek response body was not valid JSON.',
      },
    };
  }

  const extraction = extractDeepSeekResponse(parsed);
  if (extraction === null) {
    return {
      status: 'failure',
      failure: {
        kind: 'malformed_response',
        message: 'DeepSeek response did not contain a choice.',
      },
    };
  }
  if (extraction.payload.finishReason === 'length') {
    return { status: 'failure', failure: { kind: 'truncated_output' } };
  }

  const responseMetadata: AIProviderResponseMetadata = {
    providerId: 'deepseek',
    modelId,
    providerRequestId: extraction.providerRequestId,
    receivedAt: clock(),
    latencyMilliseconds: 0,
  };
  return {
    status: 'ok',
    value: {
      responseMetadata,
      payload: extraction.payload,
      usage: extraction.usage,
    },
  };
}

interface DeepSeekResponseExtraction {
  readonly providerRequestId: string | null;
  readonly payload: DeepSeekResponsePayload;
  readonly usage: AIUsageMetadata | null;
}

function extractDeepSeekResponse(value: unknown): DeepSeekResponseExtraction | null {
  if (typeof value !== 'object' || value === null) return null;
  const root = value as Record<string, unknown>;
  const choices = root.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const firstChoice: unknown = choices[0];
  if (typeof firstChoice !== 'object' || firstChoice === null) return null;
  const choice = firstChoice as Record<string, unknown>;
  const finishReason = typeof choice.finish_reason === 'string' ? choice.finish_reason : null;
  if (finishReason === 'length') {
    return {
      providerRequestId: typeof root.id === 'string' ? root.id : null,
      payload: { id: typeof root.id === 'string' ? root.id : null, content: null, finishReason },
      usage: extractUsage(root.usage),
    };
  }
  const message = choice.message;
  if (typeof message !== 'object' || message === null) return null;
  const messageRecord = message as Record<string, unknown>;
  const contentRaw = messageRecord.content;
  const content = parseJsonContent(contentRaw);
  if (content.status === 'failure') return null;

  const providerRequestId = typeof root.id === 'string' ? root.id : null;
  const usage = extractUsage(root.usage);

  return {
    providerRequestId,
    payload: { id: providerRequestId, content: content.value, finishReason },
    usage,
  };
}

function extractUsage(value: unknown): AIUsageMetadata | null {
  if (typeof value !== 'object' || value === null) return null;
  const usage = value as Record<string, unknown>;
  const inputTokens = readTokenCount(usage.prompt_tokens);
  const outputTokens = readTokenCount(usage.completion_tokens);
  const totalTokens = readTokenCount(usage.total_tokens);
  if (inputTokens === null && outputTokens === null && totalTokens === null) return null;
  return { inputTokens, outputTokens, totalTokens };
}

function readTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;
}

function parseJsonContent(
  value: unknown,
): { readonly status: 'ok'; readonly value: unknown } | { readonly status: 'failure' } {
  if (typeof value !== 'string') return { status: 'failure' };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { status: 'failure' };
  try {
    return { status: 'ok', value: JSON.parse(trimmed) as unknown };
  } catch {
    return { status: 'failure' };
  }
}

function shouldRetry(status: number, attemptIndex: number, maximumAttempts: number): boolean {
  return retryableStatusCodes.has(status) && attemptIndex < maximumAttempts - 1;
}

async function waitForRetry(
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>,
  milliseconds: number,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    await sleep(milliseconds, signal);
    return true;
  } catch (error) {
    return !isAbortError(error) ? true : false;
  }
}

function toChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith(deepseekChatCompletionsPath)
    ? trimmed
    : `${trimmed}${deepseekChatCompletionsPath}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function defaultIsoClock(): string {
  return new Date().toISOString();
}

async function defaultFetch(
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
): Promise<DeepSeekFetchResponse> {
  const response = await fetch(url, init);
  return {
    ok: response.ok,
    status: response.status,
    text: () => response.text(),
  };
}

function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const handle = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(handle);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}
