# Visual Regression Skill

Use this skill for Playwright screenshot failures, visual snapshot updates, mobile geometry changes, date-sensitive baselines, and rendered-data changes caused by route mocks.

## Required analysis

1. Identify the exact failing spec, project, viewport/device, snapshot path, and command that produced the artifact.
2. Compare expected, actual, and diff images. Record dimensions, changed pixels, changed-pixel ratio, and the diff bounding box when available.
3. Inspect visible text, data values, controls, labels, spacing, clipping, focus/interaction state, and accessible affordances.
4. Classify the difference:
   - stale baseline from already-approved behavior;
   - intended visual change from the current task;
   - real regression;
   - unstable fixture.
5. When causal origin is ambiguous, compare against a clean worktree or base branch before updating any snapshot.

## Determinism first

- Freeze time, timezone, locale, randomness, timers, generated IDs, and sorting when they affect rendered output.
- Prefer Playwright clock support, existing E2E seams, or deterministic mocked application state over production-component date hacks.
- Avoid midnight instants that shift dates across time zones.
- Run the affected visual test twice when fixing determinism and confirm the result is pixel-identical before accepting a baseline.

## Snapshot update policy

Codex may update an affected tracked snapshot autonomously only when:

1. the rendered output is deterministic across repeated runs;
2. the difference predates the task or directly follows from approved behavior;
3. no unexpected content, data, control, label, or interaction state disappears;
4. no clipping, overlap, inaccessible control, or hidden focus target appears;
5. the fixture is stable;
6. only affected snapshots are updated;
7. the new baseline is inspected after writing; and
8. no blanket or broad unrelated snapshot rewrite is used.

Continue automatically through subsequent legitimate stale snapshots that meet the same criteria. Stop for a human decision when the intended visual result is ambiguous, a product or UX choice is required, content unexpectedly disappears, or an accessibility or clipping regression appears.

## Cleanup and validation

- Remove `apps/web/playwright-report/`, `apps/web/test-results/`, traces, videos, screenshots, and temporary comparison worktrees when they are no longer needed.
- Confirm no generated artifact is staged unless explicitly approved.
- Rerun the focused failing project first, then required broader Playwright and repository gates from the task.
- Never update snapshots merely because a command offered `--update-snapshots`.
