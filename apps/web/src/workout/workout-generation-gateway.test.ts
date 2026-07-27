import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateWorkoutViaGateway, mapGatewayToWorkoutReview } from './workout-generation-gateway';

describe('workout generation gateway AI explanation boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('maps only browser-safe explanation text from the Edge Function response', () => {
    const review = mapGatewayToWorkoutReview({
      status: 'success',
      generationId: 'generation-1',
      title: 'Chest',
      estimatedDurationMinutes: 45,
      totalWorkingSets: 8,
      exercises: [],
      muscleVolume: [],
      appliedGoal: 'hypertrophy',
      engineVersion: 'engine',
      ruleSetVersion: 'rules',
      traceSummary: null,
      decisionExplanation: { text: 'This matches your selected chest focus.' },
    });

    expect(review.decisionExplanation).toEqual({
      text: 'This matches your selected chest focus.',
    });
    expect(JSON.stringify(review)).not.toMatch(/deepseek|glm|provider|prompt|DEEPSEEK_API_KEY/i);
  });

  it('calls the authenticated Edge Function and preserves safe explanation text', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          generationId: 'generation-2',
          title: 'Chest',
          estimatedDurationMinutes: 45,
          totalWorkingSets: 8,
          exercises: [],
          muscleVolume: [],
          appliedGoal: 'hypertrophy',
          engineVersion: 'engine',
          ruleSetVersion: 'rules',
          traceSummary: null,
          decisionExplanation: { text: 'Generated from deterministic workout evidence.' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateWorkoutViaGateway(
      {
        auth: {
          getSession: () =>
            Promise.resolve({
              data: { session: { access_token: 'user-token' } },
            }),
        },
      } as never,
      {
        targetMuscles: ['chest'],
        durationMinutes: 45,
        equipmentContext: 'full-gym',
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchCall = fetchMock.mock.calls.at(0);
    expect(fetchCall).toBeDefined();
    if (fetchCall === undefined) return;
    const [url, requestInit] = fetchCall;
    expect(url).toBe('https://project.supabase.co/functions/v1/generate-workout');
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.headers).toMatchObject({ Authorization: 'Bearer user-token' });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.decisionExplanation?.text).toBe(
        'Generated from deterministic workout evidence.',
      );
      expect(JSON.stringify(result)).not.toMatch(/providerRequestId|prompt|DEEPSEEK_API_KEY/);
    }
  });
});
