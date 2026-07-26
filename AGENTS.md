# Adaptive Workout Agent Guide

This repository builds Adaptive Workout, a TypeScript fitness-planning app with a mobile-first React web UI, pure domain engines, Supabase persistence, and server-side AI access through explicit provider interfaces.

## Instruction precedence

1. System, developer, and user instructions always apply first.
2. This root `AGENTS.md` applies to the whole repository.
3. Nested `AGENTS.md` files add stricter local rules for their subtree:
   - `apps/web/AGENTS.md` for the React app and Playwright E2E tests.
   - `supabase/AGENTS.md` for migrations, RLS, pgTAP, and Edge Functions.
4. Use relevant repository skills in `.agents/skills/*/SKILL.md` when their workflow matches the task.
5. When instructions conflict, follow the stricter safe rule and report the conflict if it blocks progress.

## Architecture map

- `apps/web/` - Vite React app, auth shell, mobile UI, route mocks, Playwright tests, and tracked visual baselines.
- `packages/domain/` - shared branded IDs, contracts, validation, and catalog domain types.
- `packages/workout-engine/` - deterministic workout selection, duration fitting, substitutions, and decision evidence.
- `packages/progression-engine/` - deterministic progression and deload rules.
- `packages/pain-safety/` - non-diagnostic discomfort rules and constraints.
- `packages/ai/` - provider abstraction and structured AI task contracts.
- `packages/workout-gen-orchestrator/` - server-side orchestration across domain packages.
- `supabase/` - local Supabase config, migrations, pgTAP tests, and generated Edge Function bundles.
- `scripts/` - catalog, Edge Function bundling, PWA, and guard scripts.
- `docs/` - implementation plan, engine documentation, verification reports, and detailed agent autonomy policy.

## Deeper guidance

- Agent autonomy source of truth: `docs/AGENT_AUTONOMY.md`.
- Web and visual testing rules: `apps/web/AGENTS.md`.
- Database and Edge Function rules: `supabase/AGENTS.md`.
- Stabilization workflow: `.agents/skills/release-stabilization/SKILL.md`.
- Visual regression workflow: `.agents/skills/visual-regression/SKILL.md`.
- CI recovery workflow: `.agents/skills/ci-recovery/SKILL.md`.
- Implementation status: `docs/IMPLEMENTATION_PLAN.md`.
- Workout engine behavior: `docs/WORKOUT_ENGINE.md`.

## Engineering rules

- Keep TypeScript in strict mode.
- Keep domain logic framework-independent.
- Make deterministic engines pure where practical.
- Never diagnose medical conditions or imply a diagnosis.
- Never persist workout or fitness data in browser storage.
- Access AI providers only through the `AIProvider` interface.
- Never expose AI provider or Supabase service-role keys to the browser.
- Apply database changes only through versioned migrations.
- Add tests for domain rules and bug fixes.
- Avoid unrelated refactors.
- Prefer simple code over speculative abstraction.
- Update `docs/IMPLEMENTATION_PLAN.md` after completing a task unless the user's explicit file scope forbids it.

## Verified standard commands

- Install: `npm ci`
- TypeScript: `npm run typecheck`
- Lint: `npm run lint`
- Format check: `npm run format:check`
- Unit tests: `npm test`
- Build: `npm run build`
- Catalog check: `npm run catalog:check`
- Edge bundles: `npm run edge-fn:build:all`
- Production E2E guard: `npm run test:e2e-production-guard`
- All Playwright projects: `npm run test:e2e -- --workers=1`
- Desktop Playwright: `npm run test:e2e -- --project=chromium --workers=1`
- iPhone SE Playwright: `npm run test:e2e -- --project="iPhone SE" --workers=1`
- iPhone 14 Playwright: `npm run test:e2e -- --project="iPhone 14" --workers=1`
- Narrow mobile Playwright: `npm run test:e2e -- --project="narrow 320px" --workers=1`
- Local Supabase start: `npx supabase start`
- Local database reset: `npx supabase db reset --local`
- Database lint: `npx supabase db lint --local --level warning --fail-on warning`
- pgTAP tests: `npx supabase test db`
- Migration list: `npx supabase migration list --local`

## Definition of done

- The task's real production flow is understood before editing.
- The fix is the smallest principled change within the requested scope.
- Domain rules and bug fixes have focused regression tests.
- Relevant local gates pass, followed by mandatory repository gates when the task requires them.
- Generated reports, traces, screenshots, videos, and temporary worktrees are removed unless explicitly requested.
- `git diff --check`, status, stat, and actual diff are inspected before commit.
- Secrets, `.env` files, generated reports, and unrelated line-ending-only noise are not staged.
- Commits are logical, reviewable, and never hide unrelated refactors.

## Scope discipline

- Do not start adjacent stabilization items or opportunistic refactors.
- Do not weaken production behavior, tests, TypeScript, lint, or CI guards to make a task pass.
- Deterministic tests must control time, timezone, locale, randomness, sorting, and mocked contracts when those affect output.
- Mocks must match current production contracts; stale mocks should be repaired as task-related defects.
- Treat GitHub Actions database validation as authoritative when local Docker or Supabase cannot run.

## Git and branch rules

- Work on a non-protected task branch unless explicitly instructed otherwise.
- Keep `main` protected: do not push directly to `main`.
- Use normal pushes only; never force-push without explicit approval.
- Do not merge PRs, deploy production, create tags, or delete ambiguous remote branches without human approval.
- Commit only inspected, intentional files. Exclude LF/CRLF metadata noise.
- Draft PRs are allowed for task branches; merging is a human gate.

## Autonomy policy

Codex may independently read and edit files on task branches, run repository quality commands, investigate failures, fix direct task defects, make fixtures deterministic, update legitimate deterministic snapshots through the visual regression skill, clean local artifacts, create logical commits, push normal task branches, open or update draft PRs, inspect CI logs, and repair task-related CI failures.

## Human gates

Ask before product or UX choices with multiple valid answers, significant production dependencies, paid external services, secrets, broader permissions, destructive migrations, production-data transformations, remote Supabase changes, production deployment, PR merge, force-push, direct `main` push, or ambiguous remote-branch deletion. Routine deterministic test failures are not human gates.
