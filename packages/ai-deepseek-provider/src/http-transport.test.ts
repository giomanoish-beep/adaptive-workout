import type { ContractVersion } from '@adaptive-workout/domain';
import { deepseekDefaultModelId, type DeepSeekRequestPayload } from './contracts';
import { describe, expect, it } from 'vitest';
import {
  DeepSeekHttpTransport,
  type DeepSeekFetch,
  type DeepSeekFetchResponse,
} from './http-transport';

const deepseekPayload: DeepSeekRequestPayload = {
  model: deepseekDefaultModelId,
  messages: [{ role: 'user', content: 'extract workout intent' }],
  responseFormat: { type: 'json_object' },
  thinking: { type: 'disabled' },
  temperature: 0,
  requestId: '00000000-0000-0000-0000-000000000002',
  task: 'workout_intent_extraction',
  contractVersion: 'ai-contract-1' as ContractVersion,
};

const abortController = new AbortController();

function jsonResponse(status: number, body: unknown): DeepSeekFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function recordingFetch(
  responder: (init: {
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
  }) => DeepSeekFetchResponse,
): DeepSeekFetch & {
  readonly lastInit: () => {
    url: string;
    headers: Readonly<Record<string, string>>;
    body: string;
  } | null;
} {
  let lastInit: {
    url: string;
    headers: Readonly<Record<string, string>>;
    body: string;
  } | null = null;
  const lastInitAccessor = () => lastInit;
  const wrapper = (
    url: string,
    init: {
      readonly method: 'POST';
      readonly headers: Readonly<Record<string, string>>;
      readonly body: string;
      readonly signal: AbortSignal;
    },
  ): Promise<DeepSeekFetchResponse> => {
    lastInit = { url, headers: init.headers, body: init.body };
    return Promise.resolve(responder({ url, headers: init.headers, body: init.body }));
  };
  return Object.assign(wrapper satisfies DeepSeekFetch, { lastInit: lastInitAccessor });
}

