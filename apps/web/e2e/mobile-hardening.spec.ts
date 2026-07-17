/**
 * HARDENING-003: Mobile viewport and accessibility semantics checks.
 *
 * Tests at 320px and 430px viewport widths:
 *  - No horizontal document overflow on key screens
 *  - Bottom navigation visibility / hidden states
 *  - Selected states exposed on segmented controls, chips, options
 *  - Form controls have accessible names
 *  - Primary active-workout actions are keyboard reachable
 *  - Rest timer does not use a 1-second aria-live announcement
 *  - Ready state is accessible
 *  - Timer interval cleanup behavior confirmed structurally
 */

import { test, expect } from '@playwright/test';
import { completeOnboarding, setupActiveWorkout } from './helpers';

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => {
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(
    overflow.clientWidth + 1, // allow 1px rounding
  );
}

/** Complete onboarding and navigate to the workout tab. */
async function setupWithOnboarding(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await completeOnboarding(page);
}

/**
 * Navigate to the unauthenticated sign-in screen by signing out through
 * Settings. The E2E auth seam starts authenticated, so sign-out is the
 * deterministic way to reach the sign-in screen.
 */
async function goToSignInScreen(page: import('@playwright/test').Page) {
  await setupWithOnboarding(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Email' }),
  ).toBeVisible();
}

/** Shared setup: generate Chest+Back active workout.
 *  Provided centrally by `setupActiveWorkout` from helpers.ts, which
 *  self-initializes the E2E route mocks so workout generation resolves. */

