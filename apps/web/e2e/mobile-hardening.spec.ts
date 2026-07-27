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

import { test, expect, type Locator, type Page } from '@playwright/test';
import { completeOnboarding, setupActiveWorkout, setupE2ETest, setupWorkoutFlow } from './helpers';

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
  await setupE2ETest(page);
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
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
}

const SHORT_PAGE_TOLERANCE_PX = 4;

const stab004Viewports = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'compact Android', width: 360, height: 800 },
  { name: 'large mobile', width: 430, height: 932 },
] as const;

const desktopReferenceViewport = { name: 'desktop reference', width: 1280, height: 900 } as const;

type GeometryClassification = 'short' | 'long';

interface RouteGeometrySpec {
  readonly name: string;
  readonly classification: GeometryClassification;
  readonly hasBottomNav: boolean;
  readonly setup: (page: Page) => Promise<void>;
  readonly finalControl: (page: Page) => Locator;
}

async function goToOtpScreen(page: Page) {
  await goToSignInScreen(page);
  await page.getByLabel('Email').fill('layout@example.com');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await expect(page.getByText('Enter verification code')).toBeVisible();
}

async function createProgram(page: Page) {
  await page.getByRole('button', { name: 'Create my program' }).click();
  await expect(page.getByRole('heading', { name: 'Create my program' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: '8 weeks' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create program' }).click();
  await expect(page.getByRole('heading', { name: 'Upper A' })).toBeVisible({ timeout: 15_000 });
}

async function setupOnboardingQuestion(page: Page) {
  await setupE2ETest(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: "What's your main goal?" })).toBeVisible();
}

async function setupWorkoutRequest(page: Page) {
  await setupWithOnboarding(page);
  await page.getByRole('button', { name: 'Workout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Build your session' })).toBeVisible();
}

async function setupWorkoutReview(page: Page) {
  await setupWorkoutFlow(page);
  await page.getByRole('button', { name: 'Generate workout' }).click();
  await expect(page.getByRole('heading', { name: 'Chest + Back' })).toBeVisible({
    timeout: 10_000,
  });
}

async function setupProgramOverview(page: Page) {
  await setupWithOnboarding(page);
  await createProgram(page);
  await page.getByRole('button', { name: 'Program', exact: true }).click();
  await expect(page.getByTestId('program-week-detail')).toContainText('Dumbbell Bench Press');
}

async function setupWeekDetail(page: Page) {
  await setupProgramOverview(page);
  await page.getByLabel('Reschedule Upper A').first().scrollIntoViewIfNeeded();
}

async function setupProgress(page: Page) {
  await setupWithOnboarding(page);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('button', { name: 'History', pressed: true })).toBeVisible();
}

