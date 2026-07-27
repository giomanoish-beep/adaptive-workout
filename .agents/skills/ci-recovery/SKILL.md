# CI Recovery Skill

Use this skill when a GitHub Actions, Vercel, or required PR check fails for a task branch.

## Workflow

1. Identify the exact failing check, job, step, commit SHA, and rerun attempt.
2. Read logs and artifacts through the GitHub connector, `gh`, or the provider UI when available.
3. Classify the failure as code, fixture, environment, migration, flaky test, dependency/platform issue, or external service issue.
4. Determine whether the cause is branch-related. Do not modify unrelated code to mask unrelated infrastructure failures.
5. Fix only the task-related cause. Keep production behavior, tests, lint, TypeScript, database policy, and production guards strong.
6. Rerun the relevant local gates. If the fix touches shared behavior, rerun the full mandatory gate sequence for the task.
7. Inspect the diff and create a logical corrective commit.
8. Push normally to the same task branch.
9. Monitor the rerun until required checks pass or a documented human gate is reached.

## Prohibited recovery tactics

- Do not use `|| true`, `continue-on-error`, skipped tests, weaker assertions, or looser lint/TypeScript rules.
- Do not bypass, ignore, or mark a required check as acceptable when it failed.
- Do not force-push, merge, deploy, mutate remote Supabase, or request secrets without explicit approval.

## Stop conditions

Stop and report before proceeding when recovery needs platform permissions, secrets, paid services, destructive actions, remote database changes, production deployment, a force-push, a merge, or a genuine product/UX decision.
