/**
 * HARDENING-003: Automated accessibility checks for 12 representative
 * application states using axe-core via @axe-core/playwright.
 *
 * Each state:
 *  - navigates to a representative page
 *  - runs axe against the rendered page
 *  - fails on serious or critical violations
 *
 * Moderate violations are fixed when low-risk; otherwise documented.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { completeOnboarding, setupActiveWorkout, setupWorkoutFlow } from './helpers';

/**
 * Run axe and assert no serious/critical violations.
 */
async function a11yScan(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const violations = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  if (violations.length > 0) {
    const detail = violations
      .map(
        (v) =>
          `${v.impact}: ${v.id} — ${v.help}\n  Nodes: ${v.nodes.map((n) => n.html).join(', ')}`,
      )
      .join('\n');
    console.error(`\n[axe violations]\n${detail}\n`);
  }

  expect(violations).toEqual([]);

  return results;
}

/**
 * Navigate to the unauthenticated sign-in screen by signing out from the
 * E2E auth seam. The E2E seam starts authenticated; signing out through
 * the Settings screen transitions the seam to unauthenticated, which
 * causes the SignIn component to render.
 */
async function goToSignInScreen(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await completeOnboarding(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
}

/** Shared setup: complete onboarding, navigate to Workout, generate Chest+Back.
 *  Now provided centrally by `setupWorkoutFlow` from helpers.ts, which
 *  self-initializes the E2E route mocks so workout generation resolves. */

test.describe('HARDENING-003 — accessibility audits', () => {
  // ─── State 1: Sign-in screen (unauthenticated landing) ──────────
  test('State 1 — Sign-in screen passes axe', async ({ page }) => {
    await goToSignInScreen(page);
    await a11yScan(page);
  });

  // ─── State 2: Onboarding question screen ────────────────────────
  test('State 2 — Onboarding question screen passes axe', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: "What's your main goal?" })).toBeVisible();

    await a11yScan(page);
  });

  // ─── State 3: Onboarding review screen ──────────────────────────
  test('State 3 — Onboarding review screen passes axe', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const selectAndContinue = async (optionName: string) => {
      await page.getByRole('button', { name: optionName }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
    };

    await selectAndContinue('Recomposition');
    await selectAndContinue('Intermediate');
    await selectAndContinue('4 days');
    await page.getByRole('button', { name: '90', exact: false }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await selectAndContinue('Commercial gym');
    await selectAndContinue('Let the app decide');
    await selectAndContinue('No current discomfort');

    await expect(page.getByRole('heading', { name: 'Review your setup' })).toBeVisible();

    await a11yScan(page);
  });

  // ─── State 4: Workout request screen ────────────────────────────
  test('State 4 — Workout request screen passes axe', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await completeOnboarding(page);

    await page.getByRole('button', { name: 'Workout' }).click();
    await expect(page.getByRole('heading', { name: 'Build your session' })).toBeVisible();

    await a11yScan(page);
  });

  // ─── State 5: Workout review screen ─────────────────────────────
  test('State 5 — Workout review screen passes axe', async ({ page }) => {
    // setupWorkoutFlow self-initializes the E2E route mocks and stops at the
    // configured Chest + Back request; generate here to land on the review.
    await setupWorkoutFlow(page);
    await page.getByRole('button', { name: 'Generate workout' }).click();

    await expect(page.getByRole('heading', { name: 'Chest + Back' })).toBeVisible({
      timeout: 10_000,
    });

    await a11yScan(page);
  });

  // ─── State 6: Active workout screen ─────────────────────────────
  test('State 6 — Active workout screen passes axe', async ({ page }) => {
    // setupActiveWorkout self-initializes mocks and lands on the active screen.
    await setupActiveWorkout(page);

    await expect(page.getByRole('heading', { name: 'Chest + Back' })).toBeVisible();

    await a11yScan(page);
  });

  // ─── State 7: Active workout with rest timer ────────────────────
  test('State 7 — Active workout with rest timer passes axe', async ({ page }) => {
    await setupActiveWorkout(page);

    // Fill Set 1 entry fields using their accessible labels
    await page.getByLabel('Set 1 weight').fill('60');
    await page.getByLabel('Set 1 reps').fill('10');
    await page.getByLabel('Set 1 RIR').selectOption('2');

    // Click the Complete button scoped to Set 1 — the first set in the
    // ordered list (semantically "Set 1").
    await page.locator('.active-set').first().getByRole('button', { name: 'Complete' }).click();

    // Rest panel should appear
    await expect(page.locator('.rest-panel')).toBeVisible();

    await a11yScan(page);
  });

  // ─── State 8: Progress History mode ─────────────────────────────
  test('State 8 — Progress History mode passes axe', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await completeOnboarding(page);

    await page.getByRole('button', { name: 'Progress' }).click();
    await expect(page.getByRole('heading', { name: 'Your training' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible();

    await a11yScan(page);
  });

  // ─── State 9: Progress Progression mode ─────────────────────────
  test('State 9 — Progress Progression mode passes axe', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await completeOnboarding(page);

    await page.getByRole('button', { name: 'Progress' }).click();
    await page.getByRole('button', { name: 'Progression' }).click();

    await expect(page.getByText('Exercise Progression')).toBeVisible();

    await a11yScan(page);
  });

  // ─── State 10: Profile / Settings screen ────────────────────────
  test('State 10 — Settings screen passes axe', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await completeOnboarding(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Training preferences' })).toBeVisible();

    await a11yScan(page);
  });

  // ─── State 11: Goal edit state ──────────────────────────────────
  test('State 11 — Goal edit state passes axe', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await completeOnboarding(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('Goal')).toBeVisible();

    await a11yScan(page);
  });

  // ─── State 12: Finish confirmation ──────────────────────────────
  test('State 12 — Finish confirmation passes axe', async ({ page }) => {
    await setupActiveWorkout(page);

    // Click Finish workout without completing any sets
    await page.getByRole('button', { name: 'Finish workout' }).click();

    await expect(page.locator('.active-workout__finish--confirming')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep logging' })).toBeVisible();

    await a11yScan(page);
  });
});
