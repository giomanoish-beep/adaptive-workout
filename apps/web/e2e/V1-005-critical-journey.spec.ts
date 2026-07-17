/**
 * V1-005 — EXECUTABLE END-TO-END CRITICAL JOURNEY
 */
import { test, expect } from '@playwright/test';
import { setupE2ETest, completeOnboarding, preserveStoreAndReload } from './helpers';

test.describe('V1-005 — Critical Journey', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETest(page);
  });

  test('onboarding → generation → review → active workout → finish → progress → reload', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: "What's your main goal?" })).toBeVisible();
    await completeOnboarding(page);
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();

    // Workout tab
    await page.getByRole('button', { name: 'Workout', exact: true }).click();
    await page.getByRole('button', { name: 'Chest', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: '60', exact: false }).click();
    await page.getByRole('button', { name: 'Full gym' }).click();
    await page.getByRole('button', { name: 'Generate workout' }).click();

    // Review screen
    await expect(page.getByRole('heading', { name: 'Chest + Back' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.workout-review')).toContainText('Dumbbell Bench Press');
    await expect(page.locator('.workout-review')).toContainText('Lat Pulldown');

    // Start workout — validate the active workout screen appears with an exercise
    await page.getByRole('button', { name: 'Start workout' }).click();

    // The active workout screen should show something (header, exercise, or loading -> active)
    // Wait for active workout content to appear (either exercise name or workout title)
    await expect(page.locator('.active-workout')).toBeVisible({ timeout: 10_000 });

    // Bottom nav hidden during active workout
    await expect(page.locator('.bottom-nav')).not.toBeVisible();

    // Should show the first exercise
    await expect(page.getByText('Dumbbell Bench Press')).toBeVisible({ timeout: 10_000 });

    // Log a set
    await page.getByLabel('Set 1 weight').fill('32');
    await page.getByLabel('Set 1 reps').fill('10');
    await page.locator('.active-set').first().getByRole('button', { name: 'Complete' }).click();

    // Completed set shows data
    await expect(page.locator('.active-set--completed')).toContainText('32 kg');

    // Finish workout
    await page.getByRole('button', { name: 'Finish workout' }).click();
    await expect(page.locator('.active-workout__finish--confirming')).toContainText(
      'Some sets are incomplete',
      { timeout: 5_000 },
    );

    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.locator('.active-workout--finished')).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();

    // Progress shows completed session
    await page.getByRole('button', { name: 'Progress' }).click();
    await expect(page.getByText('Chest + Back')).toBeVisible({ timeout: 10_000 });

    // Settings + goal change
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Edit training goal' }).click();
    await page.getByRole('radio', { name: 'Strength' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    // Reload persistence
    await preserveStoreAndReload(page);
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });
  });
});
