# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v1-2-program.spec.ts >> V1.2 persistent program journey >> reschedules, skips, adapts and restores the immutable base prescription
- Location: e2e\v1-2-program.spec.ts:113:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Save adaptation' })
    - locator resolved to <button>Save adaptation</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <input value="shoulder"/> from <label>…</label> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button class="secondary-button">Add temporary restriction</button> intercepts pointer events
    - retrying click action
      - waiting 100ms
    27 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button class="secondary-button">Add temporary restriction</button> intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <select>…</select> from <label>…</label> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button class="secondary-button">Add temporary restriction</button> intercepts pointer events
     - retrying click action
       - waiting 500ms
       - waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <button class="secondary-button">Add temporary restriction</button> intercepts pointer events
     - retrying click action
       - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button class="secondary-button">Add temporary restriction</button> intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <select>…</select> from <label>…</label> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button class="secondary-button">Add temporary restriction</button> intercepts pointer events
  - retrying click action
    - waiting 500ms

```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e6]:
      - paragraph [ref=e7]: Program · Revision 1
      - generic [ref=e8]:
        - generic [ref=e9]:
          - heading "Recomposition · 8 weeks" [level=2] [ref=e10]
          - paragraph [ref=e11]: Upper Lower · 8 weeks
        - button "Today" [ref=e12] [cursor=pointer]
      - generic [ref=e13]:
        - text: Week
        - combobox "Week" [ref=e14]:
          - option "Week 1" [selected]
          - option "Week 2"
          - option "Week 3"
          - option "Week 4"
          - option "Week 5"
          - option "Week 6"
          - option "Week 7"
          - option "Week 8"
      - generic [ref=e15]:
        - article [ref=e16]:
          - generic [ref=e17]:
            - generic [ref=e18]:
              - text: 2026-07-20
              - heading "Lower A" [level=3] [ref=e19]
            - generic [ref=e20]: upcoming
          - paragraph [ref=e21]: Foundation
          - list [ref=e22]:
            - listitem [ref=e23]:
              - strong [ref=e24]: Goblet Squat
              - generic [ref=e25]: 3 × 8–12 @ RIR 2 · 120s
              - generic [ref=e26]: Calibration recommended · Calibrate with a controlled set inside the prescribed rep and RIR range.
            - listitem [ref=e27]:
              - strong [ref=e28]: Romanian Deadlift
              - generic [ref=e29]: 3 × 8–12 @ RIR 2 · 120s
              - generic [ref=e30]: Calibration recommended · Calibrate with a controlled set inside the prescribed rep and RIR range.
          - generic [ref=e31]:
            - generic [ref=e32]:
              - text: Move
              - textbox "Reschedule Lower A" [ref=e33]: 2026-07-20
            - button "Skip" [ref=e34] [cursor=pointer]
        - article [ref=e35]:
          - generic [ref=e36]:
            - generic [ref=e37]:
              - text: 2026-07-22
              - heading "Upper A" [level=3] [ref=e38]
            - generic [ref=e39]: upcoming
          - paragraph [ref=e40]: Foundation
          - list [ref=e41]:
            - listitem [ref=e42]:
              - strong [ref=e43]: Dumbbell Bench Press
              - generic [ref=e44]: 3 × 8–10 @ RIR 2 · 120s
              - generic [ref=e45]: Calibration recommended · Calibrate with a controlled set inside the prescribed rep and RIR range.
            - listitem [ref=e46]:
              - strong [ref=e47]: Seated Cable Row
              - generic [ref=e48]: 3 × 8–10 @ RIR 2 · 120s
              - generic [ref=e49]: Calibration recommended · Calibrate with a controlled set inside the prescribed rep and RIR range.
          - generic [ref=e50]:
            - generic [ref=e51]:
              - text: Move
              - textbox "Reschedule Upper A" [ref=e52]: 2026-07-22
            - button "Skip" [ref=e53] [cursor=pointer]
        - article [ref=e54]:
          - generic [ref=e55]:
            - generic [ref=e56]:
              - text: 2026-07-24
              - heading "Lower A" [level=3] [ref=e57]
            - generic [ref=e58]: upcoming
          - paragraph [ref=e59]: Foundation
          - list [ref=e60]:
            - listitem [ref=e61]:
              - strong [ref=e62]: Goblet Squat
              - generic [ref=e63]: 3 × 8–12 @ RIR 2 · 120s
              - generic [ref=e64]: Calibration recommended · Calibrate with a controlled set inside the prescribed rep and RIR range.
            - listitem [ref=e65]:
              - strong [ref=e66]: Romanian Deadlift
              - generic [ref=e67]: 3 × 8–12 @ RIR 2 · 120s
              - generic [ref=e68]: Calibration recommended · Calibrate with a controlled set inside the prescribed rep and RIR range.
          - generic [ref=e69]:
            - generic [ref=e70]:
              - text: Move
              - textbox "Reschedule Lower A" [ref=e71]: 2026-07-24
            - button "Skip" [ref=e72] [cursor=pointer]
        - article [ref=e73]:
          - generic [ref=e74]:
            - generic [ref=e75]:
              - text: 2026-08-01
              - heading "Upper A" [level=3] [ref=e76]
            - generic [ref=e77]: skipped
          - paragraph [ref=e78]: Foundation
          - list [ref=e79]:
            - listitem [ref=e80]:
              - strong [ref=e81]: Dumbbell Bench Press
              - generic [ref=e82]: 3 × 8–10 @ RIR 2 · 120s
              - generic [ref=e83]: Calibration recommended · Calibrate with a controlled set inside the prescribed rep and RIR range.
            - listitem [ref=e84]:
              - strong [ref=e85]: Seated Cable Row
              - generic [ref=e86]: 3 × 8–10 @ RIR 2 · 120s
              - generic [ref=e87]: Calibration recommended · Calibrate with a controlled set inside the prescribed rep and RIR range.
      - generic [ref=e88]:
        - heading "Training adaptations" [level=3] [ref=e89]
        - paragraph [ref=e90]: No active temporary restrictions.
        - button "Add temporary restriction" [ref=e91] [cursor=pointer]
        - generic [ref=e92]:
          - generic [ref=e93]:
            - text: Affected region
            - textbox "Affected region" [active] [ref=e94]: shoulder
          - generic [ref=e95]:
            - text: Restricted movement
            - combobox "Restricted movement" [ref=e96]:
              - option "Overhead press"
              - option "Horizontal press" [selected]
              - option "Squat"
              - option "Hinge"
              - option "Vertical pull"
          - generic [ref=e97]:
            - text: Severity
            - combobox "Severity" [ref=e98]:
              - option "Mild" [selected]
              - option "Moderate"
              - option "Severe — stop affected training"
          - button "Save adaptation" [ref=e99] [cursor=pointer]
      - button "Edit future program" [ref=e100] [cursor=pointer]
    - navigation "Primary" [ref=e101]:
      - button "Today" [ref=e102] [cursor=pointer]:
        - img [ref=e104]
        - generic [ref=e108]: Today
      - button "Program" [pressed] [ref=e109] [cursor=pointer]:
        - img [ref=e111]
        - generic [ref=e114]: Program
      - button "Workout" [ref=e115] [cursor=pointer]:
        - img [ref=e117]
        - generic [ref=e120]: Workout
      - button "Progress" [ref=e121] [cursor=pointer]:
        - img [ref=e123]
        - generic [ref=e125]: Progress
      - button "Settings" [ref=e126] [cursor=pointer]:
        - img [ref=e128]
        - generic [ref=e132]: Settings
```

