/**
 * CRITICAL FLOW 2: WORKOUT REQUEST → REVIEW → ACTIVE WORKOUT
 *
 * Starting from completed onboarding, opens the Workout tab, configures a
 * Chest + Back session, generates the workout, verifies the review, and
 * starts the active workout focused flow.
 */

import { test, expect } from '@playwright/test';
import { setupE2ETest, completeOnboarding } from './helpers';

test.describe('Flow 2 — Workout request → review → active workout', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETest(page);
    await page.goto('/');
    await completeOnboarding(page);
  });

  test('generates Chest + Back workout and starts the active session', async ({ page }) => {
    await page.getByRole('button', { name: 'Workout', exact: true }).click();

    await page.getByRole('button', { name: 'Chest', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();

    await page.getByRole('button', { name: '60', exact: false }).click();
    await page.getByRole('button', { name: 'Full gym' }).click();

    const genBtn = page.getByRole('button', { name: 'Generate workout' });
    await expect(genBtn).toBeEnabled();
    await genBtn.click();

    // Loading state
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();

    // Review screen
    await expect(page.getByRole('heading', { name: 'Chest + Back' })).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.locator('.workout-review')).toContainText('16');
    await expect(page.locator('.workout-review')).toContainText('sets');
    await expect(page.locator('.workout-review')).toContainText('Dumbbell Bench Press');
    await expect(page.locator('.workout-review')).toContainText('Lat Pulldown');

    await page.getByRole('button', { name: 'Start workout' }).click();

    await expect(page.getByRole('heading', { name: 'Chest + Back' })).toBeVisible();
    await expect(page.locator('.bottom-nav')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
  });

  test('invalid request cannot submit (Generate disabled)', async ({ page }) => {
    await page.getByRole('button', { name: 'Workout', exact: true }).click();
    const genBtn = page.getByRole('button', { name: 'Generate workout' });
    await expect(genBtn).toBeDisabled();
  });
});