const deepseekOkBody = {
  id: 'deepseek-request-9',
  choices: [
    {
      message: { content: JSON.stringify({ ok: true }) },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
};

describe('DeepSeekHttpTransport', () => {
  it('attaches the bearer api key and serializes the DeepSeek request body', async () => {
    const fetch = recordingFetch(() => jsonResponse(200, deepseekOkBody));
    const transport = new DeepSeekHttpTransport({ apiKey: 'secret-key' as never, fetch });

    const outcome = await transport.call({
      payload: deepseekPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome.status).toBe('ok');
    const init = fetch.lastInit();
    expect(init?.headers.authorization).toBe('Bearer secret-key');
    expect(init?.headers['content-type']).toBe('application/json');
    expect(init?.url).toBe('https://api.deepseek.com/chat/completions');
    const body = JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
    expect(body.model).toBe(deepseekDefaultModelId);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.request_id).toBe('00000000-0000-0000-0000-000000000002');
  });

  it('normalizes a custom DeepSeek base URL to the chat completions endpoint', async () => {
    const fetch = recordingFetch(() => jsonResponse(200, deepseekOkBody));
    const transport = new DeepSeekHttpTransport({
      apiKey: 'secret-key' as never,
      baseUrl: 'https://deepseek.example.test/',
      fetch,
    });

    await transport.call({
      payload: deepseekPayload,
      abortSignal: abortController.signal,
    });

    expect(fetch.lastInit()?.url).toBe('https://deepseek.example.test/chat/completions');
  });

  it('parses a valid DeepSeek response into transport result and usage', async () => {
    const fetch = recordingFetch(() => jsonResponse(200, deepseekOkBody));
    const transport = new DeepSeekHttpTransport({
      apiKey: 'secret-key' as never,
      fetch,
      clock: () => '2026-07-14T10:00:02.000Z',
    });

    const outcome = await transport.call({
      payload: deepseekPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome.status).toBe('ok');
    if (outcome.status === 'ok') {
      expect(outcome.value.responseMetadata.providerRequestId).toBe('deepseek-request-9');
      expect(outcome.value.payload.content).toEqual({ ok: true });
      expect(outcome.value.usage).toEqual({ inputTokens: 12, outputTokens: 8, totalTokens: 20 });
    }
  });

  it.each([
    [400, 'invalid_request'],
    [401, 'authentication_failed'],
    [402, 'payment_required'],
    [403, 'authentication_failed'],
    [422, 'invalid_request'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [503, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, expected) => {
    const fetch = recordingFetch(() => jsonResponse(status, { error: 'fail' }));
    const transport = new DeepSeekHttpTransport({
      apiKey: 'secret-key' as never,
      fetch,
      maximumAttempts: 1,
    });

    const outcome = await transport.call({
      payload: deepseekPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome.status).toBe('failure');
    if (outcome.status === 'failure') expect(outcome.failure.kind).toBe(expected);
  });

  it.each([429, 500, 503])('retries HTTP %i with bounded backoff', async (status) => {
    let calls = 0;
    const delays: number[] = [];
    const fetch: DeepSeekFetch = () => {
      calls += 1;
      return Promise.resolve(
        calls < 3 ? jsonResponse(status, { error: 'retry' }) : jsonResponse(200, deepseekOkBody),
      );
    };
    const transport = new DeepSeekHttpTransport({
      apiKey: 'secret-key' as never,
      fetch,
      backoffMilliseconds: 10,
      sleep(milliseconds) {
        delays.push(milliseconds);
        return Promise.resolve();
      },
    });

    const outcome = await transport.call({
      payload: deepseekPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome.status).toBe('ok');
    expect(calls).toBe(3);
    expect(delays).toEqual([10, 20]);
  });

  it.each([400, 401, 402, 422])('does not retry terminal HTTP %i responses', async (status) => {
    let calls = 0;
    const fetch: DeepSeekFetch = () => {
      calls += 1;
      return Promise.resolve(jsonResponse(status, { error: 'terminal' }));
    };
    const transport = new DeepSeekHttpTransport({ apiKey: 'secret-key' as never, fetch });

    const outcome = await transport.call({
      payload: deepseekPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome.status).toBe('failure');
    expect(calls).toBe(1);
  });

  it('treats a fetch AbortError as timeout', async () => {
    const fetchImpl: DeepSeekFetch = () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    };
    const transport = new DeepSeekHttpTransport({
      apiKey: 'secret-key' as never,
      fetch: fetchImpl,
    });

    const outcome = await transport.call({
      payload: deepseekPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome).toMatchObject({ status: 'failure', failure: { kind: 'timeout' } });
  });

  it('treats an unexpected fetch exception as unavailable', async () => {
    const fetchImpl: DeepSeekFetch = () => Promise.reject(new Error('connection reset'));
    const transport = new DeepSeekHttpTransport({
      apiKey: 'secret-key' as never,
      fetch: fetchImpl,
    });

    const outcome = await transport.call({
      payload: deepseekPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome).toMatchObject({ status: 'failure', failure: { kind: 'unavailable' } });
  });

  it('reports a malformed response when the body is not JSON', async () => {
    const fetch = recordingFetch(() => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve('not-json'),
    }));
    const transport = new DeepSeekHttpTransport({ apiKey: 'secret-key' as never, fetch });

    const outcome = await transport.call({
      payload: deepseekPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome).toMatchObject({ status: 'failure', failure: { kind: 'malformed_response' } });
  });

  it('reports a malformed response when choices are missing', async () => {
    const fetch = recordingFetch(() => jsonResponse(200, { id: 'x', choices: [] }));
    const transport = new DeepSeekHttpTransport({ apiKey: 'secret-key' as never, fetch });

    const outcome = await transport.call({
      payload: deepseekPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome).toMatchObject({ status: 'failure', failure: { kind: 'malformed_response' } });
  });

  it('reports a malformed response when JSON output content is empty', async () => {
    const fetch = recordingFetch(() =>
      jsonResponse(200, {
        id: 'x',
        choices: [{ message: { content: '   ' }, finish_reason: 'stop' }],
      }),
    );
    const transport = new DeepSeekHttpTransport({ apiKey: 'secret-key' as never, fetch });

    const outcome = await transport.call({
      payload: deepseekPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome).toMatchObject({ status: 'failure', failure: { kind: 'malformed_response' } });
  });

  it('reports truncated output when the provider finishes for length', async () => {
    const fetch = recordingFetch(() =>
      jsonResponse(200, {
        id: 'x',
        choices: [{ message: { content: '{"ok":' }, finish_reason: 'length' }],
      }),
    );
    const transport = new DeepSeekHttpTransport({ apiKey: 'secret-key' as never, fetch });

    const outcome = await transport.call({
      payload: deepseekPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome).toMatchObject({ status: 'failure', failure: { kind: 'truncated_output' } });
  });
});
