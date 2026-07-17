/**
 * CRITICAL FLOW 1: AUTHENTICATED FIRST RUN → ONBOARDING → APP
 *
 * Launches the app as an authenticated E2E test user with no completed
 * in-memory profile. Walks through each onboarding step and asserts the
 * review screen and app navigation.
 */

import { test, expect } from '@playwright/test';
import { setupE2ETest, completeOnboarding, reachOnboardingReview } from './helpers';

test.describe('Flow 1 — Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETest(page);
  });

  test('completes first-run onboarding and lands on app navigation', async ({ page }) => {
    await page.goto('/');

    // Onboarding is visible
    await expect(page.getByRole('heading', { name: "What's your main goal?" })).toBeVisible();

    // Complete the full flow using the shared helper
    await completeOnboarding(page);

    // App navigation becomes visible after completion
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Workout', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Progress' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  });

  test('missing profile → onboarding, duplicate submission prevented', async ({ page }) => {
    // App opens without any profile
    await page.goto('/');

    await expect(page.getByRole('heading', { name: "What's your main goal?" })).toBeVisible();

    // Fast onboarding
    await completeOnboarding(page);

    // Finish setup button should no longer be visible
    await expect(page.getByRole('button', { name: 'Finish setup' })).not.toBeVisible();

    // App nav appears
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
  });

  test('shows saving state and prevents duplicate final submissions', async ({ page }) => {
    await page.goto('/');
    await reachOnboardingReview(page);
    await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>).__E2E_STORE__ as {
        setProfileSaveDelay: (delayMs: number) => void;
      };
      store.setProfileSaveDelay(250);
    });

    const finish = page.getByRole('button', { name: 'Finish setup' });
    await finish.dblclick();
    await expect(page.getByRole('button', { name: 'Saving setup…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();

    const attempts = await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>).__E2E_STORE__ as {
        getProfileSaveAttempts: () => number;
      };
      return store.getProfileSaveAttempts();
    });
    expect(attempts).toBe(1);
  });

  test('surfaces a controlled save error and retries successfully', async ({ page }) => {
    await page.goto('/');
    await reachOnboardingReview(page);
    await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>).__E2E_STORE__ as {
        failNextProfileSaves: (count: number) => void;
      };
      store.failNextProfileSaves(1);
    });

    await page.getByRole('button', { name: 'Finish setup' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Could not save your setup. Please try again.',
    );
    await expect(page.getByText('Simulated private database error.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Retry setup' }).click();
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
  });
});
