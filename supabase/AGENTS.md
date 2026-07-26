# Supabase Agent Guide

This file applies to `supabase/`. It adds database and Edge Function rules to the root repository guidance.

## Schema and migrations

- All schema changes require versioned forward migrations in `supabase/migrations/`.
- Local reset must be able to apply every migration from zero with `npx supabase db reset --local`.
- Do not edit historical migrations casually. If a migration repair is required, document the reason and ask before destructive or remote changes.
- Existing rows, audit history, and generated identifiers must remain valid after migration.
- Review RLS, grants, ownership, and trigger behavior for every schema change.
- Add or update pgTAP tests for database policy and constraint changes.

## Local validation

- Start local Supabase: `npx supabase start`
- Reset from all migrations: `npx supabase db reset --local`
- Lint database: `npx supabase db lint --local --level warning --fail-on warning`
- Run pgTAP: `npx supabase test db`
- List migrations: `npx supabase migration list --local`

Database lint and pgTAP are mandatory for database work. When Docker or local Supabase cannot run on the developer machine, GitHub Actions database validation is authoritative and must be monitored.

## Edge Functions

- Raw `index.ts` functions may import workspace packages.
- Generated `index.bundle.ts` files are the configured deploy entrypoints in `supabase/config.toml`.
- Rebuild bundles with `npm run edge-fn:build:all` when Edge Function source or bundled dependencies change.
- Inspect generated bundle diffs for secrets, unintended config changes, and unrelated code before committing.
- Do not deploy Edge Functions without explicit approval.

## Remote-resource safety

- Never use production credentials in local validation or PR checks.
- Never commit `.env` files, Supabase service-role keys, provider keys, JWTs, or database connection strings.
- Remote `supabase db push`, remote migration repair, production-data transformations, destructive SQL, and any remote database mutation require explicit human approval.
- Do not reset, seed, or alter a remote database as part of routine validation.
