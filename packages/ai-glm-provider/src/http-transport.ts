import type { AIProviderResponseMetadata, AIUsageMetadata } from '@adaptive-workout/ai';
import {
  glmDefaultModelId,
  type GlmApiKeyId,
  type GlmModelId,
  type GlmRequestPayload,
  type GlmResponsePayload,
  type GlmTransport,
  type GlmTransportCall,
  type GlmTransportFailure,
  type GlmTransportResult,
} from './contracts.js';

const glmApiBaseUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

/**
 * Injected HTTP primitive. Tests pass a fake; production passes a wrapper over
 * the global `fetch` available inside Supabase Edge Functions. The transport
 * never imports a provider SDK, keeping the provider boundary in this package.
 */
export type GlmFetch = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
) => Promise<GlmFetchResponse>;

export interface GlmFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly text: () => Promise<string>;
}

export interface GlmHttpTransportOptions {
  readonly apiKey: GlmApiKeyId;
  readonly modelId?: GlmModelId;
  readonly baseUrl?: string;
  readonly fetch?: GlmFetch;
  readonly clock?: () => string;
}

/**
 * Server-only HTTP transport for GLM. The API key is attached as a bearer token
 * here, never returned, and never reachable from browser code. This package is
 * marked `"browser": false` and is consumed only from trusted server surfaces.
 */
export class GlmHttpTransport implements GlmTransport {
  private readonly apiKey: GlmApiKeyId;
  private readonly modelId: GlmModelId;
  private readonly baseUrl: string;
  private readonly fetchImpl: GlmFetch;
  private readonly clock: () => string;

  constructor(options: GlmHttpTransportOptions) {
    this.apiKey = options.apiKey;
    this.modelId = options.modelId ?? glmDefaultModelId;
    this.baseUrl = options.baseUrl ?? glmApiBaseUrl;
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.clock = options.clock ?? defaultIsoClock;
  }

  async call(
    call: GlmTransportCall,
  ): Promise<
    | { readonly status: 'ok'; readonly value: GlmTransportResult }
    | { readonly status: 'failure'; readonly failure: GlmTransportFailure }
  > {
    const body = serializeRequestBody(this.modelId, call.payload);
    let response: GlmFetchResponse;
    try {
      response = await this.fetchImpl(this.baseUrl, {
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

    return mapHttpResponse(response, this.modelId, this.clock);
  }
}

function serializeRequestBody(modelId: GlmModelId, payload: GlmRequestPayload): string {
  return JSON.stringify({
    model: modelId,
    messages: payload.messages,
    response_format: payload.responseFormat,
    temperature: payload.temperature,
    request_id: payload.requestId,
  });
}

async function mapHttpResponse(
  response: GlmFetchResponse,
  modelId: GlmModelId,
  clock: () => string,
): Promise<
  | { readonly status: 'ok'; readonly value: GlmTransportResult }
  | { readonly status: 'failure'; readonly failure: GlmTransportFailure }
> {
  if (response.status === 401 || response.status === 403) {
    return { status: 'failure', failure: { kind: 'authentication_failed' } };
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
      failure: { kind: 'malformed_response', message: 'GLM response body was not valid JSON.' },
    };
  }

  const extraction = extractGlmResponse(parsed);
  if (extraction === null) {
    return {
      status: 'failure',
      failure: { kind: 'malformed_response', message: 'GLM response did not contain a choice.' },
    };
  }

  const responseMetadata: AIProviderResponseMetadata = {
    providerId: 'glm',
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

interface GlmResponseExtraction {
  readonly providerRequestId: string | null;
  readonly payload: GlmResponsePayload;
  readonly usage: AIUsageMetadata | null;
}

function extractGlmResponse(value: unknown): GlmResponseExtraction | null {
  if (typeof value !== 'object' || value === null) return null;
  const root = value as Record<string, unknown>;
  const choices = root.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const firstChoice: unknown = choices[0];
  if (typeof firstChoice !== 'object' || firstChoice === null) return null;
  const choice = firstChoice as Record<string, unknown>;
  const message = choice.message;
  if (typeof message !== 'object' || message === null) return null;
  const messageRecord = message as Record<string, unknown>;
  const contentRaw = messageRecord.content;
  const content = typeof contentRaw === 'string' ? safeParseJson(contentRaw) : (contentRaw ?? null);

  const providerRequestId = typeof root.id === 'string' ? root.id : null;
  const usage = extractUsage(root.usage);
  const finishReason = typeof choice.finish_reason === 'string' ? choice.finish_reason : null;

  return {
    providerRequestId,
    payload: { id: providerRequestId, content, finishReason },
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

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
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
): Promise<GlmFetchResponse> {
  const response = await fetch(url, init);
  return {
    ok: response.ok,
    status: response.status,
    text: () => response.text(),
  };
}
