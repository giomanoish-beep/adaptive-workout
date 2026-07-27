import { DeepSeekAiProvider } from './provider.js';
import {
  deepseekDefaultBaseUrl,
  deepseekDefaultModelId,
  unsupportedDeepSeekModelIds,
  type DeepSeekApiKeyId,
} from './contracts.js';
import { DeepSeekHttpTransport, type DeepSeekFetch } from './http-transport.js';

export interface DeepSeekEnvironment {
  get(name: string): string | undefined;
}

export interface DeepSeekProviderEnvironmentOptions {
  readonly env: DeepSeekEnvironment;
  readonly fetch?: DeepSeekFetch;
  readonly clock?: () => string;
  readonly maximumAttempts?: number;
  readonly backoffMilliseconds?: number;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export type DeepSeekProviderEnvironmentResult =
  | { readonly status: 'ok'; readonly provider: DeepSeekAiProvider }
  | {
      readonly status: 'failure';
      readonly reason: 'missing_api_key' | 'unsupported_model';
      readonly message: string;
    };

/**
 * Server-only factory for the production DeepSeek provider. It reads only the
 * documented server environment variables and never returns their values:
 *
 * - DEEPSEEK_API_KEY (required)
 * - DEEPSEEK_BASE_URL (optional, defaults to https://api.deepseek.com)
 * - DEEPSEEK_MODEL (optional, defaults to deepseek-v4-flash)
 */
export function createDeepSeekProviderFromEnvironment(
  options: DeepSeekProviderEnvironmentOptions,
): DeepSeekProviderEnvironmentResult {
  const apiKey = readNonEmpty(options.env, 'DEEPSEEK_API_KEY');
  if (apiKey === null) {
    return {
      status: 'failure',
      reason: 'missing_api_key',
      message: 'DEEPSEEK_API_KEY is required for the server-side DeepSeek provider.',
    };
  }

  const modelId = readNonEmpty(options.env, 'DEEPSEEK_MODEL') ?? deepseekDefaultModelId;
  if (isUnsupportedModel(modelId)) {
    return {
      status: 'failure',
      reason: 'unsupported_model',
      message: 'DEEPSEEK_MODEL must not be deepseek-chat or deepseek-reasoner.',
    };
  }

  const baseUrl = readNonEmpty(options.env, 'DEEPSEEK_BASE_URL') ?? deepseekDefaultBaseUrl;
  const transport = new DeepSeekHttpTransport({
    apiKey: apiKey as DeepSeekApiKeyId,
    modelId,
    baseUrl,
    fetch: options.fetch,
    clock: options.clock,
    maximumAttempts: options.maximumAttempts,
    backoffMilliseconds: options.backoffMilliseconds,
    sleep: options.sleep,
  });

  return {
    status: 'ok',
    provider: new DeepSeekAiProvider({
      transport,
      modelId,
      clock: options.clock,
    }),
  };
}

function readNonEmpty(env: DeepSeekEnvironment, key: string): string | null {
  const value = env.get(key);
  if (value === undefined || value.trim().length === 0) return null;
  return value.trim();
}

function isUnsupportedModel(modelId: string): boolean {
  return unsupportedDeepSeekModelIds.includes(
    modelId as (typeof unsupportedDeepSeekModelIds)[number],
  );
}
