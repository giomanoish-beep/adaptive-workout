/**
 * CRITICAL FLOW 4: PROGRESS → PROFILE GOAL EDIT → SIGN OUT
 *
 * Starting in the app after onboarding, opens Progress, verifies History
 * and Progression views with the in-memory E2E store, edits the training
 * goal in Settings, and signs out.
 */

import { test, expect } from '@playwright/test';
import { setupE2ETest, completeOnboarding } from './helpers';

test.describe('Flow 4 — Progress → profile goal edit → sign out', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETest(page);
    await page.goto('/');
    await completeOnboarding(page);
  });

  test('verifies progress empty states, edits goal, and signs out', async ({ page }) => {
    // -- Open Progress tab --
    await page.getByRole('button', { name: 'Progress' }).click();

    // Default mode is History
    await expect(page.getByRole('button', { name: 'History', pressed: true })).toBeVisible({
      timeout: 10_000,
    });

    // History: Empty state
    await expect(page.locator('.progress-screen')).toContainText('No completed workouts yet', {
      timeout: 10_000,
    });

    // Summary shows zeros
    await expect(page.locator('.progress-summary')).toContainText('0');
    await expect(page.locator('.progress-summary')).toContainText('Workouts');

    // -- Switch to Progression --
    await page.getByRole('button', { name: 'Progression' }).click();

    // Progression empty state
    await expect(page.locator('.progress-screen')).toContainText(
      'No exercise progression data yet',
      { timeout: 10_000 },
    );

    // -- Open Settings tab --
    await page.getByRole('button', { name: 'Settings' }).click();

    const goalCard = page.locator('.settings-card').filter({ hasText: 'Training goal' });
    await expect(goalCard.locator('.settings-card__value')).toContainText('Recomposition');

    await page.getByRole('button', { name: 'Edit training goal' }).click();
    await page.getByRole('radio', { name: 'Build muscle' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(goalCard.locator('.settings-card__value')).toContainText('Build muscle');

    // -- Sign out --
    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).not.toBeVisible();
  });
});
