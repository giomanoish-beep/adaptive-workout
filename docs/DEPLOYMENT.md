# Android and Supabase deployment

Adaptive Workout is distributed as a signed Android APK. The React/Vite
client under `apps/web/` is an embedded Capacitor asset; there is no separate
browser, PWA or Vercel production deployment.

## Release build

Run the repository checks first, then build the APK:

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run edge-fn:build:all
npm run test:e2e-production-guard
npm run android:build:debug
npm run android:test:device
npm run android:build
```

`npm run android:build` creates
`artifacts/adaptive-workout-1.0-release.apk`. Signing properties and the
keystore are read from `%USERPROFILE%\\.adaptive-workout` and are never
committed. Verify the artifact with:

```powershell
$env:ANDROID_HOME\\build-tools\\<version>\\apksigner.bat verify --verbose artifacts/adaptive-workout-1.0-release.apk
```

The package ID is `com.adaptiveworkout.app`, minimum SDK 24, and target SDK 36. Install the APK on the Galaxy A14 only after the manual release gate is
approved.

## Supabase prerequisites

Supabase remains the production backend for Auth, database persistence and
Edge Functions. Remote operations require explicit approval and are not part
of the normal APK build.

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase migration list --linked
npx supabase db push --dry-run --linked
```

Review the dry run exactly before applying a migration:

```powershell
npx supabase db push --linked
npx supabase migration list --linked
```

Build all generated bundles before deploying a function:

```powershell
npm run edge-fn:build:all
npx supabase functions deploy generate-workout --project-ref <project-ref> --no-verify-jwt
npx supabase functions list --project-ref <project-ref>
```

Deploy only the reviewed function and never repair migration history by
deleting or editing remote records. Roll back an Edge Function by redeploying
the known-good bundle from its reviewed commit. Database rollback is a new,
reviewed forward migration; do not reset production data.

## Server-only configuration

The APK contains only the public Supabase URL and anonymous key required by
the existing client. These values do not grant service-role access.

Configure the following only in Supabase Edge Function secrets:

| Name                        | Required                | Notes                                   |
| --------------------------- | ----------------------- | --------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes                     | Server-side function use only.          |
| `DEEPSEEK_API_KEY`          | Yes for AI explanations | Never expose or log.                    |
| `DEEPSEEK_BASE_URL`         | Optional                | Defaults to `https://api.deepseek.com`. |
| `DEEPSEEK_MODEL`            | Optional                | Defaults to `deepseek-v4-flash`.        |

Never put these values in a `VITE_` variable, APK resource, source file or
client log.

## Numeric email OTP

The app expects a six-digit email OTP. Configure the Supabase Auth email
template to render `{{ .Token }}` and do not use `{{ .ConfirmationURL }}` for
this sign-in flow. The app verifies `type: 'email'`, restores the Supabase
session, and does not log the code.

## Manual Galaxy A14 smoke test

After a reviewed APK is installed and the backend is approved:

1. Launch the app on the Galaxy A14 and confirm cold start and resume.
2. Request an email OTP and verify a valid six-digit code; verify invalid,
   expired and rate-limited states are safe and readable.
3. Create a scheduled and a custom workout, review duration/load values, and
   persist a completed set.
4. Disable and restore network access around Auth and workout generation; the
   app must fail safely without corrupting deterministic workout data.
5. Sign out, sign back in, background the app, and confirm the session and
   saved workout state restore correctly.
6. Confirm no API key, prompt, raw provider response or internal error appears
   in the UI or device logs.

## CI and repository checks

GitHub Actions validates install, typecheck, lint, unit tests, build, Edge
Function bundle generation, database checks and the production-auth guard.
The Playwright Chromium projects are an embedded-client regression harness;
they do not represent a separately hosted web product. PR merge, Supabase
remote changes, secret changes and APK distribution remain human gates.
