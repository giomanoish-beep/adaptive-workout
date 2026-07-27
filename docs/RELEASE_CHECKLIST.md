# Adaptive Workout V1 Release Candidate Checklist

**Task:** STAB-005
**Purpose:** Prepare V1 as a release candidate without deploying it.
**Status:** Automated checks can pass locally and in CI; production deployment and
iPhone installation remain manual human gates.

This checklist separates deterministic repository checks from actions that need
secrets, production configuration, remote Supabase access, physical iPhone
verification, or deployment approval.

## Automated release-readiness checks

Run these before requesting the manual deployment step:

1. `npm run release:check`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run format:check`
5. `npm test`
6. `npm run catalog:check`
7. `npm run build`
8. `npm run edge-fn:build:all`
9. `npm run test:e2e-production-guard`
10. `npx supabase start`
11. `npx supabase db reset --local`
12. `npx supabase db lint --local --level warning --fail-on warning`
13. `npx supabase test db`
14. `npx supabase migration list --local`

GitHub Actions must also pass for the release-candidate PR:

- quality job;
- database job;
- Vercel preview/build checks, when available.

## Manual human gates

STAB-005 does not perform the following actions. They require explicit human
approval and are listed in detail below:

- production deployment;
- remote Supabase migration or data changes;
- Edge Function deployment;
- production secret or environment-variable changes;
- production OTP provider/Auth URL configuration;
- production DeepSeek secret verification;
- physical iPhone PWA installation verification;
- PR merge.

## What `npm run release:check` verifies

The release readiness guard is deterministic and does not read production
secrets. It verifies:

- root package scripts required for release validation exist;
- PWA manifest fields are present and stable;
- the four PNG PWA icons exist and have the expected dimensions;
- `apps/web/index.html` contains viewport, manifest, theme-color, and iPhone
  Add-to-Home-Screen metadata;
- `vercel.json` uses the expected install/build/output configuration, SPA
  fallback, and security headers;
- the numeric email OTP flow requests Supabase email codes, verifies
  `type: 'email'`, and relies on Supabase session restoration;
- the production E2E auth seam guard rejects `VITE_E2E_AUTH=true` production
  builds;
- Supabase Edge Functions deploy from generated `index.bundle.ts` entrypoints;
- all three generated Edge Function bundles exist and carry the generated-file
  banner;
- the migration count matches CI's database validation expectation;
- `.env.example` contains only empty placeholders and no other `.env` file is
  tracked;
- the server-only DeepSeek provider defaults to `deepseek-v4-flash`, rejects
  legacy/thinking model IDs, sends JSON Output with disabled thinking mode, and
  handles terminal and retryable provider errors deterministically;
- the production `generate-workout` bundle contains the server-only DeepSeek
  wiring for `grounded_decision_explanation`;
- the browser build contains no DeepSeek key names, server-only provider
  implementation, or raw AI package wiring;
- this checklist and the implementation-plan STAB-005 row exist.

## PWA and iPhone readiness

Automated checks confirm that the static assets required before an iPhone test
exist in the repository:

- `apps/web/public/manifest.webmanifest`;
- `/icons/icon-192.png`;
- `/icons/icon-512.png`;
- `/icons/icon-maskable-192.png`;
- `/icons/icon-maskable-512.png`;
- Apple touch icon metadata;
- `viewport-fit=cover`;
- standalone display mode and matching theme/background colors.

Manual iPhone gate after deployment:

1. Open the production HTTPS URL in Safari on iPhone.
2. Use Share > Add to Home Screen and confirm the Adaptive Workout icon/name.
3. Launch from the Home Screen icon and confirm standalone display without
   Safari chrome.
4. Confirm short pages do not gain accidental scroll and long pages keep fixed
   navigation reachable.
5. Sign in with the production OTP flow, close/reopen the PWA, and confirm the
   Supabase session restores.
6. Start or resume a workout and confirm no horizontal overflow appears.

## Vercel production prerequisites

Automated checks verify the repository-owned `vercel.json`:

- `installCommand`: `npm ci`;
- `buildCommand`: `npm run build --workspace @adaptive-workout/web`;
- `outputDirectory`: `apps/web/dist`;
- SPA fallback to `/index.html`;
- security headers for MIME sniffing, referrer policy, frame denial,
  permissions policy, and HSTS.

Manual Vercel gate:

- verify the production project is linked to the intended GitHub repository;
- verify the production branch is the approved release branch;
- verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured in
  Vercel without printing their values;
- confirm `VITE_E2E_AUTH` is absent or false for production;
- Do not deploy from STAB-005.

## Supabase production prerequisites

Automated checks verify local repository configuration only:

- `supabase/config.toml` declares generated bundle entrypoints for
  `generate-workout`, `refresh-progression`, and `generate-program`;
- the generated bundles exist;
- local migrations are counted consistently with CI;
- CI runs local reset, database lint, and pgTAP.

Manual Supabase gate:

- verify remote migration status against the intended production project;
- verify production Auth Site URL and Redirect URLs after the final production
  URL is known;
- verify Edge Function secrets exist without printing values;
- verify `DEEPSEEK_API_KEY` exists before enabling AI calls;
- optionally verify `DEEPSEEK_BASE_URL` and `DEEPSEEK_MODEL`; if absent, the
  provider uses `https://api.deepseek.com` and `deepseek-v4-flash`;
