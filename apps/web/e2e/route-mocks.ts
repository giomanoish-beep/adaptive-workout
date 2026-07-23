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
  replacementFails?: boolean;
  progressionRefreshFails?: boolean;
  progressionRefreshFailures?: number;
  progressionDtos?: readonly ProgressionRefreshDto[];
}

export interface E2EMockTracker {
  generationRequests: number;
  programGenerationRequests: number;
  progressionRefreshRequests: number;
}

export async function installE2ERouteMocks(
  page: Page,
  config: E2EMockConfig = {},
): Promise<E2EMockTracker> {
  const tracker: E2EMockTracker = {
    generationRequests: 0,
    programGenerationRequests: 0,
    progressionRefreshRequests: 0,
  };
  await page.route(`**${FUNCTIONS_BASE}/generate-program`, async (route) => {
    tracker.programGenerationRequests += 1;
    const setup = route.request().postDataJSON() as {
      startDate: string;
      durationWeeks: 8 | 12 | 16;
      daysPerWeek: number;
      sessionDurationMinutes: number;
      goal: string;
    };
    const templates = [
      {
        templateKey: 'template-1',
        name: 'Upper A',
        focus: ['chest', 'back'],
        expectedDurationMinutes: setup.sessionDurationMinutes,
        prescriptions: [
          {
            exerciseId: '10000000-0000-4000-8000-000000000001',
            exerciseName: 'Dumbbell Bench Press',
            position: 1,
            movementPattern: 'horizontal-press',
            sets: 3,
            repsMin: 8,
            repsMax: 10,
            targetRir: 2,
            restSeconds: 120,
            initialLoadKg: null,
            calibrationStatus: 'calibration_required',
            recommendationReason:
              'Calibrate with a controlled set inside the prescribed rep and RIR range.',
          },
          {
            exerciseId: '10000000-0000-4000-8000-000000000002',
            exerciseName: 'Seated Cable Row',
            position: 2,
            movementPattern: 'horizontal-pull',
            sets: 3,
            repsMin: 8,
            repsMax: 10,
            targetRir: 2,
            restSeconds: 120,
            initialLoadKg: null,
            calibrationStatus: 'calibration_required',
            recommendationReason:
              'Calibrate with a controlled set inside the prescribed rep and RIR range.',
          },
        ],
      },
      {
        templateKey: 'template-2',
        name: 'Lower A',
        focus: ['quadriceps', 'hamstrings'],
        expectedDurationMinutes: setup.sessionDurationMinutes,
        prescriptions: [
          {
            exerciseId: '10000000-0000-4000-8000-000000000003',
            exerciseName: 'Goblet Squat',
            position: 1,
            movementPattern: 'squat',
            sets: 3,
            repsMin: 8,
            repsMax: 12,
            targetRir: 2,
            restSeconds: 120,
            initialLoadKg: null,
            calibrationStatus: 'calibration_required',
            recommendationReason:
              'Calibrate with a controlled set inside the prescribed rep and RIR range.',
          },
          {
            exerciseId: '10000000-0000-4000-8000-000000000004',
            exerciseName: 'Romanian Deadlift',
            position: 2,
            movementPattern: 'hinge',
            sets: 3,
            repsMin: 8,
            repsMax: 12,
            targetRir: 2,
            restSeconds: 120,
            initialLoadKg: null,
            calibrationStatus: 'calibration_required',
            recommendationReason:
              'Calibrate with a controlled set inside the prescribed rep and RIR range.',
          },
        ],
      },
    ];
    const days =
      setup.daysPerWeek === 2
        ? [1, 4]
        : setup.daysPerWeek === 3
          ? [1, 3, 5]
          : [1, 2, 4, 6].slice(0, setup.daysPerWeek);
    const schedule = Array.from({ length: setup.durationWeeks }, (_, weekIndex) =>
      days.map((day, index) => {
        const date = new Date(`${setup.startDate}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + weekIndex * 7 + day - 1);
        return {
          scheduleKey: `week-${weekIndex + 1}-session-${index + 1}`,
          week: weekIndex + 1,
          dayOfWeek: day,
          scheduledDate: date.toISOString().slice(0, 10),
          phase: (weekIndex + 1) % 4 === 0 ? 'deload' : weekIndex < 3 ? 'foundation' : 'build',
          isDeload: (weekIndex + 1) % 4 === 0,
          templateKey: templates[index % templates.length]!.templateKey,
        };
      }),
    ).flat();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        program: {
          name: `${setup.goal === 'recomposition' ? 'Recomposition' : 'Personal'} · ${setup.durationWeeks} weeks`,
          split: setup.daysPerWeek === 4 ? 'Upper Lower' : 'Full Body',
          engineVersion: 'program-engine-v1.2.0',
          ruleSetVersion: 'program-rules-v1.2.0',
          templates,
          schedule,
        },
      }),
    });
  });
  await page.route(`**${FUNCTIONS_BASE}/generate-workout`, async (route) => {
    tracker.generationRequests += 1;
    await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));

    const request = route.request().postDataJSON() as { action?: string };
    if (request.action === 'replace_exercise') {
      if (config.replacementFails) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'error',
            action: 'replace_exercise',
            code: 'NO_VALID_SUBSTITUTE',
            message: 'No valid substitute is available for your equipment and restrictions.',
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          action: 'replace_exercise',
          replacement: {
            exerciseId: 'e2e-replacement-1',
            exerciseVersion: 1,
            name: 'Incline Dumbbell Bench Press',
          },
        }),
      });
      return;
    }

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
        exerciseVersion: 1,
        name: ex.name,
        sets: ex.sets,
        reps: { minimum: ex.reps.minimum, maximum: ex.reps.maximum },
        rir: ex.rir,
        restSeconds: 120,
        loadPrescription: ex.loadPrescription,
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
