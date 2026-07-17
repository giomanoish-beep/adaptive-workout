/**
 * E2E route interception helpers for Edge Function mocking.
 */

import type { Page } from '@playwright/test';
import { workoutReviewFixture } from '../src/workout/workout-review';
import type { GatewayReviewSuccess } from '../src/workout/workout-generation-gateway';
import type { ProgressionRefreshDto } from '../src/progress/progression-refresh-gateway';

const FUNCTIONS_BASE = '/functions/v1';
const MOCK_DELAY_MS = 800;

export interface E2EMockConfig {
  generationFails?: boolean;
  generationFailures?: number;
  progressionRefreshFails?: boolean;
  progressionRefreshFailures?: number;
  progressionDtos?: readonly ProgressionRefreshDto[];
}

export interface E2EMockTracker {
  generationRequests: number;
  progressionRefreshRequests: number;
}

export async function installE2ERouteMocks(
  page: Page,
  config: E2EMockConfig = {},
): Promise<E2EMockTracker> {
  const tracker: E2EMockTracker = {
    generationRequests: 0,
    progressionRefreshRequests: 0,
  };
  await page.route(`**${FUNCTIONS_BASE}/generate-workout`, async (route) => {
    tracker.generationRequests += 1;
    await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));

    if (config.generationFails || tracker.generationRequests <= (config.generationFailures ?? 0)) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'error',
          generationId: null,
          code: 'GENERATION_FAILED',
          message: 'E2E simulated generation failure.',
        }),
      });
      return;
    }

    const success: GatewayReviewSuccess = {
      status: 'success',
      generationId: 'e2e-gen-00000000-0000-0000-0000-000000000000',
      title: workoutReviewFixture.title,
      estimatedDurationMinutes: workoutReviewFixture.estimatedDurationMinutes,
      totalWorkingSets: workoutReviewFixture.totalWorkingSets,
      exercises: workoutReviewFixture.exercises.map((ex) => ({
        position: ex.position,
        exerciseId: `e2e-exercise-${ex.position}`,
        name: ex.name,
        sets: ex.sets,
        reps: { minimum: ex.reps.minimum, maximum: ex.reps.maximum },
        rir: ex.rir,
        restSeconds: 120,
      })),
      muscleVolume: workoutReviewFixture.muscleVolume.map((mv) => ({
        muscle: mv.muscle,
        volume: mv.volume,
      })),
      appliedGoal: 'Recomposition',
      engineVersion: 'e2e-test-1.0.0',
      ruleSetVersion: 'e2e-test-1.0.0',
      traceSummary: null,
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(success),
    });
  });

  await page.route(`**${FUNCTIONS_BASE}/refresh-progression`, async (route) => {
    tracker.progressionRefreshRequests += 1;
    await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));

    if (
      config.progressionRefreshFails ||
      tracker.progressionRefreshRequests <= (config.progressionRefreshFailures ?? 0)
    ) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'error',
          code: 'REFRESH_FAILED',
          message: 'E2E simulated refresh failure.',
        }),
      });
      return;
    }

    const progressions: ProgressionRefreshDto[] = config.progressionDtos
      ? [...config.progressionDtos]
      : [
          {
            exerciseId: 'e2e-exercise-1',
            exerciseName: 'Dumbbell Bench Press',
            currentWeight: 32,
            weightUnit: 'kg',
            recentReps: 10,
            targetRir: 2,
            trend: null,
            recommendation: 'insufficient_data',
            suggestedNextWeight: null,
            reasonCodes: ['insufficient_exposure'],
            sourceExposureCount: 1,
            calculatedAt: new Date().toISOString(),
            engineVersion: 'e2e-test-1.0.0',
            ruleSetVersion: 'e2e-test-1.0.0',
            insufficientData: true,
          },
        ];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', progressions }),
    });
  });

  return tracker;
}
