# Agent Autonomy Policy

This document is the detailed source of truth for how Codex should work in this repository. The root `AGENTS.md` summarizes the policy; this file explains how to apply it during implementation, validation, commits, PRs, visual regression work, and CI recovery.

## Goals

- Let routine engineering work continue without repeated approval prompts.
- Keep changes bounded, reviewable, deterministic, and covered by the right tests.
- Protect product decisions, secrets, production data, remote resources, and protected Git history.
- Make local and remote validation results reproducible and auditable.

## Main coding agent responsibilities

- Read applicable `AGENTS.md` files before editing.
- Confirm branch, HEAD, staged state, and existing diff before starting scoped work.
- Understand the real production flow before applying a fix.
- Choose the smallest principled implementation that satisfies the task.
- Add or update focused tests for domain rules and bug fixes.
- Run focused gates before broad gates when that shortens feedback.
- Keep generated artifacts, secrets, and unrelated files out of commits.
- Commit logical changes only after inspecting staged diffs.
- Push normally to task branches and monitor draft PR checks when requested.
- Stop only when a documented human gate is reached.

## Allowed autonomous operations

Codex may perform these actions without asking when they are within a non-protected task branch and the user's stated scope:

- read, create, edit, and delete task-related files;
- create and remove temporary worktrees;
- run repository-local validation commands and diagnostics;
- investigate failures and inspect local logs/artifacts;
- fix direct task-related defects;
- repair stale test mocks against current production contracts;
- make test data deterministic for time, timezone, locale, randomness, sorting, IDs, and timers;
- update legitimate deterministic visual snapshots under the visual-regression policy;
- remove generated local artifacts such as reports, traces, videos, screenshots, and test results;
- create logical commits;
- push normally to a non-protected task branch;
- create or update a draft PR;
- inspect GitHub Actions, Vercel, and required PR check logs;
- repair task-related CI failures and monitor reruns.

Routine deterministic test failures are not human gates. The agent should diagnose and fix them when the intended behavior is clear.

## Mandatory human gates

Ask before:

- product or UX decisions with more than one reasonable answer;
- adding a significant production dependency;
- using a paid external service;
- requesting, exposing, or rotating secrets;
- broadening application, database, CI, cloud, or repository permissions;
- destructive migrations or data deletion;
- production-data transformations;
- remote Supabase database changes, including `supabase db push`;
- production deployment or Edge Function deployment;
- merging a PR;
- force-pushing;
- pushing directly to `main`;
- deleting a remote branch when its purpose is ambiguous.

## Visual-regression decision table

| Situation                                                | Autonomous action                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Stale baseline from approved behavior and deterministic  | Update only affected snapshot after inspecting expected, actual, diff. |
| Intended task change with deterministic rendering        | Update only affected snapshot and record the visible difference.       |
| Date, locale, timezone, random, timer, or sorting drift  | Fix the fixture first; keep production behavior unchanged.             |
| Unexpected missing content, clipping, or inaccessible UI | Stop or fix the branch regression if the intended behavior is obvious. |
| Product result is visually ambiguous                     | Stop for human decision.                                               |
| Broad snapshot mismatch without inspection               | Do not approve; narrow to exact failing snapshots and inspect first.   |

When fixing determinism, use Playwright clock support, existing E2E seams, or deterministic mocked application state. Avoid midnight timestamps that can shift dates across time zones. Run the affected visual test twice when stability was the problem.

## CI-recovery decision table

| Failure class                                 | Autonomous action                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Branch code or test defect                    | Fix the defect, rerun relevant gates, commit, push, monitor rerun.     |
| Stale mock or fixture                         | Align the mock with production contract or make fixture deterministic. |
| Migration/RLS/pgTAP regression                | Fix migration or policy in scope; rerun Supabase validation.           |
| Flaky deterministic test                      | Remove nondeterminism; do not loosen assertions.                       |
| External platform outage                      | Rerun or report if no branch correction is possible.                   |
| Permission, secret, or remote mutation needed | Stop for human approval.                                               |

Never recover CI by adding `|| true`, `continue-on-error`, skipped tests, weakened assertions, weaker lint/TypeScript settings, or bypassed required checks.

## Git lifecycle

1. Start from the requested branch or create the requested task branch.
2. Confirm no staged files and understand any existing unstaged changes before editing.
3. Keep unrelated LF/CRLF status noise out of commits.
4. Stage exact intended files only.
5. Inspect `git diff --cached --check`, `git diff --cached --stat`, and `git diff --cached`.
6. Commit with a concise message matching the logical change.
7. Push normally to the task branch.
8. Open or update a draft PR when requested.
9. Monitor checks, fix branch-related failures, and push corrective commits.
10. Do not merge, force-push, deploy, tag, or delete ambiguous remote branches without approval.

## Definition of done

- The implementation matches the requested scope.
- Tests prove the changed behavior or documented policy.
- Required local gates pass, or a blocker is documented with exact evidence.
- Remote required checks pass when PR monitoring is in scope.
- Generated artifacts are removed or explicitly excluded.
- No secrets, `.env` files, reports, traces, videos, screenshots, tsbuildinfo files, or unrelated formatting changes are staged.
- Final status reports branch, commits, validation results, PR/check state, and remaining blockers.

## Artifact handling

- Playwright reports live under `apps/web/playwright-report/`.
- Playwright run artifacts live under `apps/web/test-results/`.
- Remove generated reports, traces, videos, screenshots, temporary comparison worktrees, coverage output, and tsbuildinfo files before finalizing unless the task explicitly asks to keep them.
- If a tracked generated file changes because a repository script intentionally rewrites it, inspect and stage it only when it is in scope.

## Secret handling

- Do not read or request secrets unless the user explicitly authorizes it.
- Never commit `.env`, `.env.*`, provider keys, Supabase service-role keys, JWTs, database connection strings, or private credentials.
- Do not paste secrets into logs, PR bodies, comments, or final reports.
- Browser code must never receive AI provider keys or Supabase service-role keys.

## Remote-resource policy

- Normal Git branch pushes and draft PR creation are allowed for task branches.
- Reading GitHub Actions logs and Vercel check results is allowed during PR monitoring.
- Remote Supabase database mutations, production deployments, Edge Function deployments, paid services, permission changes, and production-data operations require explicit human approval.
- Local Supabase validation is allowed. If local Docker/Supabase is unavailable, use GitHub Actions database validation as the authoritative check.

## Acceptable autonomous decisions

- Repair an E2E route mock that sends an obsolete field shape after production code moved to a new typed contract.
- Freeze an E2E date fixture at a midday UTC instant so snapshots stop drifting by calendar date.
- Update one inspected deterministic snapshot when the only visible change is an already-approved data value.
- Remove local Playwright reports and test-results artifacts before staging.
- Commit and push a branch-scoped CI fix after local relevant gates pass.

## Decisions requiring approval

- Choosing between two plausible UX layouts.
- Adding a new production dependency or paid service.
- Requesting production Supabase credentials.
- Running `supabase db push` against a remote project.
- Destructively rewriting migrations after they may have been applied remotely.
- Force-pushing or merging a PR.
- Deploying production or Edge Functions.
- Deleting a remote branch whose purpose is unclear.

## Future task prompt template

Use the release-stabilization skill to complete `<objective>`.
Work until all local and remote required checks pass.
Commit and push to the existing draft PR.
Do not interrupt me unless a documented human gate is reached.
Do not merge or deploy.