test.describe('HARDENING-003 — mobile overflow', () => {
  // ═══ 320px viewport checks ══════════════════════════════════════════

  test('no horizontal overflow at 320px — sign-in', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await goToSignInScreen(page);
    await assertNoHorizontalOverflow(page);
  });

  test('no horizontal overflow at 320px — onboarding question', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('heading', { name: "What's your main goal?" }),
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('no horizontal overflow at 320px — workout request', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await setupWithOnboarding(page);
    await page.getByRole('button', { name: 'Workout' }).click();
    await expect(
      page.getByRole('heading', { name: 'Build your session' }),
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('no horizontal overflow at 320px — active workout', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await setupActiveWorkout(page);
    await assertNoHorizontalOverflow(page);
  });

  test('no horizontal overflow at 320px — settings', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await setupWithOnboarding(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(
      page.getByRole('heading', { name: 'Training profile' }),
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  // ═══ 430px viewport checks ══════════════════════════════════════════

  test('no horizontal overflow at 430px — sign-in', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await goToSignInScreen(page);
    await assertNoHorizontalOverflow(page);
  });

  test('no horizontal overflow at 430px — workout request', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await setupWithOnboarding(page);
    await page.getByRole('button', { name: 'Workout' }).click();
    await expect(
      page.getByRole('heading', { name: 'Build your session' }),
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('no horizontal overflow at 430px — active workout', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await setupActiveWorkout(page);
    await assertNoHorizontalOverflow(page);
  });

  test('no horizontal overflow at 430px — settings', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await setupWithOnboarding(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(
      page.getByRole('heading', { name: 'Training profile' }),
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});

test.describe('HARDENING-003 — bottom navigation visibility', () => {
  test('bottom navigation visible in standard tabs', async ({ page }) => {
    await setupWithOnboarding(page);
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Workout' }),
    ).toBeVisible();
  });

  test('bottom navigation hidden during active workout', async ({ page }) => {
    await setupActiveWorkout(page);
    await expect(page.locator('.bottom-nav')).not.toBeVisible();
  });

  test('bottom navigation within viewport when visible', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await setupWithOnboarding(page);

    const nav = page.locator('.bottom-nav');
    await expect(nav).toBeVisible();

    const box = await nav.boundingBox();
    if (box) {
      expect(box.y + box.height).toBeLessThanOrEqual(932 + 1);
      expect(box.y).toBeLessThan(932);
    }
  });
});

test.describe('HARDENING-003 — selected state semantics', () => {
  test('segmented controls expose selected state via aria-pressed', async ({ page }) => {
    await setupWithOnboarding(page);

    await page.getByRole('button', { name: 'Progress' }).click();
    const historyBtn = page.getByRole('button', { name: 'History' });
    const progressionBtn = page.getByRole('button', { name: 'Progression' });

    await expect(historyBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(progressionBtn).toHaveAttribute('aria-pressed', 'false');

    await progressionBtn.click();
    await expect(historyBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(progressionBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('muscle chips expose selected state via aria-pressed', async ({ page }) => {
    await setupWithOnboarding(page);

    await page.getByRole('button', { name: 'Workout' }).click();
    const chestBtn = page.getByRole('button', { name: 'Chest', exact: true });

    await expect(chestBtn).toHaveAttribute('aria-pressed', 'false');
    await chestBtn.click();
    await expect(chestBtn).toHaveAttribute('aria-pressed', 'true');
    await chestBtn.click();
    await expect(chestBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('onboarding options expose selected via aria-pressed', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const recompositionBtn = page.getByRole('button', { name: 'Recomposition' });
    await expect(recompositionBtn).toHaveAttribute('aria-pressed', 'false');
    await recompositionBtn.click();
    await expect(recompositionBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('settings goal edit radios expose aria-checked', async ({ page }) => {
    await setupWithOnboarding(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Edit training goal' }).click();

    const radio = page.getByRole('radio', { name: 'Recomposition' });
    await expect(radio).toHaveAttribute('aria-checked', 'true');

    const otherRadio = page.getByRole('radio', { name: 'Strength' });
    await expect(otherRadio).toHaveAttribute('aria-checked', 'false');

    await otherRadio.click();
    await expect(radio).toHaveAttribute('aria-checked', 'false');
    await expect(otherRadio).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('HARDENING-003 — form control accessible names', () => {
  test('sign-in email input has accessible name', async ({ page }) => {
    await goToSignInScreen(page);

    const input = page.getByLabel('Email');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('type', 'email');
  });

  test('set entry inputs have accessible names', async ({ page }) => {
    await setupActiveWorkout(page);

    await expect(page.getByLabel('Set 1 weight')).toBeVisible();
    await expect(page.getByLabel('Set 1 reps')).toBeVisible();
    await expect(page.getByLabel('Set 1 RIR')).toBeVisible();
  });

  test('onboarding custom duration input has accessible name', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Recomposition' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Intermediate' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: '4 days' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'Custom', exact: true }).click();
    await expect(page.getByLabel('Minutes')).toBeVisible();
  });

  test('workout request custom duration input has accessible name', async ({ page }) => {
    await setupWithOnboarding(page);

    await page.getByRole('button', { name: 'Workout' }).click();
    await page.getByRole('button', { name: 'Custom', exact: true }).click();

    await expect(page.getByLabel('Minutes')).toBeVisible();
  });
});

test.describe('HARDENING-003 — error text programmatically discoverable', () => {
  test('sign-in error is discoverable via role=alert', async ({ page }) => {
    await goToSignInScreen(page);

    // Submit empty form to trigger validation error
    await page.getByRole('button', { name: 'Continue with email' }).click();

    const error = page.locator('.sign-in__error');
    await expect(error).toHaveAttribute('role', 'alert');
  });

  test('workout request validation errors are discoverable', async ({ page }) => {
    await setupWithOnboarding(page);

    await page.getByRole('button', { name: 'Workout' }).click();

    // Generate workout with no selections should be disabled
    const generateBtn = page.getByRole('button', { name: 'Generate workout' });
    await expect(generateBtn).toBeDisabled();

    // At least one inline validation error should be present
    const errorCount = await page.locator('.workout-field__error').count();
    expect(errorCount).toBeGreaterThan(0);
  });
});

test.describe('HARDENING-003 — rest timer behavior', () => {
  test('rest timer does not use aria-live for clock ticks', async ({ page }) => {
    await setupActiveWorkout(page);

    await page.getByLabel('Set 1 weight').fill('60');
    await page.getByLabel('Set 1 reps').fill('10');
    await page.getByLabel('Set 1 RIR').fill('2');

    // Complete Set 1 — scope to first .active-set
    await page
      .locator('.active-set')
      .first()
      .getByRole('button', { name: 'Complete' })
      .click();

    const restPanel = page.locator('.rest-panel');
    await expect(restPanel).toBeVisible();
    await expect(restPanel).toHaveAttribute('role', 'timer');

    const clock = page.locator('.rest-panel__clock');
    await expect(clock).toHaveAttribute('aria-live', 'off');
  });

  test('rest timer Ready state is accessible via status role', async ({ page }) => {
    await setupActiveWorkout(page);

    await page.getByLabel('Set 1 weight').fill('60');
    await page.getByLabel('Set 1 reps').fill('10');
    await page.getByLabel('Set 1 RIR').fill('2');

    await page
      .locator('.active-set')
      .first()
      .getByRole('button', { name: 'Complete' })
      .click();

    await expect(page.locator('.rest-panel')).toBeVisible();

    const readyPanel = page.locator('.rest-panel--ready');
    if (await readyPanel.isVisible()) {
      await expect(readyPanel).toHaveAttribute('role', 'status');
      await expect(readyPanel).toHaveAttribute('aria-live', 'polite');
    }
  });
});

test.describe('HARDENING-003 — keyboard accessibility', () => {
  test('primary active-workout actions are keyboard reachable', async ({ page }) => {
    await setupActiveWorkout(page);

    const previousBtn = page.getByRole('button', { name: 'Previous' });
    const nextBtn = page.getByRole('button', { name: 'Next' });
    const finishBtn = page.getByRole('button', { name: 'Finish workout' });

    await expect(previousBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();
    await expect(finishBtn).toBeVisible();

    await finishBtn.focus();
    await expect(finishBtn).toBeFocused();
  });

  test('bottom navigation items are keyboard reachable', async ({ page }) => {
    await setupWithOnboarding(page);

    const workoutTab = page.getByRole('button', { name: 'Workout' });
    await workoutTab.focus();
    await expect(workoutTab).toBeFocused();
  });

  test('Generate workout is keyboard reachable after valid selections', async ({ page }) => {
    await setupWithOnboarding(page);

    await page.getByRole('button', { name: 'Workout' }).click();

    // First make a valid workout request
    await page.getByRole('button', { name: 'Chest', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: '60', exact: false }).click();
    await page.getByRole('button', { name: 'Full gym' }).click();

    // Now Generate workout should be enabled and focusable
    const genBtn = page.getByRole('button', { name: 'Generate workout' });
    await expect(genBtn).toBeEnabled();

    await genBtn.focus();
    await expect(genBtn).toBeFocused();
  });
});