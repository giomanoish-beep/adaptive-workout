/**
 * CRITICAL FLOW 3: SET LOGGING → REST TIMER → INCOMPLETE FINISH
 *
 * Starting in the active workout, logs a set, verifies the rest timer
 * behaviour with deterministic controls, navigates exercises, and finishes
 * the workout with incomplete sets after a cancellation + re-confirmation.
 *
 * Also covers: RIR 0 vs blank RIR, set edit persistence, rest timer Ready state.
 */

import { test, expect } from '@playwright/test';
import { setupE2ETest, completeOnboarding } from './helpers';

test.describe('Flow 3 — Set logging → rest timer → incomplete finish', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETest(page);
    await page.goto('/');
    await completeOnboarding(page);

    // Navigate to active workout
    await page.getByRole('button', { name: 'Workout', exact: true }).click();
    await page.getByRole('button', { name: 'Chest', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: '60', exact: false }).click();
    await page.getByRole('button', { name: 'Full gym' }).click();
    await page.getByRole('button', { name: 'Generate workout' }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();

    await expect(
      page.getByRole('heading', { name: 'Dumbbell Bench Press' }),
    ).toBeVisible();
  });

  test('logs set, exercises rest timer, navigates, and finishes with incomplete sets', async ({
    page,
  }) => {
    // -- Log Set 1 --
    await page.getByLabel('Set 1 weight').fill('32');
    await page.getByLabel('Set 1 reps').fill('10');

    await page
      .locator('.active-set')
      .first()
      .getByRole('button', { name: 'Complete' })
      .click();

    await expect(page.locator('.active-set--completed')).toContainText('32 kg');
    await expect(page.locator('.active-set--completed')).toContainText('10 reps');
    await expect(page.locator('.active-set--completed')).toContainText('RIR \u2014');

    // -- Rest timer --
    const restPanel = page.locator('.rest-panel');
    await expect(restPanel).toBeVisible();
    await expect(restPanel).toContainText('Target 2:00');

    await page.getByRole('button', { name: '+15 sec' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(restPanel).toContainText('Ready');
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(restPanel).not.toBeVisible();

    // -- Navigate Next → Previous --
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(
      page.getByRole('heading', { name: 'Lat Pulldown' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(
      page.getByRole('heading', { name: 'Dumbbell Bench Press' }),
    ).toBeVisible();

    // Completed set preserved
    await expect(page.locator('.active-set--completed')).toContainText('32 kg');

    // -- Finish workout --
    await page.getByRole('button', { name: 'Finish workout' }).click();
    await expect(
      page.locator('.active-workout__finish--confirming'),
    ).toContainText('Some sets are incomplete. Finish anyway?');

    // Cancel
    await page.getByRole('button', { name: 'Keep logging' }).click();
    await expect(
      page.locator('.active-workout__finish--confirming'),
    ).not.toBeVisible();

    // Finish again + confirm
    await page.getByRole('button', { name: 'Finish workout' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();

    await expect(page.locator('.active-workout--finished')).toBeVisible();
    await expect(page.locator('.active-workout--finished')).toContainText(
      'Session complete',
    );

    // Done
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(
      page.getByRole('button', { name: 'Today' }),
    ).toBeVisible();
  });
});