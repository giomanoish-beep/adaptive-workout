import type { ContractVersion } from '@adaptive-workout/domain';
import type { GlmRequestPayload } from './contracts';
import { describe, expect, it } from 'vitest';
import { GlmHttpTransport, type GlmFetch, type GlmFetchResponse } from './http-transport';

const glmPayload: GlmRequestPayload = {
  model: 'glm-4-plus',
  messages: [{ role: 'user', content: 'extract workout intent' }],
  responseFormat: { type: 'json_object' },
  temperature: 0,
  requestId: '00000000-0000-0000-0000-000000000002',
  task: 'workout_intent_extraction',
  contractVersion: 'ai-contract-1' as ContractVersion,
};

const abortController = new AbortController();

function jsonResponse(status: number, body: unknown): GlmFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function recordingFetch(
  responder: (init: {
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
  }) => GlmFetchResponse,
): GlmFetch & {
  readonly lastInit: () => { headers: Readonly<Record<string, string>>; body: string } | null;
} {
  let lastInit: { headers: Readonly<Record<string, string>>; body: string } | null = null;
  const lastInitAccessor = () => lastInit;
  const wrapper = (
    _url: string,
    init: {
      readonly method: 'POST';
      readonly headers: Readonly<Record<string, string>>;
      readonly body: string;
      readonly signal: AbortSignal;
    },
  ): Promise<GlmFetchResponse> => {
    lastInit = { headers: init.headers, body: init.body };
    return Promise.resolve(responder(init));
  };
  return Object.assign(wrapper satisfies GlmFetch, { lastInit: lastInitAccessor });
}

const glmOkBody = {
  id: 'glm-request-9',
  choices: [
    {
      message: { content: JSON.stringify({ ok: true }) },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
};

describe('GlmHttpTransport', () => {
  it('attaches the bearer api key and serializes the GLM request body', async () => {
    const fetch = recordingFetch(() => jsonResponse(200, glmOkBody));
    const transport = new GlmHttpTransport({
      apiKey: 'secret-key' as never,
      fetch,
    });

    const outcome = await transport.call({
      payload: glmPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome.status).toBe('ok');
    const init = fetch.lastInit();
    expect(init?.headers.authorization).toBe('Bearer secret-key');
    expect(init?.headers['content-type']).toBe('application/json');
    const body = JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
    expect(body.model).toBe('glm-4-plus');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.request_id).toBe('00000000-0000-0000-0000-000000000002');
  });

  it('parses a valid GLM response into transport result and usage', async () => {
    const fetch = recordingFetch(() => jsonResponse(200, glmOkBody));
    const transport = new GlmHttpTransport({
      apiKey: 'secret-key' as never,
      fetch,
      clock: () => '2026-07-14T10:00:02.000Z',
    });

    const outcome = await transport.call({
      payload: glmPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome.status).toBe('ok');
    if (outcome.status === 'ok') {
      expect(outcome.value.responseMetadata.providerRequestId).toBe('glm-request-9');
      expect(outcome.value.payload.content).toEqual({ ok: true });
      expect(outcome.value.usage).toEqual({ inputTokens: 12, outputTokens: 8, totalTokens: 20 });
    }
  });

  it.each([
    [401, 'authentication_failed'],
    [403, 'authentication_failed'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [503, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, expected) => {
    const fetch = recordingFetch(() => jsonResponse(status, { error: 'fail' }));
    const transport = new GlmHttpTransport({ apiKey: 'secret-key' as never, fetch });

    const outcome = await transport.call({
      payload: glmPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome.status).toBe('failure');
    if (outcome.status === 'failure') expect(outcome.failure.kind).toBe(expected);
  });

  it('treats a fetch AbortError as timeout', async () => {
    const fetchImpl: GlmFetch = () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    };
    const transport = new GlmHttpTransport({ apiKey: 'secret-key' as never, fetch: fetchImpl });

    const outcome = await transport.call({
      payload: glmPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome).toMatchObject({ status: 'failure', failure: { kind: 'timeout' } });
  });

  it('treats an unexpected fetch exception as unavailable', async () => {
    const fetchImpl: GlmFetch = () => Promise.reject(new Error('connection reset'));
    const transport = new GlmHttpTransport({ apiKey: 'secret-key' as never, fetch: fetchImpl });

    const outcome = await transport.call({
      payload: glmPayload,
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
    const transport = new GlmHttpTransport({ apiKey: 'secret-key' as never, fetch });

    const outcome = await transport.call({
      payload: glmPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome).toMatchObject({
      status: 'failure',
      failure: { kind: 'malformed_response' },
    });
  });

  it('reports a malformed response when choices are missing', async () => {
    const fetch = recordingFetch(() => jsonResponse(200, { id: 'x', choices: [] }));
    const transport = new GlmHttpTransport({ apiKey: 'secret-key' as never, fetch });

    const outcome = await transport.call({
      payload: glmPayload,
      abortSignal: abortController.signal,
    });

    expect(outcome).toMatchObject({
      status: 'failure',
      failure: { kind: 'malformed_response' },
    });
  });
});
