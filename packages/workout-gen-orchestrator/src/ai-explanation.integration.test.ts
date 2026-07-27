import { describe, expect, it, vi } from 'vitest';
import { InMemorySink } from '@adaptive-workout/observability';
import { generateWorkout } from './orchestrator.js';
import type {
  ServerTrainingProfile,
  WorkoutDecisionExplainer,
  WorkoutDecisionExplanationRequest,
  WorkoutGenerationDependencies,
} from './contracts.js';

const muscleId = '00000000-0000-4000-8000-000000000101';
const equipmentId = '00000000-0000-4000-8000-000000000102';
const exerciseId = '00000000-0000-4000-8000-000000000103';
const familyId = '00000000-0000-4000-8000-000000000104';
const secondExerciseId = '00000000-0000-4000-8000-000000000105';
const secondFamilyId = '00000000-0000-4000-8000-000000000106';
const userId = '00000000-0000-4000-8000-000000000107';

describe('workout generation AI explanation integration', () => {
  it('invokes the server-side explainer after deterministic generation succeeds', async () => {
    let observedRequest: WorkoutDecisionExplanationRequest | null = null;
    const explainer: WorkoutDecisionExplainer = {
      explainWorkoutDecision(request) {
        observedRequest = request;
        return Promise.resolve({
          status: 'success',
          explanation: {
            text: 'This workout balances the selected chest work within the requested duration.',
          },
        });
      },
    };

    const result = await generateWorkout(
      generationRequest(),
      userId,
      {
        ...dependencies(),
        decisionExplainer: explainer,
        aiRequestIdFactory: () => '00000000-0000-4000-8000-000000000108',
        aiDecisionIdFactory: () => '00000000-0000-4000-8000-000000000109',
        clock: () => '2026-07-23T12:00:00.000Z',
      },
      new InMemorySink(),
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.decisionExplanation?.text).toBe(
      'This workout balances the selected chest work within the requested duration.',
    );
    expect(observedRequest).not.toBeNull();
    if (observedRequest === null) return;
    const request = observedRequest;
    expect(request).toMatchObject({
      requestId: '00000000-0000-4000-8000-000000000108',
      decisionId: '00000000-0000-4000-8000-000000000109',
      action: { kind: 'generated_workout', origin: 'generated' },
      locale: 'en-US',
      maximumCharacters: 360,
      timeoutMilliseconds: 8000,
    });
    expect(request.reasonCodes).toContain('generated_workout');
    expect(request.evidence).toEqual([
      expect.objectContaining({ evidenceId: 'workout.summary' }),
      expect.objectContaining({ evidenceId: 'workout.exercises' }),
      expect.objectContaining({ evidenceId: 'workout.volume' }),
      expect.objectContaining({ evidenceId: 'workout.duration_stop' }),
    ]);
  });

  it('keeps ordinary deterministic generation working when no AI provider is configured', async () => {
    const result = await generateWorkout(
      generationRequest(),
      userId,
      dependencies(),
      new InMemorySink(),
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.exercises.length).toBeGreaterThan(0);
    expect(result.decisionExplanation).toBeNull();
  });

  it('omits explanation and preserves deterministic safety when the provider fails', async () => {
    const explainWorkoutDecision = vi
      .fn<WorkoutDecisionExplainer['explainWorkoutDecision']>()
      .mockResolvedValue({
        status: 'failure',
        code: 'invalid_output',
        retryable: false,
      });
    const explainer: WorkoutDecisionExplainer = {
      explainWorkoutDecision,
    };
    const result = await generateWorkout(
      generationRequest(),
      userId,
      { ...dependencies(), decisionExplainer: explainer },
      new InMemorySink(),
    );

    expect(explainWorkoutDecision).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.decisionExplanation).toBeNull();
    expect(result.exercises.every((exercise) => exercise.sets > 0)).toBe(true);
  });

  it('does not call AI when the deterministic discomfort gate blocks generation', async () => {
    const explainWorkoutDecision = vi.fn<WorkoutDecisionExplainer['explainWorkoutDecision']>();
    const explainer: WorkoutDecisionExplainer = {
      explainWorkoutDecision,
    };
    const result = await generateWorkout(
      generationRequest(),
      userId,
      {
        ...dependencies({ hasCurrentDiscomfort: true }),
        decisionExplainer: explainer,
      },
      new InMemorySink(),
    );

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('DISCOMFORT_REVIEW_REQUIRED');
    }
    expect(explainWorkoutDecision).not.toHaveBeenCalled();
  });
});

function generationRequest() {
  return {
    targetMuscles: ['chest'],
    durationMinutes: 60,
    equipmentContext: 'dumbbells-only',
  };
}

function dependencies(
  profileOverrides: Partial<ServerTrainingProfile> = {},
): WorkoutGenerationDependencies {
  const exercises = [
    {
      id: exerciseId,
      slug: 'dumbbell-bench-press',
      name: 'Dumbbell Bench Press',
      exerciseFamilyId: familyId,
      exerciseFamilySlug: 'horizontal-press',
      isActive: true,
      version: 1,
    },
    {
      id: secondExerciseId,
      slug: 'dumbbell-fly',
      name: 'Dumbbell Fly',
      exerciseFamilyId: secondFamilyId,
      exerciseFamilySlug: 'chest-fly',
      isActive: true,
      version: 1,
    },
  ];

  return {
    correlationId: 'ai-explanation-test',
    muscleIdMap: { chest: 'chest' },
    equipmentContextMap: { 'dumbbells-only': ['dumbbell'] },
    profileLoader: {
      loadProfile: () =>
        Promise.resolve({
          goal: 'build_muscle',
          experience: 'intermediate',
          frequency: '3',
          typicalDurationMinutes: 45,
          environment: 'commercial_gym',
          programPreference: 'app_decide',
          hasCurrentDiscomfort: false,
          bodyWeightKg: null,
          ...profileOverrides,
        }),
    },
    catalogLoader: {
      loadActiveCatalog: () =>
        Promise.resolve({
          exercises,
          muscles: [{ id: muscleId, slug: 'chest', name: 'Chest', isActive: true }],
          exerciseMuscles: exercises.map((exercise) => ({
            exerciseId: exercise.id,
            muscleId,
            role: 'primary' as const,
            contribution: 1,
          })),
          exerciseEquipment: exercises.map((exercise) => ({
            exerciseId: exercise.id,
            equipmentId,
            equipmentSlug: 'dumbbell',
            requirement: 'required' as const,
          })),
          equipment: [{ id: equipmentId, slug: 'dumbbell', name: 'Dumbbell', isActive: true }],
        }),
    },
  };
}
