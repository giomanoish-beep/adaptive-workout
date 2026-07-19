import { expect, test, type Page } from '@playwright/test';
import {
  completeOnboarding,
  installE2EEnvironment,
  preserveStoreAndReload,
  readE2EStore,
  resetE2EState,
  setupActiveWorkout,
  setupE2ETest,
  setupWorkoutFlow,
} from './helpers';

function monitorUnexpectedErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) =>
    errors.push(`network: ${request.method()} ${request.url()}`),
  );
  return errors;
}

test.describe('V1.1 workout UX', () => {
  test('replacement updates review and persists into the started workout', async ({ page }) => {
    const errors = monitorUnexpectedErrors(page);
    await setupWorkoutFlow(page);
    await page.evaluate(() => {
      const api = (window as unknown as Record<string, unknown>).__E2E_STORE__ as {
        seed: (rows: Record<string, Record<string, unknown>[]>) => void;
      };
      api.seed({
        exercise_performance_state: [
          {
            exercise_id: 'e2e-exercise-1',
            completed_exposure_count: 3,
            last_weight: 22.5,
            last_weight_unit: 'kg',
            last_reps: 10,
            last_rir: 2,
            calculated_at: '2026-07-18T10:00:00.000Z',
            engine_version: 'test',
            rule_set_version: 'test',
          },
        ],
        workout_decisions: [
          {
            decision_type: 'progression_increase',
            created_at: '2026-07-18T10:00:00.000Z',
            normalized_input: { exerciseId: 'e2e-exercise-1' },
            decision_output: {
              action: 'increase_load',
              recommendedLoad: { value: 25, unit: 'kg' },
            },
            decision_trace: { evidence: { performanceTrend: { direction: 'improving' } } },
            reason_codes: ['target_reached'],
          },
        ],
        exercises: [{ id: 'e2e-exercise-1', exercise_name: 'Dumbbell Bench Press' }],
      });
    });
    await page.getByRole('button', { name: 'Generate workout' }).click();
    await expect(page.getByRole('heading', { name: 'Chest + Back' })).toBeVisible();
    await expect(page.getByText('Last: 22.5 kg × 10 @ RIR 2')).toBeVisible();
    await expect(page.getByText('Next: 25 kg × 8–10 @ RIR 2')).toBeVisible();

    const firstCard = page.locator('.workout-card').first();
    await firstCard.getByRole('button', { name: 'Replace for this workout' }).click();
    await expect(firstCard).toContainText('Incline Dumbbell Bench Press');
    await page.getByRole('button', { name: 'Start workout' }).click();
    await expect(page.getByRole('heading', { name: 'Incline Dumbbell Bench Press' })).toBeVisible();

    const store = await readE2EStore(page);
    expect(store['workout_session_exercises']?.[0]).toMatchObject({
      planned_exercise_id: 'e2e-replacement-1',
      planned_exercise_name: 'Incline Dumbbell Bench Press',
      planned_sets: 4,
      planned_rir: 2,
    });
    expect(errors).toEqual([]);
  });

  test('guided RIR preserves zero, unknown, and edit selection', async ({ page }) => {
    const errors = monitorUnexpectedErrors(page);
    await setupActiveWorkout(page);
    const rir = page.getByLabel('Set 1 RIR');
    await expect(rir.locator('option')).toHaveText(['Unknown', '0', '1', '2', '3', '4', '5+']);
    await page.getByLabel('Set 1 weight').fill('22.5');
    await page.getByLabel('Set 1 reps').fill('10');
    await rir.selectOption('0');
    await page.locator('.active-set').first().getByRole('button', { name: 'Complete' }).click();
    expect((await readE2EStore(page))['set_logs']?.[0]?.['rir']).toBe(0);

    await page.locator('.active-set--completed').getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Set 1 RIR')).toHaveValue('0');
    await page.getByLabel('Set 1 RIR').selectOption('');
    await page.locator('.active-set').first().getByRole('button', { name: 'Complete' }).click();
    expect((await readE2EStore(page))['set_logs']?.[0]?.['rir']).toBeNull();
    expect(errors).toEqual([]);
  });

  test('replacement shows a controlled no-substitute message', async ({ page }) => {
    await installE2EEnvironment(page, { replacementFails: true });
    await resetE2EState(page);
    await setupWorkoutFlow(page, { initialize: false });
    await page.getByRole('button', { name: 'Generate workout' }).click();
    await page
      .locator('.workout-card')
      .first()
      .getByRole('button', { name: 'Replace for this workout' })
      .click();
    await expect(page.getByRole('alert')).toHaveText(
      'No valid substitute is available for your equipment and restrictions.',
    );
  });

  test('compact active workout keeps primary controls usable without overflow', async ({
    page,
  }) => {
    const errors = monitorUnexpectedErrors(page);
    await setupActiveWorkout(page);
    await expect(page.getByText('Exercise 1 of 4')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Exercise 2 of 4')).toBeVisible();
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible();
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    for (const control of [
      page.locator('.active-set').first(),
      page.getByRole('button', { name: 'Next' }),
      page.getByRole('button', { name: 'Finish workout' }),
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.y ?? viewportHeight) + (box?.height ?? 0)).toBeLessThanOrEqual(viewportHeight);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

  test('settings sections save and survive reload', async ({ page }) => {
    const errors = monitorUnexpectedErrors(page);
    await setupE2ETest(page);
    await page.goto('/');
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    for (const heading of [
      'Training goal',
      'Training environment',
      'Equipment',
      'Session preferences',
      'Discomfort',
      'Account',
      'Data and privacy',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    await page.getByLabel('Environment').selectOption('home_gym');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await preserveStoreAndReload(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('Environment')).toHaveValue('home_gym');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

  test('settings show a controlled save error and retry', async ({ page }) => {
    await setupE2ETest(page);
    await page.goto('/');
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.evaluate(() => {
      const api = (window as unknown as Record<string, unknown>).__E2E_STORE__ as {
        failNextProfileSaves: (count: number) => void;
      };
      api.failNextProfileSaves(1);
    });
    await page.getByLabel('Environment').selectOption('home_gym');
    await expect(page.getByRole('alert')).toContainText('Failed to save changes.');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Environment')).toHaveValue('home_gym');
  });
});

test.describe('V1.1 visual snapshots', () => {
  test('review, replacement, active workout, RIR, settings, and progress summary', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Stable desktop snapshots are captured once.');
    await setupWorkoutFlow(page);
    await page.getByRole('button', { name: 'Generate workout' }).click();
    await expect(page.getByRole('heading', { name: 'Chest + Back' })).toBeVisible();
    await expect(page).toHaveScreenshot('workout-review.png', { fullPage: true });
    await expect(page.locator('.exercise-progress').first()).toHaveScreenshot(
      'exercise-progression-summary.png',
    );

    await page
      .locator('.workout-card')
      .first()
      .getByRole('button', { name: 'Replace for this workout' })
      .click();
    await expect(page.locator('.workout-card').first()).toContainText('Finding substitute…');
    await expect(page.locator('.workout-card').first()).toHaveScreenshot('replacement-ui.png');
    await expect(page.locator('.workout-card').first()).toContainText(
      'Incline Dumbbell Bench Press',
    );
    await page.getByRole('button', { name: 'Start workout' }).click();
    await expect(page.getByRole('heading', { name: 'Incline Dumbbell Bench Press' })).toBeVisible();
    await expect(page).toHaveScreenshot('active-workout.png', { fullPage: true });
    await page.getByLabel('Set 1 RIR').focus();
    await expect(page.locator('.active-set').first()).toHaveScreenshot('rir-picker.png');

    await page.getByRole('button', { name: 'Finish workout' }).click();
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page).toHaveScreenshot('settings.png', { fullPage: true });
  });
});
