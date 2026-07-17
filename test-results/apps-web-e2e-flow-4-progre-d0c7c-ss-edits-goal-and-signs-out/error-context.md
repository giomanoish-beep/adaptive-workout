# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apps\web\e2e\flow-4-progress-signout.spec.ts >> Flow 4 — Progress → profile goal edit → sign out >> verifies progress, edits goal, and signs out
- Location: apps\web\e2e\flow-4-progress-signout.spec.ts:18:3

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  1   | /**
  2   |  * CRITICAL FLOW 4: PROGRESS → PROFILE GOAL EDIT → SIGN OUT
  3   |  *
  4   |  * Starting in the app after onboarding, opens Progress, verifies History
  5   |  * and Progression views with exact fixture assertions, edits the training
  6   |  * goal in Settings, and signs out.
  7   |  */
  8   |
  9   | import { test, expect } from '@playwright/test';
  10  | import { completeOnboarding } from './helpers';
  11  |
  12  | test.describe('Flow 4 — Progress → profile goal edit → sign out', () => {
  13  |   test.beforeEach(async ({ page }) => {
> 14  |     await page.goto('/');
      |                ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  15  |     await completeOnboarding(page);
  16  |   });
  17  |
  18  |   test('verifies progress, edits goal, and signs out', async ({ page }) => {
  19  |     // -- Open Progress tab --
  20  |     await page.getByRole('button', { name: 'Progress' }).click();
  21  |
  22  |     // Default mode is History
  23  |     await expect(
  24  |       page.getByRole('button', { name: 'History', pressed: true }),
  25  |     ).toBeVisible();
  26  |
  27  |     // Assert summary metrics
  28  |     await expect(page.locator('.progress-summary')).toContainText('12');
  29  |     await expect(page.locator('.progress-summary')).toContainText('Workouts');
  30  |     await expect(page.locator('.progress-summary')).toContainText('184');
  31  |     await expect(page.locator('.progress-summary')).toContainText('Working sets');
  32  |     await expect(page.locator('.progress-summary')).toContainText('3 weeks');
  33  |     await expect(page.locator('.progress-summary')).toContainText('Training streak');
  34  |
  35  |     // -- Switch to Progression --
  36  |     await page.getByRole('button', { name: 'Progression' }).click();
  37  |
  38  |     // Assert Dumbbell Bench Press progression card
  39  |     await expect(page.locator('.progress-progression-list')).toContainText(
  40  |       'Dumbbell Bench Press',
  41  |     );
  42  |     // Assert Increase load recommendation + 34 kg next
  43  |     await expect(page.locator('.progress-progression-list')).toContainText(
  44  |       'Increase load',
  45  |     );
  46  |     await expect(page.locator('.progress-progression-list')).toContainText('34 kg');
  47  |
  48  |     // Assert Seated Cable Row — targetRir is null → should render "—" (em dash), not "0"
  49  |     // The card text is concatenated from adjacent spans: "Target RIR—" (no space)
  50  |     const seatedCableRowCard = page
  51  |       .locator('.progress-progression-card')
  52  |       .filter({ hasText: 'Seated Cable Row' });
  53  |     await expect(seatedCableRowCard).toContainText('Target RIR\u2014');
  54  |
  55  |     // Assert Incline Dumbbell Press — targetRir is 0 → renders "Target RIR0" (no space)
  56  |     const inclineCard = page
  57  |       .locator('.progress-progression-card')
  58  |       .filter({ hasText: 'Incline Dumbbell Press' });
  59  |     await expect(inclineCard).toContainText('Target RIR0');
  60  |
  61  |     // -- Open Settings tab --
  62  |     await page.getByRole('button', { name: 'Settings' }).click();
  63  |
  64  |     // Assert goal is Recomposition (from onboarding)
  65  |     const goalCard = page.locator('.settings-card').filter({ hasText: 'Training goal' });
  66  |     await expect(goalCard.locator('.settings-card__value')).toContainText('Recomposition');
  67  |
  68  |     // Enter goal edit mode
  69  |     await page.getByRole('button', { name: 'Edit training goal' }).click();
  70  |
  71  |     // Select Build muscle
  72  |     await page
  73  |       .getByRole('radio', { name: 'Build muscle' })
  74  |       .click();
  75  |
  76  |     // Save
  77  |     await page.getByRole('button', { name: 'Save' }).click();
  78  |
  79  |     // Assert Build muscle is shown
  80  |     await expect(goalCard.locator('.settings-card__value')).toContainText('Build muscle');
  81  |
  82  |     // Navigate away to Progress and back to verify persistence within session
  83  |     await page.getByRole('button', { name: 'Progress' }).click();
  84  |     const settingsBtn = page.getByRole('button', { name: 'Settings' });
  85  |     await settingsBtn.click();
  86  |
  87  |     // Build muscle is still shown during the same app session
  88  |     await expect(goalCard.locator('.settings-card__value')).toContainText('Build muscle');
  89  |
  90  |     // -- Sign out --
  91  |     await page.getByRole('button', { name: 'Sign out' }).click();
  92  |
  93  |     // After the E2E sign-out, the unauthenticated sign-in screen appears.
  94  |     // The E2E seam transitions to unauthenticated without calling a real
  95  |     // Supabase endpoint.
  96  |     await expect(
  97  |       page.getByRole('heading', { name: 'Sign in' }),
  98  |     ).toBeVisible();
  99  |     await expect(
  100 |       page.getByRole('button', { name: 'Sign out' }),
  101 |     ).not.toBeVisible();
  102 |   });
  103 | });
```
