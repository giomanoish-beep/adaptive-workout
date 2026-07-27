import { describe, expect, it } from 'vitest';
import { createDeepSeekProviderFromEnvironment } from './environment';
import type { DeepSeekFetch, DeepSeekFetchResponse } from './http-transport';

function env(values: Readonly<Record<string, string | undefined>>) {
  return {
    get(name: string) {
      return values[name];
    },
  };
}

function okFetch(): DeepSeekFetch {
  return (): Promise<DeepSeekFetchResponse> =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            id: 'deepseek-request-1',
            choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
          }),
        ),
    });
}

describe('createDeepSeekProviderFromEnvironment', () => {
  it('builds a server-side DeepSeek provider from documented environment variables', () => {
    const result = createDeepSeekProviderFromEnvironment({
      env: env({
        DEEPSEEK_API_KEY: 'test-secret',
        DEEPSEEK_BASE_URL: 'https://deepseek.example.test',
        DEEPSEEK_MODEL: 'deepseek-v4-pro',
      }),
      fetch: okFetch(),
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.provider.definition).toMatchObject({
        providerId: 'deepseek',
        modelId: 'deepseek-v4-pro',
      });
    }
  });

  it('defaults to the approved production model and base URL when optional variables are absent', () => {
    const result = createDeepSeekProviderFromEnvironment({
      env: env({ DEEPSEEK_API_KEY: 'test-secret' }),
      fetch: okFetch(),
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.provider.definition.modelId).toBe('deepseek-v4-flash');
    }
  });

  it('does not require a real API key in tests but fails closed when the secret is absent', () => {
    const result = createDeepSeekProviderFromEnvironment({
      env: env({}),
      fetch: okFetch(),
    });

    expect(result).toEqual({
      status: 'failure',
      reason: 'missing_api_key',
      message: 'DEEPSEEK_API_KEY is required for the server-side DeepSeek provider.',
    });
  });

  it('rejects legacy and thinking model IDs before a request is made', () => {
    for (const model of ['deepseek-chat', 'deepseek-reasoner']) {
      const result = createDeepSeekProviderFromEnvironment({
        env: env({ DEEPSEEK_API_KEY: 'test-secret', DEEPSEEK_MODEL: model }),
        fetch: okFetch(),
      });

      expect(result).toEqual({
        status: 'failure',
        reason: 'unsupported_model',
        message: 'DEEPSEEK_MODEL must not be deepseek-chat or deepseek-reasoner.',
      });
    }
  });
});
