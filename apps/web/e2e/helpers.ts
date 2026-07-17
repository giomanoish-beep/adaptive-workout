/**
 * Shared E2E helpers for deterministic test setup.
 *
 * Provides:
 *  - installE2EEnvironment / resetE2EState / setupE2ETest (idempotent per page)
 *  - completeOnboarding shared flow
 *  - setupWorkoutFlow / setupActiveWorkout high-level helpers that self-initialize
 *    their E2E prerequisites, so they are safe to call as the first operation
 *    of a test. Pass `{ initialize: false }` when the environment is already set
 *    up (e.g. when one helper calls another) to avoid a redundant reset.
 *
 * Design rule: every high-level E2E setup helper either fully initializes its
 * own prerequisites or requires an explicit initialized context. This prevents
 * the hidden ordering dependency that previously caused workout-flow screens to
 * hang because route mocks were never installed.
 */

import { expect, type Page } from '@playwright/test';
import {
  installE2ERouteMocks,
  type E2EMockConfig,
  type E2EMockTracker,
} from './route-mocks';

/**
 * Tracks pages that have already had route mocks installed, so repeated calls
 * are idempotent. `page.route` handlers persist across `page.reload()` and
 * `page.goto`, and double-registration is safe (later handler wins via LIFO),
 * but avoiding redundant work keeps setup deterministic and fast.
 */
const initializedPages = new WeakMap<Page, E2EMockTracker>();

/**
 * Install the Edge Function route mocks on the page. Idempotent per page:
 * a page already initialized is not re-initialized.
 */
export async function installE2EEnvironment(
  page: Page,
  config: E2EMockConfig = {},
): Promise<E2EMockTracker> {
  const existing = initializedPages.get(page);
  if (existing) return existing;
  const tracker = await installE2ERouteMocks(page, config);
  initializedPages.set(page, tracker);
  return tracker;
}

/**
 * Reset the in-memory E2E store to a clean slate and reload the app. Route
 * mocks (if installed) persist across the reload.
 */
export async function resetE2EState(page: Page): Promise<void> {
  // Clear the store before the app mounts on the next navigation.
  await page.goto('about:blank');
  await page.evaluate(() => {
    const api = (window as unknown as Record<string, unknown>)
      .__E2E_STORE__ as { clear: () => void } | undefined;
    api?.clear();
  });
}

/**
 * Full deterministic setup: install route mocks and reset the store. Safe to
 * call at the start of every test (beforeEach) for isolation. Idempotent per
 * page — repeated calls on the same page only reset the store, not the mocks.
 *
 * NOTE: if you need a non-default mock config, install it explicitly via
 * `installE2EEnvironment(page, config)` instead of relying on the default here.
 */
export async function setupE2ETest(page: Page): Promise<void> {
  await installE2EEnvironment(page);
  await resetE2EState(page);
}

/**
 * Completes the full onboarding flow with the standard test choices:
 * Recomposition → Intermediate → 4 days → 90 min → Commercial gym →
 * Let the app decide → No current discomfort → Finish setup.
 */
export async function completeOnboarding(page: Page): Promise<void> {
  // Step 1: Goal — Recomposition
  await page
    .getByRole('button', { name: 'Recomposition' })
    .click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2: Experience — Intermediate
  await page
    .getByRole('button', { name: 'Intermediate' })
    .click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3: Frequency — 4 days
  await page.getByRole('button', { name: '4 days' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 4: Duration — 90 min preset
  await page.getByRole('button', { name: '90', exact: false }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 5: Environment — Commercial gym
  await page
    .getByRole('button', { name: 'Commercial gym' })
    .click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 6: Program preference — Let the app decide
  await page
    .getByRole('button', { name: 'Let the app decide' })
    .click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 7: Discomfort — No current discomfort
  await page
    .getByRole('button', { name: 'No current discomfort' })
    .click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 8: Review
  await page.getByRole('button', { name: 'Finish setup' }).click();
}

export interface SetupOptions {
  /** When false, assume the E2E environment is already initialized. */
  readonly initialize?: boolean;
}

/**
 * Complete onboarding and drive the Workout tab to the point where a Chest +
 * Back request is ready to generate. Self-initializes by default.
 *
 * @param page Playwright page
 * @param options `{ initialize: false }` if `setupE2ETest` has already run
 */
export async function setupWorkoutFlow(
  page: Page,
  options: SetupOptions = {},
): Promise<void> {
  if (options.initialize !== false) {
    await setupE2ETest(page);
  }
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await completeOnboarding(page);

  await page.getByRole('button', { name: 'Workout', exact: true }).click();
  await page.getByRole('button', { name: 'Chest', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: '60', exact: false }).click();
  await page.getByRole('button', { name: 'Full gym' }).click();
}

/**
 * Generate a Chest + Back workout and start the active session. Self-initializes.
 */
export async function setupActiveWorkout(page: Page): Promise<void> {
  await setupE2ETest(page);
  await setupWorkoutFlow(page, { initialize: false });

  await page.getByRole('button', { name: 'Generate workout' }).click();
  await expect(
    page.getByRole('heading', { name: 'Chest + Back' }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(
    page.getByRole('heading', { name: 'Chest + Back' }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole('heading', { name: 'Dumbbell Bench Press' }),
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Helper to seed the E2E store and reload for persistence tests.
 * Used after completing onboarding and finishing a workout to persist state
 * before a page reload.
 */
export async function preserveStoreAndReload(page: Page): Promise<void> {
  // Dump the store
  const storeData = await page.evaluate(() => {
    const api = (window as unknown as Record<string, unknown>)
      .__E2E_STORE__ as { dump: () => Record<string, unknown[]> } | undefined;
    return api?.dump() ?? {};
  });

  // Install the snapshot before application modules execute on navigation.
  // This is an ephemeral E2E global, not browser storage.
  await page.addInitScript((data: Record<string, unknown[]>) => {
    (window as unknown as Record<string, unknown>).__E2E_SEED__ = data;
  }, storeData);
  await page.reload();
}

/** Read the in-memory adapter only for assertions that UI cannot distinguish. */
export async function readE2EStore(
  page: Page,
): Promise<Record<string, Record<string, unknown>[]>> {
  return page.evaluate(() => {
    const api = (window as unknown as Record<string, unknown>).__E2E_STORE__ as
      | { dump: () => Record<string, Record<string, unknown>[]> }
      | undefined;
    return api?.dump() ?? {};
  });
}
