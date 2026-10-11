# Adaptive Workout Android release checklist

**Scope:** signed Android APK only. The React/Vite client is embedded in the
APK; there is no browser/PWA/Vercel release target.

## Automated release-readiness checks

Run in this order on the release branch:

1. `npm run release:check`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run format:check`
5. `npm test`
6. `npm run catalog:check`
7. `npm run build`
8. `npm run edge-fn:build:all`
9. `npm run test:e2e-production-guard`
10. `npm run android:build:debug`
11. `npm run android:test:device`
12. `npm run android:build`
13. `apksigner verify --verbose artifacts/adaptive-workout-1.0-release.apk`

The Chromium Playwright suite is an embedded-client regression harness. It is
not a web deployment check. GitHub quality and database jobs remain required
for the release branch.

## What `npm run release:check` verifies

The deterministic guard does not read secrets or change remote resources. It
verifies:

- required repository, Android and validation scripts exist;
- the numeric email OTP flow requests and verifies a six-digit email token;
- the production build rejects the E2E auth seam;
- Supabase Edge Functions use generated bundle entrypoints;
- generated bundles and migrations match the CI expectations;
- `.env.example` contains empty placeholders only and no secret is tracked;
- DeepSeek remains server-only, uses `deepseek-v4-flash`, disabled thinking,
  JSON Output, contract validation and bounded error handling;
- deterministic generation remains safe when AI is unavailable;
- the browser code delivered inside the APK contains no provider key,
  prompt, raw response or server-only AI package;
- this checklist and the implementation plan are present.

## Manual human gates

These actions are intentionally not automated:

- approve and perform remote Supabase migrations or Edge Function deployment;
- configure or rotate production secrets;
- configure the Supabase Auth email template with `{{ .Token }}` and without
  `{{ .ConfirmationURL }}`;
- install the signed APK on the physical Galaxy A14;
- verify production OTP, session restoration, network interruption and
  workout persistence on the device;
- distribute the APK and merge the pull request.

Do not deploy from STAB-005.

## Supabase and OTP gate

Before a production APK is distributed, review linked migrations and deploy
only reviewed Edge Function bundles. Required server-only names are
`SUPABASE_SERVICE_ROLE_KEY` and `DEEPSEEK_API_KEY`; `DEEPSEEK_BASE_URL` and
`DEEPSEEK_MODEL` are optional because code defaults apply. Never print values.

The app expects a numeric six-digit email OTP. After template configuration,
request, redeem, resend and rate-limit the code on the physical device.

## APK gate

Confirm package `com.adaptiveworkout.app`, minimum SDK 24, target SDK 36,
successful signature verification, and a clean install/upgrade on Android 15
or newer. The release key and signing properties must stay outside Git.

## Final decision

V1 is ready for manual APK installation only when all automated checks and
required CI jobs pass, the APK is signed, and the remaining work consists
only of the manual Supabase and Galaxy A14 gates above. No web deployment is
required or expected.