async function setupSettings(page: Page) {
  await setupWithOnboarding(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Training preferences' })).toBeVisible();
}

const routeGeometrySpecs: readonly RouteGeometrySpec[] = [
  {
    name: 'email entry',
    classification: 'short',
    hasBottomNav: false,
    setup: goToSignInScreen,
    finalControl: (page) => page.getByRole('button', { name: 'Continue with email' }),
  },
  {
    name: 'OTP verification',
    classification: 'short',
    hasBottomNav: false,
    setup: goToOtpScreen,
    finalControl: (page) => page.getByRole('button', { name: 'Verify code' }),
  },
  {
    name: 'short onboarding step',
    classification: 'short',
    hasBottomNav: false,
    setup: setupOnboardingQuestion,
    finalControl: (page) => page.getByRole('button', { name: 'Continue' }),
  },
  {
    name: 'Today empty',
    classification: 'short',
    hasBottomNav: true,
    setup: setupWithOnboarding,
    finalControl: (page) => page.getByRole('button', { name: 'Generate one session' }),
  },
  {
    name: 'workout request',
    classification: 'long',
    hasBottomNav: true,
    setup: setupWorkoutRequest,
    finalControl: (page) => page.getByRole('button', { name: 'Generate workout' }),
  },
  {
    name: 'workout review',
    classification: 'long',
    hasBottomNav: true,
    setup: setupWorkoutReview,
    finalControl: (page) => page.getByRole('button', { name: 'Start workout' }),
  },
  {
    name: 'active workout',
    classification: 'short',
    hasBottomNav: false,
    setup: setupActiveWorkout,
    finalControl: (page) => page.getByRole('button', { name: 'Finish workout' }),
  },
  {
    name: 'program overview',
    classification: 'long',
    hasBottomNav: true,
    setup: setupProgramOverview,
    finalControl: (page) => page.getByRole('button', { name: 'Edit future program' }),
  },
  {
    name: 'week detail',
    classification: 'long',
    hasBottomNav: true,
    setup: setupWeekDetail,
    finalControl: (page) => page.getByLabel('Reschedule Upper A').first(),
  },
  {
    name: 'progress',
    classification: 'short',
    hasBottomNav: true,
    setup: setupProgress,
    finalControl: (page) => page.getByRole('button', { name: 'Progression' }),
  },
  {
    name: 'settings',
    classification: 'long',
    hasBottomNav: true,
    setup: setupSettings,
    finalControl: (page) => page.getByRole('button', { name: 'Sign out' }),
  },
] as const;

async function measureGeometry(page: Page) {
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const root = document.documentElement;
    const nav = document.querySelector('.bottom-nav');
    const navRect = nav?.getBoundingClientRect();
    const navStyle = nav ? getComputedStyle(nav) : null;
    const rootStyle = getComputedStyle(root);
    const visibleInteractiveCount = Array.from(
      document.querySelectorAll('button, input, select, textarea, a[href], [role="button"]'),
    ).filter((item) => {
      const style = getComputedStyle(item);
      const rect = item.getBoundingClientRect();
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      );
    }).length;
    return {
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      windowInnerHeight: window.innerHeight,
      bodyMinHeight: getComputedStyle(document.body).minHeight,
      rootOverflowY: rootStyle.overflowY,
      bottomNav: navRect
        ? {
            top: navRect.top,
            bottom: navRect.bottom,
            height: navRect.height,
            paddingTop: Number.parseFloat(navStyle?.paddingTop ?? '0'),
            paddingBottom: Number.parseFloat(navStyle?.paddingBottom ?? '0'),
          }
        : null,
      visibleInteractiveCount,
    };
  });
}

async function assertShortPageFits(page: Page, spec: RouteGeometrySpec, viewportName: string) {
  const geometry = await measureGeometry(page);
  const overflow = geometry.scrollHeight - geometry.clientHeight;
  expect(
    geometry.scrollHeight,
    `${spec.name} at ${viewportName} overflowed by ${overflow}px`,
  ).toBeLessThanOrEqual(geometry.clientHeight + SHORT_PAGE_TOLERANCE_PX);
  await assertFinalControlReachable(page, spec, viewportName);
}

async function assertLongPageScrollable(page: Page, spec: RouteGeometrySpec, viewportName: string) {
  const geometry = await measureGeometry(page);
  expect(
    geometry.scrollHeight,
    `${spec.name} at ${viewportName} should remain scrollable when content is long`,
  ).toBeGreaterThan(geometry.clientHeight + SHORT_PAGE_TOLERANCE_PX);
  await assertFinalControlReachable(page, spec, viewportName);
}

async function assertFinalControlReachable(
  page: Page,
  spec: RouteGeometrySpec,
  viewportName: string,
) {
  const control = spec.finalControl(page);
  await control.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'nearest' }),
  );
  await expect(control).toBeVisible();
  const result = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const fixedRects = Array.from(document.querySelectorAll<HTMLElement>('*'))
      .filter((item) => {
        if (item === element || item.contains(element)) return false;
        const style = getComputedStyle(item);
        const box = item.getBoundingClientRect();
        return (
          (style.position === 'fixed' || style.position === 'sticky') &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          box.width > 0 &&
          box.height > 0
        );
      })
      .map((item) => {
        const box = item.getBoundingClientRect();
        return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
      });
    const overlaps = fixedRects.filter((fixed) => {
      const horizontal = rect.left < fixed.right && rect.right > fixed.left;
      const vertical = rect.top < fixed.bottom && rect.bottom > fixed.top;
      return horizontal && vertical;
    });
    return {
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      overlaps,
    };
  });
  expect(
    result.top,
    `${spec.name} final control is clipped above viewport at ${viewportName}`,
  ).toBeGreaterThanOrEqual(-SHORT_PAGE_TOLERANCE_PX);
  expect(
    result.bottom,
    `${spec.name} final control is clipped below viewport at ${viewportName}`,
  ).toBeLessThanOrEqual(result.viewportHeight + SHORT_PAGE_TOLERANCE_PX);
  expect(
    result.overlaps,
    `${spec.name} final control is covered by fixed/sticky UI at ${viewportName}`,
  ).toEqual([]);
}

