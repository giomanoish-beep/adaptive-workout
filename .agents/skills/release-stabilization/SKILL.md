# Release Stabilization Skill

Use this skill for bounded stabilization work on an existing branch when the goal is to repair a release-blocking defect and carry it through local and remote validation.

## Workflow

1. Read the applicable `AGENTS.md` files and confirm the requested branch, worktree, HEAD, staged files, and unstaged content diff.
2. Identify one bounded stabilization objective. Do not start adjacent stabilization items or speculative refactors.
3. Trace the real production flow before editing: UI, domain package, server orchestration, Supabase boundary, mocks, tests, and CI expectations as relevant.
4. Implement the smallest principled fix. Avoid casts, suppressions, weakened assertions, or test-only production behavior.
5. Add focused regression tests that prove the bug and the intended behavior.
6. Run focused gates first, then the complete mandatory gates required by the task and repository:
   - `npm run typecheck`
   - relevant focused `vitest` or Playwright command
   - `npm run lint`
   - `npm run format:check`
   - `npm test`
   - `npm run build`
   - `npm run edge-fn:build:all` when Edge Functions or bundled packages change
   - `npm run test:e2e-production-guard`
   - Supabase local commands when database behavior changes
7. If a gate fails, diagnose the root cause. Fix only branch-related or formatting-baseline issues, then rerun the failed gate and every subsequent required gate.
8. Clean local artifacts such as Playwright reports, test results, traces, videos, screenshots, temporary worktrees, and tsbuildinfo files unless the task explicitly requires them.
9. Inspect `git status --short`, `git diff --check`, `git diff --stat`, and the actual diff. Exclude secrets, `.env` files, generated reports, unrelated formatting, and LF/CRLF metadata noise.
10. Create logical commits only after staged diffs have been inspected with `git diff --cached --check`, `git diff --cached --stat`, and `git diff --cached`.
11. Push normally to the task branch. Never force-push unless the user explicitly approves that exact action.
12. Create or update a draft PR when requested, then monitor available GitHub Actions, Vercel, and required PR checks.
13. For CI failures, inspect exact logs, classify the cause, repair only task-related defects, rerun relevant local gates, commit the correction, push normally, and monitor the rerun.
14. Stop only for a documented human gate.
15. Never merge or deploy without explicit approval.

## Failure recovery

- Treat routine deterministic test failures as engineering work, not a reason to stop.
- Repair stale mocks when the production contract is clear.
- Make fixtures deterministic when current time, timezone, locale, random IDs, timers, or unstable sorting cause drift.
- Do not use `|| true`, `continue-on-error`, disabled tests, weakened assertions, broad snapshot rewrites, or TypeScript/lint suppressions to bypass failures.
- Stop and report when a fix requires a product decision, secret, paid service, broader permission, destructive action, remote database mutation, production deployment, PR merge, or force-push.
