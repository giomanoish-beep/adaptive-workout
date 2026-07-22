# Deployment

**Task:** DEPLOY-001 | **Status:** DONE | **Date:** 2026-07-16

## Architecture

| Layer                   | Provider                   | Scope                      |
| ----------------------- | -------------------------- | -------------------------- |
| Frontend (Vite + React) | Vercel                     | Static SPA hosting         |
| Database (PostgreSQL)   | Supabase                   | Authoritative data + RLS   |
| Authentication          | Supabase Auth              | Email magic-link OTP       |
| Serverless functions    | Supabase Edge Functions    | Trusted compute, AI calls  |
| Secrets                 | Supabase + Vercel env vars | Server-only, never browser |

## Prerequisites

- Node.js 22+ (LTS)
- npm 10+
- [Supabase CLI](https://supabase.com/docs/guides/cli) 2.x (`npx supabase --version`)
- [Vercel CLI](https://vercel.com/docs/cli) (optional, for manual deploys)
- A Supabase project (dashboard.supabase.com)
- A Vercel account linked to the repository (vercel.com)

## Environment Variable Inventory

### Browser (Vite build-time injection)

| Variable                 | Required | Consuming Component                                                                          | Notes                                 |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| `VITE_SUPABASE_URL`      | Yes      | `apps/web/src/auth/supabase-client.ts`, `apps/web/src/workout/workout-generation-gateway.ts` | Supabase project URL                  |
| `VITE_SUPABASE_ANON_KEY` | Yes      | `apps/web/src/auth/supabase-client.ts`                                                       | Supabase anonymous key (browser-safe) |

Set these in Vercel project settings (Environment Variables), not in `vercel.json`.

### Server/Function Secrets

| Variable                    | Required | Consuming Function(s)            | Notes                                               |
| --------------------------- | -------- | -------------------------------- | --------------------------------------------------- |
| `SUPABASE_URL`              | Yes      | Both Edge Functions              | Supabase project URL (function-side)                |
| `SUPABASE_ANON_KEY`         | Yes      | Both Edge Functions              | Auth verification and user-scoped reads             |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes      | `refresh-progression` only       | Derived-state writes scoped to the verified user ID |
| `ZAI_API_KEY`               | No       | Only if AI generation is enabled | NOT currently consumed                              |
| `DEEPSEEK_API_KEY`          | No       | Only if AI generation is enabled | NOT currently consumed                              |

Set function secrets via Supabase Dashboard or CLI:

```bash
npx supabase secrets set SUPABASE_URL=<value> SUPABASE_ANON_KEY=<value>
```

**No `VITE_`-prefixed variable may appear in function secrets.**

## Vercel Setup

### Configuration

A `vercel.json` is already present at the repository root:

| Setting          | Value                                             |
| ---------------- | ------------------------------------------------- |
| Framework        | None (Vite SPA)                                   |
| Install command  | `npm ci`                                          |
| Build command    | `npm run build --workspace @adaptive-workout/web` |
| Output directory | `apps/web/dist`                                   |
| Node.js version  | 22.x (set in Vercel project settings)             |

### SPA Routing

The config includes a single rewrite rule: any route not matching `/assets/*` falls back to `/index.html` for client-side navigation. This handles direct-reload and deep-link scenarios.

### Security Headers

All responses receive:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy`: camera, microphone, geolocation, payment, usb, bluetooth, accelerometer, gyroscope, magnetometer all disabled
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

Asset files (`/assets/*`) receive `Cache-Control: public, max-age=31536000, immutable`.

### CSP

A Content-Security-Policy is **not** set in `vercel.json` headers due to the dynamic nature of Supabase Auth magic links (which redirect through Supabase domains). To add CSP, test with a report-only header first and ensure:

- `connect-src`: Supabase project URL + `https://*.supabase.co`
- `script-src 'self'`
- `style-src 'self' 'unsafe-inline'`
- `frame-ancestors 'none'`

### Deploy

```bash
# Link to Vercel project (first time)
npx vercel link

# Set environment variables (Vercel Dashboard or CLI)
# VITE_SUPABASE_URL
# VITE_SUPABASE_ANON_KEY

# Deploy production
npx vercel --prod
```

Vercel Git integration will auto-deploy from the configured production branch if enabled.

## Supabase Project Linking

```bash
# Requires: authenticated Supabase CLI session
# Step 1: Log in
npx supabase login

# Step 2: Link local repo to existing Supabase project
# Use project REFERENCE (not URL), e.g. abcdefghijklmnopqrst
npx supabase link --project-ref <PROJECT_REF>

# Step 3: Inspect migration status
npx supabase db diff --linked

# Step 4: Review pending migrations before pushing
npx supabase migration list
```

## Database Migrations

### Pre-deployment Checklist

Before pushing migrations to production:

1. `npx supabase migration list` — verify all migrations are numbered sequentially
2. `npx supabase db diff --linked` — review changes against remote
3. Do NOT push if any migation drops tables or columns containing production data
4. All migrations are forward-only; there is no automated rollback

### Apply Migrations

```bash
# Push pending migrations (safe — only creates/adds, no resets)
npx supabase db push

# Alternatively, if linking is configured:
npx supabase migration up
```

### Migration Inventory

| Migration File                                                 | Purpose                                                |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| `20260714105900_database_baseline.sql`                         | Core schema                                            |
| `20260714110435_create_profiles_and_exercise_taxonomy.sql`     | Profiles + exercise catalog                            |
| `20260714111319_create_programs_and_workout_templates.sql`     | Programs                                               |
| `20260714112146_create_workout_history.sql`                    | Sessions/sets                                          |
| `20260714112815_create_performance_and_muscle_state.sql`       | Performance state                                      |
| `20260714113406_create_pain_preferences_and_audits.sql`        | Pain, preferences, audits                              |
| `20260714114141_add_rls_policies_and_policy_tests.sql`         | RLS on all 22 tables                                   |
| `20260714121000_seed_initial_exercise_catalog.sql`             | Seed exercise data                                     |
| `20260714121550_add_exercise_catalog_search_and_filters.sql`   | Catalog indexes                                        |
| `20260716120000_add_cloud_session_persistence.sql`             | Cloud session persistence                              |
| `20260716200000_add_training_profile_fields.sql`               | Persist completed onboarding profiles                  |
| `20260716210000_add_progression_insufficient_data_support.sql` | Persist explicit insufficient-data progression state   |
| `20260719120000_add_multi_week_programs.sql`                   | Multi-week programs, adaptations, and revision history |

## Edge Function Deployment

### Function Inventory

| Function              | Directory                                 | Auth         | Purpose                                           |
| --------------------- | ----------------------------------------- | ------------ | ------------------------------------------------- |
| `generate-workout`    | `supabase/functions/generate-workout/`    | JWT-verified | Deterministic workout generation                  |
| `refresh-progression` | `supabase/functions/refresh-progression/` | JWT-verified | Recalculate and persist derived progression state |
| `generate-program`    | `supabase/functions/generate-program/`    | JWT-verified | Deterministic multi-week program generation       |

### Deployment Prerequisite: Bundling

The `generate-workout` function imports internal workspace packages (`@adaptive-workout/workout-gen-orchestrator`, `@adaptive-workout/observability`) via relative paths. The Supabase/Deno runtime cannot resolve monorepo imports outside the function directory.

**Solution:** Bundle the function into a single self-contained file before deployment. `esbuild` is declared as a root devDependency, so it is installed by `npm ci` — no separate install step is required.

```bash
# Bundle the function (uses esbuild; declared in root devDependencies)
npm run edge-fn:build:all
```

This produces `supabase/functions/generate-workout/index.bundle.ts` — a single-file Deno-compatible output that inlines all workspace dependencies while preserving external `https://` imports for Deno's native modules. The raw `index.ts` must never be deployed; only `index.bundle.ts` is a valid entrypoint.

The generated bundle is committed-at-build-time and is **not** checked into version control. It must be regenerated before every deploy. `index.bundle.ts` is the only file the Supabase CLI bundles for this function.

### Entrypoint and JWT configuration

The deploy entrypoint and JWT behavior are declared in `supabase/config.toml`, so the bare deploy command needs no flags:

```toml
[functions.generate-workout]
entrypoint = "functions/generate-workout/index.bundle.ts"
verify_jwt = false
```

**Reason for `verify_jwt = false`:** The `generate-workout` handler performs its own token verification via `authClient.auth.getUser(token)` and returns controlled error responses. This is intentional so the function can distinguish between UNAUTHENTICATED, INVALID_REQUEST, and GENERATION_FAILED in its response codes instead of receiving the gateway's default rejection.

### Deploy

```bash
# 1. Bundle (regenerates index.bundle.ts from the workspace sources)
npm run edge-fn:build:all

# 2. Deploy — config.toml supplies the entrypoint and verify_jwt setting
npx supabase functions deploy generate-workout
npx supabase functions deploy refresh-progression

# 3. Verify the deployment is ACTIVE
npx supabase functions list
```

The deploy output should report `Uploading asset (generate-workout): supabase/functions/generate-workout/index.bundle.ts`, confirming the bundled entrypoint (not the raw `index.ts`) was uploaded.

## Function Secrets

After deployment, set required secrets via Supabase CLI:

```bash
npx supabase secrets set \
  SUPABASE_URL=<your-project-url> \
  SUPABASE_ANON_KEY=<your-anon-key> \
  SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

`SUPABASE_SERVICE_ROLE_KEY` is consumed only by `refresh-progression`. It must
never be configured in Vercel or exposed through a `VITE_` variable.

Secrets can also be managed via Supabase Dashboard > Functions > manage secrets.

**Never print or echo secret values in shell history.**

## Auth Site URL / Redirect Configuration

After the Vercel production URL is known, configure Supabase Auth:

1. Go to Supabase Dashboard > Authentication > URL Configuration
2. Set **Site URL**: `https://<your-app>.vercel.app`
3. Add **Redirect URLs**:
   - `https://<your-app>.vercel.app` (exact match)
   - `https://<your-app>.vercel.app` (exact production URL)
   - `http://localhost:5173/**` (local development)
   - `https://*-<team>.vercel.app` (preview deployments, optional)

### Magic-Link Redirect Design

The app calls `client.auth.signInWithOtp({ email })` without an explicit `emailRedirectTo` parameter. Supabase Auth uses the configured **Site URL** as the default redirect destination. This is sufficient because:

1. The production Site URL is the single correct destination
2. The app has no concept of deep-linking to specific pages from magic links
3. The session is restored via `onAuthStateChange` + `detectSessionInUrl: true`

No arbitrary redirect query parameter is trusted or forwarded.

## Production Smoke Checklist

After deploying both Vercel and Supabase:

### Automated / Observable Checks

- [ ] Production URL loads over HTTPS
- [ ] No horizontal overflow at 375px width (mobile)
- [ ] No browser console errors on initial load
- [ ] No `VITE_E2E_AUTH` or service-role keys in browser network/source
- [ ] Security headers present: nosniff, Referrer-Policy, X-Frame-Options

### Magic-Link Auth (Manual)

- [ ] Enter email, click "Continue with email"
- [ ] "Check your email" message appears
- [ ] Magic-link email received (check inbox)
- [ ] Clicking the link opens the production URL (not localhost)
- [ ] Authenticated session established (onboarding appears)

### Core Flow

- [ ] Onboarding can be completed
- [ ] Onboarding survives page reload (auth session restored)
- [ ] Workout generation calls the deployed Edge Function (check Network tab)
- [ ] Generated workout starts and creates a persisted session
- [ ] One set can be logged and survives reload
- [ ] Finishing a partial workout persists correctly
- [ ] History shows the real workout (no fixture data)
- [ ] Settings goal update survives reload
- [ ] Sign-out returns to Sign in screen

### RLS / Isolation

- [ ] Sign in as User A, create a workout
- [ ] Sign out, sign in as User B
- [ ] User B cannot see User A's workout/history

## Rollback Procedure

### Vercel (Frontend)

```bash
# List deployments
npx vercel list

# Rollback to previous deployment
npx vercel rollback
```

Or use Vercel Dashboard > Deployments > select deployment > Promote/Rollback.

### Edge Functions

```bash
# Deploy a specific version (re-deploy from known-good commit)
git checkout <known-good-commit>
npm run edge-fn:build:all
npx supabase functions deploy generate-workout
npx supabase functions deploy refresh-progression
```

### Database Migrations

**Migrations are forward-only.** There is no automated rollback. If a migration causes an issue:

1. **Do NOT** run `supabase db reset` on the production database
2. Create a new forward-only **compensating migration** that undoes the problematic change
3. Push the compensating migration via `npx supabase db push`
4. Document the migration chain clearly

```sql
-- Example compensating migration: 20260717XXXXXX_fix_column_type.sql
-- This reverts the unintended change from migation 20260716XXXXXX
ALTER TABLE ... ALTER COLUMN ...;
```

**Never run destructive manual SQL without a verified backup and peer review.**

## CI/CD

### Existing: FOUNDATION-002 GitHub Actions

The repository already has a CI workflow (`.github/workflows/ci.yml`) that runs on pull requests:

- Install / dependency check
- Typecheck
- Unit tests (vitest)
- Production build
- E2E tests (Playwright)

### Production Deployment

- **Vercel**: Git integration deploys from the production branch. Configure in Vercel Dashboard > Git.
- **Supabase migrations/functions**: Require manual or protected-branch workflow triggers. Do NOT auto-deploy from untrusted pull requests.

### Recommended Production Workflow

Create a `.github/workflows/deploy.yml`:

```yaml
name: Production Deploy
on:
  push:
    branches: [main]
  workflow_dispatch: # manual trigger

jobs:
  deploy-functions:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm' }
      - run: npm ci
      - run: npm run edge-fn:build:all
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: npx supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
      - run: npx supabase functions deploy generate-workout
      - run: npx supabase functions deploy refresh-progression
```

**Do not place production Supabase access tokens in repository files.** Use GitHub Actions secrets (e.g., `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`).

## Known Limitations

1. **Edge Function Monorepo Imports**: Workspace packages must be bundled before deployment. The raw `index.ts` files cannot be deployed directly. `npm run edge-fn:build:all` produces each function's `index.bundle.ts`, which `supabase/config.toml` declares as the deploy entrypoint. See the bundling section above.
2. **No AI Provider Connection**: The `ZAI_API_KEY` and `DEEPSEEK_API_KEY` secrets are not consumed by any deployed function. AI features will require additional Edge Functions.
3. **No Account Deletion UI**: Implemented only as a Supabase Auth action, not as an in-app feature.
4. **No Data Export**: Not implemented.
5. **AI Interaction Retention**: The recommended 30-day cleanup is not enforced — see `docs/SECURITY_AND_RETENTION.md`.
6. **CSP**: Not enforced in production headers — start with report-only when ready.

## iPhone PWA installation

This project is installed from Safari as a PWA; it is not an App Store build.

1. Open the production HTTPS URL in Safari on iPhone.
2. Use **Share > Add to Home Screen** and confirm the Adaptive Workout icon.
3. Launch from the Home Screen icon and confirm standalone display without Safari chrome.
4. Sign in, close the PWA, reopen it, and confirm the Supabase session is restored.
5. During an active workout, close/reopen or reload and confirm the cloud session resumes.
6. Verify Progress and Settings remain usable and no horizontal overflow appears.

The manifest, Apple touch icon, safe-area viewport metadata, and four PNG PWA
icons must all return HTTP 200 from the production origin before this checklist
is attempted.

## Preview vs Production

| Aspect           | Preview (Vercel)               | Production                       |
| ---------------- | ------------------------------ | -------------------------------- |
| Supabase project | Same                           | Same                             |
| Database         | Same (shared)                  | Same (shared)                    |
| Edge Functions   | Same deployment                | Same deployment                  |
| Auth redirects   | Allow `*-<team>.vercel.app`    | Exact production URL             |
| Environment      | `VITE_E2E_AUTH` can be enabled | `VITE_E2E_AUTH` MUST be disabled |