# Test source

```ts
  28  |   await setupE2ETest(page);
  29  |   await page.goto('/');
  30  |   await completeOnboarding(page);
  31  |   await expect(page.getByRole('heading', { name: 'Your training home' })).toBeVisible();
  32  | }
  33  | 
  34  | async function expectNoOverflow(page: Page) {
  35  |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
  36  |     true,
  37  |   );
  38  | }
  39  | 
  40  | async function expectAccessible(page: Page) {
  41  |   const result = await new AxeBuilder({ page })
  42  |     .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  43  |     .analyze();
  44  |   expect(
  45  |     result.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  46  |   ).toEqual([]);
  47  | }
  48  | 
  49  | test.describe('V1.2 persistent program journey', () => {
  50  |   test('creates, reloads, starts and completes a scheduled workout, then advances Today', async ({
  51  |     page,
  52  |   }) => {
  53  |     const errors = monitor(page);
  54  |     await ready(page);
  55  |     await createProgram(page);
  56  |     await preserveStoreAndReload(page);
  57  |     await expect(page.getByRole('heading', { name: 'Upper A' })).toBeVisible();
  58  |     await page.getByRole('button', { name: 'Start today’s workout' }).click();
  59  |     await expect(page.getByText('Scheduled workout review')).toBeVisible();
  60  |     await page.getByRole('button', { name: 'Start scheduled workout' }).click();
  61  |     await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
  62  |     await page.getByRole('button', { name: 'Finish workout' }).click();
  63  |     await page.getByRole('button', { name: 'Finish', exact: true }).click();
  64  |     await page.getByRole('button', { name: 'Done' }).click();
  65  |     await expect(page.getByText('Last completed workout').locator('..')).not.toContainText(
  66  |       'Not yet',
  67  |     );
  68  |     const store = await readE2EStore(page);
  69  |     expect(store['program_scheduled_workouts']?.[0]?.['status']).toBe('completed');
  70  |     expect(store['workout_sessions']?.[0]).toMatchObject({
  71  |       origin: 'programmed',
  72  |       counts_for_program: true,
  73  |     });
  74  |     expect(errors).toEqual([]);
  75  |   });
  76  | 
  77  |   test('ad-hoc completion remains in History and cannot mutate or advance the program', async ({
  78  |     page,
  79  |   }) => {
  80  |     await ready(page);
  81  |     await createProgram(page);
  82  |     const before = await readE2EStore(page);
  83  |     const revision = before['programs']?.[0]?.['current_revision'];
  84  |     const schedule = before['program_scheduled_workouts']?.map((row) => ({
  85  |       id: row['id'],
  86  |       status: row['status'],
  87  |       date: row['scheduled_date'],
  88  |     }));
  89  |     await page.getByRole('button', { name: 'Create a workout for today' }).click();
  90  |     await expect(page.getByRole('heading', { name: 'Build your session' })).toBeVisible();
  91  |     await page.getByRole('button', { name: 'Chest', exact: true }).click();
  92  |     await page.getByRole('button', { name: '60', exact: false }).click();
  93  |     await page.getByRole('button', { name: 'Full gym' }).click();
  94  |     await page.getByRole('button', { name: 'Generate workout' }).click();
  95  |     await page.getByRole('button', { name: 'Start workout' }).click();
  96  |     await page.getByRole('button', { name: 'Finish workout' }).click();
  97  |     await page.getByRole('button', { name: 'Finish', exact: true }).click();
  98  |     const after = await readE2EStore(page);
  99  |     expect(after['programs']?.[0]?.['current_revision']).toBe(revision);
  100 |     expect(
  101 |       after['program_scheduled_workouts']?.map((row) => ({
  102 |         id: row['id'],
  103 |         status: row['status'],
  104 |         date: row['scheduled_date'],
  105 |       })),
  106 |     ).toEqual(schedule);
  107 |     expect(after['workout_sessions']?.at(-1)).toMatchObject({
  108 |       origin: 'generated',
  109 |       counts_for_program: false,
  110 |     });
  111 |   });
  112 | 
  113 |   test('reschedules, skips, adapts and restores the immutable base prescription', async ({
  114 |     page,
  115 |   }) => {
  116 |     await ready(page);
  117 |     await createProgram(page);
  118 |     await page.getByRole('button', { name: 'Program', exact: true }).click();
  119 |     await expect(page.getByTestId('program-week-detail')).toContainText('Calibration recommended');
  120 |     const baseText = await page.getByTestId('program-week-detail').innerText();
  121 |     const move = page.getByLabel('Reschedule Upper A').first();
  122 |     await move.fill('2026-08-01');
  123 |     await expect(page.getByTestId('program-week-detail')).toContainText('rescheduled');
  124 |     await page.getByRole('button', { name: 'Skip' }).last().click();
  125 |     await expect(page.getByTestId('program-week-detail')).toContainText('skipped');
  126 |     await page.getByRole('button', { name: 'Add temporary restriction' }).click();
  127 |     await page.getByLabel('Affected region').fill('shoulder');
> 128 |     await page.getByRole('button', { name: 'Save adaptation' }).click();
      |                                                                 ^ Error: locator.click: Test timeout of 60000ms exceeded.
  129 |     await expect(page.getByText('Shoulder', { exact: false }).first()).toBeVisible();
  130 |     await expect(
  131 |       page.getByText('Temporary adaptation applies; base preserved').first(),
  132 |     ).toBeVisible();
  133 |     await page.getByRole('button', { name: 'Remove' }).click();
  134 |     await expect(page.getByText('No active temporary restrictions.')).toBeVisible();
  135 |     expect(await page.getByTestId('program-week-detail').innerText()).toContain(
  136 |       'Dumbbell Bench Press',
  137 |     );
  138 |     expect(baseText).toContain('Dumbbell Bench Press');
  139 |     await page.getByRole('button', { name: 'Edit future program' }).click();
  140 |     await page.getByLabel('Training days').selectOption('3');
  141 |     await page.getByRole('button', { name: 'Save new revision' }).click();
  142 |     await expect(page.getByText('Program · Revision 2')).toBeVisible();
  143 |     const revised = await readE2EStore(page);
  144 |     expect(revised['program_revisions']).toHaveLength(2);
  145 |   });
  146 | 
  147 |   test('program navigation, mobile layout, no errors, and accessibility pass', async ({ page }) => {
  148 |     const errors = monitor(page);
  149 |     await ready(page);
  150 |     await createProgram(page);
  151 |     for (const name of ['Today', 'Program', 'Workout', 'Progress', 'Settings']) {
  152 |       await page.getByRole('button', { name, exact: true }).click();
  153 |       await expectNoOverflow(page);
  154 |     }
  155 |     await page.getByRole('button', { name: 'Today', exact: true }).click();
  156 |     await expectAccessible(page);
  157 |     await page.getByRole('button', { name: 'Program', exact: true }).click();
  158 |     await expectAccessible(page);
  159 |     expect(errors).toEqual([]);
  160 |   });
  161 | });
  162 | 
  163 | test.describe('V1.2 visual snapshots', () => {
  164 |   test('captures no-program, Today, program, week, adaptation, ad-hoc, and scheduled review', async ({
  165 |     page,
  166 |   }, testInfo) => {
  167 |     test.skip(testInfo.project.name !== 'chromium', 'Stable visual baselines are captured once.');
  168 |     await ready(page);
  169 |     await expect(page).toHaveScreenshot('v1-2-no-program-today.png', { fullPage: true });
  170 |     await page.getByRole('button', { name: 'Generate one session' }).click();
  171 |     await expect(page).toHaveScreenshot('v1-2-ad-hoc-entry.png', { fullPage: true });
  172 |     await page.getByRole('button', { name: 'Today', exact: true }).click();
  173 |     await createProgram(page);
  174 |     await expect(page).toHaveScreenshot('v1-2-today-scheduled.png', { fullPage: true });
  175 |     await page.getByRole('button', { name: 'Start today’s workout' }).click();
  176 |     await expect(page).toHaveScreenshot('v1-2-scheduled-review.png', { fullPage: true });
  177 |     await page.getByRole('button', { name: 'Back to Today' }).click();
  178 |     await page.getByRole('button', { name: 'Program', exact: true }).click();
  179 |     await expect(page).toHaveScreenshot('v1-2-program-overview.png', { fullPage: true });
  180 |     await expect(page.getByTestId('program-week-detail')).toHaveScreenshot('v1-2-week-detail.png');
  181 |     await page.getByRole('button', { name: 'Add temporary restriction' }).click();
  182 |     await page.getByRole('button', { name: 'Save adaptation' }).click();
  183 |     await expect(page).toHaveScreenshot('v1-2-discomfort-adaptation.png', { fullPage: true });
  184 |   });
  185 | });
  186 | 
```