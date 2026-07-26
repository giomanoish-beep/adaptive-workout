# Web App Agent Guide

This file applies to `apps/web/`. It adds web-specific rules to the root repository guidance.

## React and TypeScript

- Keep React components typed under strict TypeScript.
- Prefer explicit state machines and typed helper functions over casts or suppression comments.
- Keep domain decisions in packages; UI code should render, collect intent, and call typed gateways.
- Do not use browser storage for workout or fitness data.
- Do not expose Supabase service-role keys or AI provider credentials to the browser.
- Production Supabase access must go through the existing client and server boundaries; never add direct test-only production bypasses.

## E2E contracts and mocks

- E2E route mocks must match current production request and response contracts.
- Repair stale mocks against production contracts instead of weakening production behavior for tests.
- Do not hard-code production component behavior solely to satisfy a snapshot.
- The E2E auth seam is enabled through Playwright config with `VITE_E2E_AUTH=true`; do not use it in production builds.
- When mocked data contains dates, IDs, sorting, timers, locale-sensitive text, or random values, make the fixture deterministic.

## Accessibility, touch, and responsive behavior

- Preserve semantic labels, accessible names, focus behavior, and visible status/error reporting.
- Maintain touch targets large enough for mobile use and avoid overlapping fixed controls.
- Validate both short-page and long-page mobile behavior: short pages should not gain accidental scroll, and long pages must keep important controls reachable.
- Respect fixed navigation, bottom safe areas, and viewport units on iOS-sized devices.
- Do not hide content or reduce accessibility to pass visual tests.

## Playwright projects and commands

Configured projects are `chromium`, `iPhone SE`, `narrow 320px`, and `iPhone 14`.

- All projects: `npm run test:e2e -- --workers=1`
- Desktop Chromium: `npm run test:e2e -- --project=chromium --workers=1`
- iPhone SE: `npm run test:e2e -- --project="iPhone SE" --workers=1`
- Narrow 320px: `npm run test:e2e -- --project="narrow 320px" --workers=1`
- iPhone 14: `npm run test:e2e -- --project="iPhone 14" --workers=1`

Playwright writes HTML reports to `apps/web/playwright-report/` and run artifacts to `apps/web/test-results/`. Remove reports, traces, videos, screenshots, and other generated artifacts before committing unless a task explicitly asks to preserve them.

## Visual regression skill activation

Use `.agents/skills/visual-regression/SKILL.md` whenever a task touches Playwright snapshots, responsive layout, mobile geometry, date-sensitive visual fixtures, route mocks that change rendered data, or CI failures from screenshot comparison.

## Snapshot policy

Codex may update a tracked snapshot autonomously only when all conditions hold:

1. Rendering is deterministic across repeated runs.
2. The difference predates the task or directly follows from approved behavior.
3. No unexpected text, data, control, or content disappears.
4. No clipping, overlap, inaccessible interaction, or hidden focus target appears.
5. The fixture is stable across time, locale, timezone, random values, and sorting.
6. Only the affected snapshots are changed.
7. The new baseline is inspected after writing.
8. A broad unrelated snapshot rewrite is not used.

Stop for a human decision when the intended visual result is ambiguous or would create a new product or UX decision.
