import { describe, expect, it } from 'vitest';
import { createProductionDecisionExplainer } from './ai-explainer';

const explanationRequest = {
  requestId: '00000000-0000-4000-8000-000000000201',
  decisionId: '00000000-0000-4000-8000-000000000202',
  decidedAt: '2026-07-23T12:00:00.000Z',
  contractVersion: 'ai-contract-1',
  engineVersion: {
    engineName: 'adaptive-workout/workout-engine',
    engineVersion: 'workout-engine-v1',
    ruleSetVersion: 'workout-generation-rules-v8',
  },
  action: { kind: 'generated_workout' as const, origin: 'generated' as const },
  reasonCodes: ['generated_workout', 'duration_stop_target_duration_reached'],
  evidence: [
    {
      evidenceId: 'workout.summary',
      kind: 'rule' as const,
      fact: 'Generated Chest: 45 minute estimate, 12 working sets, 4 exercises.',
    },
  ],
  locale: 'en-US',
  maximumCharacters: 360,
  timeoutMilliseconds: 8000,
};

describe('production generate-workout AI explainer', () => {
  it('uses DeepSeek without requiring a GLM key when only DEEPSEEK_API_KEY is configured', async () => {
    const calls: string[] = [];
    const explainer = createProductionDecisionExplainer({
      env: env({ DEEPSEEK_API_KEY: 'test-deepseek-key' }),
      clock: () => '2026-07-23T12:00:00.000Z',
      fetch: async (_url, init) => {
        calls.push(init.body);
        return jsonResponse(200, {
          id: 'deepseek-request-1',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  explanationText: 'The workout matches the selected target and duration.',
                  reasonCodeReferences: ['generated_workout'],
                  evidenceIdReferences: ['workout.summary'],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        });
      },
    });

    expect(explainer).not.toBeNull();
    const result = await explainer!.explainWorkoutDecision(explanationRequest);

    expect(result).toEqual({
      status: 'success',
      explanation: { text: 'The workout matches the selected target and duration.' },
    });
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0]!) as Record<string, unknown>;
    expect(body.model).toBe('deepseek-v4-flash');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('returns a safe invalid-output failure for schema-invalid provider JSON', async () => {
    const explainer = createProductionDecisionExplainer({
      env: env({ DEEPSEEK_API_KEY: 'test-deepseek-key' }),
      clock: () => '2026-07-23T12:00:00.000Z',
      fetch: async () =>
        jsonResponse(200, {
          id: 'deepseek-request-2',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  explanationText: 'I changed the workout.',
                  reasonCodeReferences: ['invented_reason'],
                  evidenceIdReferences: ['workout.summary'],
                }),
              },
            },
          ],
        }),
    });

    expect(explainer).not.toBeNull();
    await expect(explainer!.explainWorkoutDecision(explanationRequest)).resolves.toEqual({
      status: 'failure',
      code: 'invalid_output',
      retryable: false,
    });
  });

  it('is absent when no server provider key is configured', () => {
    expect(createProductionDecisionExplainer({ env: env({}) })).toBeNull();
  });
});

function env(values: Readonly<Record<string, string>>) {
  return {
    get(name: string) {
      return values[name];
    },
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}
