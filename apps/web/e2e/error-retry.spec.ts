import { expect, test } from '@playwright/test';
import {
  completeOnboarding,
  installE2EEnvironment,
  preserveStoreAndReload,
  readE2EStore,
  resetE2EState,
  setupActiveWorkout,
  setupWorkoutFlow,
} from './helpers';

test.describe('V1-005 error, retry, and persistence coverage', () => {
  test('workout generation fails once, blocks duplicates, then retries successfully', async ({
    page,
  }) => {
    const requests = await installE2EEnvironment(page, { generationFailures: 1 });
    await resetE2EState(page);
    await setupWorkoutFlow(page, { initialize: false });

    await page.getByRole('button', { name: 'Generate workout' }).click();
    await expect(page.locator('.workout-flow--generating')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate workout' })).not.toBeVisible();
    await expect.poll(() => requests.generationRequests).toBe(1);

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Workout generation failed. Please try again.');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('.workout-flow--generating')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chest + Back' })).toBeVisible();
    expect(requests.generationRequests).toBe(2);
  });

  test('set logging validates, preserves zero/null RIR, edits, resumes, and confirms incomplete finish', async ({
    page,
  }) => {
    await setupActiveWorkout(page);

    const complete = page.locator('.active-set').first().getByRole('button', { name: 'Complete' });
    await page.getByLabel('Set 1 weight').fill('-5');
    await page.getByLabel('Set 1 reps').fill('9');
    await expect(complete).toBeDisabled();

    await page.getByLabel('Set 1 weight').fill('22.5');
    await page.getByLabel('Set 1 RIR').selectOption('0');
    await complete.click();
    await expect(page.locator('.active-set--completed').first()).toContainText('22.5 kg');
    let store = await readE2EStore(page);
    expect(store['set_logs']?.[0]?.['rir']).toBe(0);

    const clockBefore = await page.locator('.rest-panel__clock').textContent();
    await page.getByRole('button', { name: '+15 sec' }).click();
    await expect(page.locator('.rest-panel__clock')).not.toHaveText(clockBefore ?? '');
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page.locator('.rest-panel')).toContainText('Ready');
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.locator('.rest-panel')).not.toBeVisible();

    await page
      .locator('.active-set--completed')
      .first()
      .getByRole('button', { name: 'Edit' })
      .click();
    await page.getByLabel('Set 1 weight').fill('23.5');
    await page.getByLabel('Set 1 reps').fill('10');
    await page.getByLabel('Set 1 RIR').selectOption('');
    await complete.click();
    await expect(page.locator('.active-set--completed').first()).toContainText('23.5 kg');
    store = await readE2EStore(page);
    expect(store['set_logs']?.[0]?.['weight']).toBe(23.5);
    expect(store['set_logs']?.[0]?.['rir']).toBeNull();

    await preserveStoreAndReload(page);
    await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
    await expect(page.locator('.active-set--completed').first()).toContainText('23.5 kg');

    await page.getByRole('button', { name: 'Finish workout' }).click();
    await expect(page.locator('.active-workout__finish--confirming')).toContainText(
      'Some sets are incomplete. Finish anyway?',
    );
    await page.getByRole('button', { name: 'Keep logging' }).click();
    await expect(page.locator('.active-workout__finish--confirming')).not.toBeVisible();
  });

  test('progression keeps content during a failed refresh and retries once', async ({ page }) => {
    const requests = await installE2EEnvironment(page, { progressionRefreshFailures: 1 });
    await resetE2EState(page);
    await page.goto('/');
    await completeOnboarding(page);

    await page.evaluate(() => {
      const api = (window as unknown as Record<string, unknown>).__E2E_STORE__ as {
        seed: (rows: Record<string, Record<string, unknown>[]>) => void;
      };
      api.seed({
        exercise_performance_state: [
          {
            id: 'perf-1',
            user_id: 'e2e-user-00000000-0000-0000-0000-000000000001',
            exercise_id: 'e2e-exercise-1',
            completed_exposure_count: 1,
            last_weight: 32,
            last_weight_unit: 'kg',
            last_reps: 10,
            last_rir: 2,
            calculated_at: new Date().toISOString(),
            engine_version: 'e2e-test-1.0.0',
            rule_set_version: 'e2e-test-1.0.0',
          },
        ],
        exercises: [{ id: 'e2e-exercise-1', exercise_name: 'Dumbbell Bench Press' }],
      });
    });
    await preserveStoreAndReload(page);
    await page.getByRole('button', { name: 'Progress' }).click();
    await page.getByRole('button', { name: 'Progression' }).click();

    const card = page
      .locator('.progress-progression-card')
      .filter({ hasText: 'Dumbbell Bench Press' });
    await expect(card).toBeVisible();
    const refresh = page.getByRole('button', { name: 'Refresh progression recommendations' });
    await refresh.click();
    await expect(refresh).toBeDisabled();
    await expect(card).toBeVisible();
    await expect.poll(() => requests.progressionRefreshRequests).toBe(1);
    await expect(page.getByRole('alert')).toContainText('E2E simulated refresh failure.');
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: 'Retry refresh' }).click();
    await expect(refresh).toBeDisabled();
    await expect(card).toBeVisible();
    await expect(page.getByRole('alert')).not.toBeVisible();
    await expect(refresh).toBeEnabled();
    expect(requests.progressionRefreshRequests).toBe(2);
  });

  test('a saved training-goal change survives reload', async ({ page }) => {
    await installE2EEnvironment(page);
    await resetE2EState(page);
    await page.goto('/');
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Goal').selectOption('build_muscle');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    await preserveStoreAndReload(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('Goal')).toHaveValue('build_muscle');
  });
});