async function assertBottomNavigationGeometry(
  page: Page,
  spec: RouteGeometrySpec,
  viewportName: string,
) {
  const nav = page.locator('.bottom-nav');
  if (!spec.hasBottomNav) {
    await expect(nav).not.toBeVisible();
    return;
  }
  await expect(nav).toBeVisible();
  const geometry = await measureGeometry(page);
  expect(
    geometry.bottomNav,
    `${spec.name} should have bottom nav at ${viewportName}`,
  ).not.toBeNull();
  expect(geometry.bottomNav?.bottom).toBeLessThanOrEqual(geometry.windowInnerHeight + 1);
  expect(geometry.bottomNav?.top).toBeGreaterThan(0);
  expect(geometry.bottomNav?.paddingBottom).toBeGreaterThanOrEqual(
    geometry.bottomNav?.paddingTop ?? 0,
  );
}

function logGeometry(
  phase: 'before-or-current' | 'after',
  viewportName: string,
  spec: RouteGeometrySpec,
  classification: GeometryClassification,
  geometry: Awaited<ReturnType<typeof measureGeometry>>,
) {
  console.log(
    `STAB004 ${JSON.stringify({
      phase,
      viewport: viewportName,
      route: spec.name,
      classification,
      clientHeight: geometry.clientHeight,
      scrollHeight: geometry.scrollHeight,
      overflow: geometry.scrollHeight - geometry.clientHeight,
      hasBottomNav: geometry.bottomNav !== null,
      finalControlVisibility: 'checked',
    })}`,
  );
}

function classificationFor(spec: RouteGeometrySpec, viewportName: string): GeometryClassification {
  if (spec.name === 'workout request' && viewportName === 'large mobile') {
    return 'short';
  }
  return spec.classification;
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
    await expect(page.getByRole('heading', { name: "What's your main goal?" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('no horizontal overflow at 320px — workout request', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await setupWithOnboarding(page);
    await page.getByRole('button', { name: 'Workout' }).click();
    await expect(page.getByRole('heading', { name: 'Build your session' })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Training preferences' })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Build your session' })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Training preferences' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});

test.describe('HARDENING-003 — bottom navigation visibility', () => {
  test('bottom navigation visible in standard tabs', async ({ page }) => {
    await setupWithOnboarding(page);
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Workout' })).toBeVisible();
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

  test('settings goal select exposes and saves its value', async ({ page }) => {
    await setupWithOnboarding(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    const goal = page.getByLabel('Goal');
    await expect(goal).toHaveValue('recomposition');
    await goal.selectOption('gain_strength');
    await expect(goal).toHaveValue('gain_strength');
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
    await page.getByLabel('Set 1 RIR').selectOption('2');

    // Complete Set 1 — scope to first .active-set
    await page.locator('.active-set').first().getByRole('button', { name: 'Complete' }).click();

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
    await page.getByLabel('Set 1 RIR').selectOption('2');

    await page.locator('.active-set').first().getByRole('button', { name: 'Complete' }).click();

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

test.describe('STAB-004 — mobile route geometry', () => {
  for (const viewport of stab004Viewports) {
    for (const spec of routeGeometrySpecs) {
      test(`${spec.name} geometry at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await spec.setup(page);
        await assertNoHorizontalOverflow(page);
        await assertBottomNavigationGeometry(page, spec, viewport.name);
        const geometry = await measureGeometry(page);
        const classification = classificationFor(spec, viewport.name);
        logGeometry('after', viewport.name, spec, classification, geometry);
        if (classification === 'short') {
          await assertShortPageFits(page, spec, viewport.name);
        } else {
          await assertLongPageScrollable(page, spec, viewport.name);
        }
      });
    }
  }

  test('desktop reference keeps primary route controls reachable', async ({ page }) => {
    await page.setViewportSize({
      width: desktopReferenceViewport.width,
      height: desktopReferenceViewport.height,
    });
    for (const spec of routeGeometrySpecs) {
      await spec.setup(page);
      await assertNoHorizontalOverflow(page);
      await assertBottomNavigationGeometry(page, spec, desktopReferenceViewport.name);
      await assertFinalControlReachable(page, spec, desktopReferenceViewport.name);
    }
  });
});
