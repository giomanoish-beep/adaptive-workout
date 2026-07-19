import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { completeOnboarding, preserveStoreAndReload, readE2EStore, setupE2ETest } from './helpers';

function monitor(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) =>
    errors.push(`network: ${request.method()} ${request.url()}`),
  );
  return errors;
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

async function ready(page: Page) {
  await setupE2ETest(page);
  await page.goto('/');
  await completeOnboarding(page);
  await expect(page.getByRole('heading', { name: 'Your training home' })).toBeVisible();
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  ).toEqual([]);
}

test.describe('V1.2 persistent program journey', () => {
  test('creates, reloads, starts and completes a scheduled workout, then advances Today', async ({
    page,
  }) => {
    const errors = monitor(page);
    await ready(page);
    await createProgram(page);
    await preserveStoreAndReload(page);
    await expect(page.getByRole('heading', { name: 'Upper A' })).toBeVisible();
    await page.getByRole('button', { name: 'Start today’s workout' }).click();
    await expect(page.getByText('Scheduled workout review')).toBeVisible();
    await page.getByRole('button', { name: 'Start scheduled workout' }).click();
    await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
    await page.getByRole('button', { name: 'Finish workout' }).click();
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Last completed workout').locator('..')).not.toContainText(
      'Not yet',
    );
    const store = await readE2EStore(page);
    expect(store['program_scheduled_workouts']?.[0]?.['status']).toBe('completed');
    expect(store['workout_sessions']?.[0]).toMatchObject({
      origin: 'programmed',
      counts_for_program: true,
    });
    expect(errors).toEqual([]);
  });

  test('ad-hoc completion remains in History and cannot mutate or advance the program', async ({
    page,
  }) => {
    await ready(page);
    await createProgram(page);
    const before = await readE2EStore(page);
    const revision = before['programs']?.[0]?.['current_revision'];
    const schedule = before['program_scheduled_workouts']?.map((row) => ({
      id: row['id'],
      status: row['status'],
      date: row['scheduled_date'],
    }));
    await page.getByRole('button', { name: 'Create a workout for today' }).click();
    await expect(page.getByRole('heading', { name: 'Build your session' })).toBeVisible();
    await page.getByRole('button', { name: 'Chest', exact: true }).click();
    await page.getByRole('button', { name: '60', exact: false }).click();
    await page.getByRole('button', { name: 'Full gym' }).click();
    await page.getByRole('button', { name: 'Generate workout' }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await page.getByRole('button', { name: 'Finish workout' }).click();
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    const after = await readE2EStore(page);
    expect(after['programs']?.[0]?.['current_revision']).toBe(revision);
    expect(
      after['program_scheduled_workouts']?.map((row) => ({
        id: row['id'],
        status: row['status'],
        date: row['scheduled_date'],
      })),
    ).toEqual(schedule);
    expect(after['workout_sessions']?.at(-1)).toMatchObject({
      origin: 'generated',
      counts_for_program: false,
    });
  });

  test('reschedules, skips, adapts and restores the immutable base prescription', async ({
    page,
  }) => {
    await ready(page);
    await createProgram(page);
    await page.getByRole('button', { name: 'Program', exact: true }).click();
    await expect(page.getByTestId('program-week-detail')).toContainText('Calibration recommended');
    const baseText = await page.getByTestId('program-week-detail').innerText();
    const move = page.getByLabel('Reschedule Upper A').first();
    await move.fill('2026-08-01');
    await expect(page.getByTestId('program-week-detail')).toContainText('rescheduled');
    await page.getByRole('button', { name: 'Skip' }).last().click();
    await expect(page.getByTestId('program-week-detail')).toContainText('skipped');
    await page.getByRole('button', { name: 'Add temporary restriction' }).click();
    await page.getByLabel('Affected region').fill('shoulder');
    await page.getByRole('button', { name: 'Save adaptation' }).click();
    await expect(page.getByText('Shoulder', { exact: false }).first()).toBeVisible();
    await expect(
      page.getByText('Temporary adaptation applies; base preserved').first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('No active temporary restrictions.')).toBeVisible();
    expect(await page.getByTestId('program-week-detail').innerText()).toContain(
      'Dumbbell Bench Press',
    );
    expect(baseText).toContain('Dumbbell Bench Press');
    await page.getByRole('button', { name: 'Edit future program' }).click();
    await page.getByLabel('Training days').selectOption('3');
    await page.getByRole('button', { name: 'Save new revision' }).click();
    await expect(page.getByText('Program · Revision 2')).toBeVisible();
    const revised = await readE2EStore(page);
    expect(revised['program_revisions']).toHaveLength(2);
  });

  test('program navigation, mobile layout, no errors, and accessibility pass', async ({ page }) => {
    const errors = monitor(page);
    await ready(page);
    await createProgram(page);
    for (const name of ['Today', 'Program', 'Workout', 'Progress', 'Settings']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expectNoOverflow(page);
    }
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Program', exact: true }).click();
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });
});

test.describe('V1.2 visual snapshots', () => {
  test('captures no-program, Today, program, week, adaptation, ad-hoc, and scheduled review', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Stable visual baselines are captured once.');
    await ready(page);
    await expect(page).toHaveScreenshot('v1-2-no-program-today.png', { fullPage: true });
    await page.getByRole('button', { name: 'Generate one session' }).click();
    await expect(page).toHaveScreenshot('v1-2-ad-hoc-entry.png', { fullPage: true });
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await createProgram(page);
    await expect(page).toHaveScreenshot('v1-2-today-scheduled.png', { fullPage: true });
    await page.getByRole('button', { name: 'Start today’s workout' }).click();
    await expect(page).toHaveScreenshot('v1-2-scheduled-review.png', { fullPage: true });
    await page.getByRole('button', { name: 'Back to Today' }).click();
    await page.getByRole('button', { name: 'Program', exact: true }).click();
    await expect(page).toHaveScreenshot('v1-2-program-overview.png', { fullPage: true });
    await expect(page.getByTestId('program-week-detail')).toHaveScreenshot('v1-2-week-detail.png');
    await page.getByRole('button', { name: 'Add temporary restriction' }).click();
    await page.getByRole('button', { name: 'Save adaptation' }).click();
    await expect(page).toHaveScreenshot('v1-2-discomfort-adaptation.png', { fullPage: true });
  });
});