- verify `SUPABASE_SERVICE_ROLE_KEY` is configured only for server-side function
  use;
- do not run `supabase db push`, mutate remote data, or deploy Edge Functions
  during STAB-005.

## OTP production readiness

Automated checks verify app-side requirements:

- sign-in calls Supabase `signInWithOtp` with `shouldCreateUser: true`;
- the app does not forward arbitrary redirect parameters with `emailRedirectTo`;
- verification calls `verifyOtp` with `type: 'email'`;
- the browser client enables Supabase session persistence, auto refresh, and
  URL-session detection;
- production builds reject the E2E auth seam.

Manual OTP gate:

- configure Supabase Auth Site URL to the final production URL;
- configure exact production redirect URLs and any approved preview redirect
  pattern;
- verify an email OTP can be requested and redeemed against the production
  origin;
- verify resend/rate-limit behavior with the provider's production policy.

## Edge Function and migration readiness

Before a deployment request:

- run `npm run edge-fn:build:all`;
- inspect any generated bundle diff;
- run the database validation commands listed above;
- confirm CI database job is green.

Manual deployment gate:

- deploy Edge Functions only after explicit approval;
- apply remote migrations only after explicit approval and migration review;
- never reset production data.

## DeepSeek AI provider readiness

Automated checks verify repository-owned provider behavior only:

- DeepSeek is implemented behind `AIProvider` and remains server-side.
- `DEEPSEEK_API_KEY` is required by the server factory and is never read by
  browser code.
- `DEEPSEEK_BASE_URL` defaults to `https://api.deepseek.com`.
- `DEEPSEEK_MODEL` defaults to `deepseek-v4-flash`.
- DeepSeek requests include `thinking: { type: "disabled" }`.
- Structured tasks use JSON Output and prompts explicitly request a JSON object
  with the required schema shape.
- Provider JSON is validated against the existing task contracts before use.
- Tests cover success, timeout, empty response, invalid JSON, schema-invalid
  JSON, 401, 402, 429, 5xx, truncated output, and unavailable provider cases.
- `generate-workout` invokes only the supported grounded decision explanation
  task after deterministic generation succeeds.
- Ordinary deterministic generation still works when no AI provider is
  configured.
- Provider failures and invalid provider output return no explanation and do not
  bypass deterministic safety rules.
- The browser bundle receives only a safe optional explanation string and no
  key names, prompts, raw provider responses, or provider internals.

Manual AI provider gate:

- configure `DEEPSEEK_API_KEY` only as a Supabase Edge Function secret;
- do not print or paste the secret into logs, docs, or browser variables;
- deploy the updated `generate-workout` function only after explicit approval:
  `npx supabase functions deploy generate-workout --project-ref bgslpmenvlcgstczzfyg --no-verify-jwt`;
- after deployment, smoke-test authenticated generation, explanation fallback,
  persistence, and log/output redaction.

## Release-candidate decision

V1 is ready for the manual deployment step only when:

- all automated local checks pass;
- PR quality and database checks pass;
- Vercel preview/build checks pass where available;
- no generated reports, traces, videos, screenshots, `.env` files, secrets, or
  unrelated changes are staged;
- the remaining work is only the documented manual production/iPhone gates.

V1 is not deployed by STAB-005.
