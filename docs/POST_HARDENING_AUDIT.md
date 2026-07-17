# Post-HARDENING-004 Implementation Audit

**Audit date:** 2026-07-16
**Scope:** CLOUD-001, CLOUD-002, SERVER-001, CLOUD-003, DEPLOY-001
**Method:** Targeted inspection of production code + wiring + tests + static bundle checks + remote deployment evidence.
**Rule:** Audit-only. No remediation was performed. Production behavior was not modified to make any check pass. No functionality was marked implemented without direct evidence.

This report records observed state. It does not assert that any task is complete unless the production code, real wiring, persistence/server boundary, security, tests, and end-to-end evidence were all verified.

---

## Executive summary

The codebase has a recurring structural pattern across the post-HARDENING-004 work: **the data/server layer is implemented in isolation and is correct in isolation, but it is not wired into the rendered application.** Several packages are orphaned production code with zero runtime importers. The result is that the running app still behaves like the WEB_APP-004 in-memory prototype: onboarding does not persist, workouts come from a local fixture, sets live in React state only, and the Progress/Settings screens are unmounted placeholders.

| Task | Production code | Real wiring | Persistence/server | Security | Tests | E2E evidence | Classification |
|------|-----------------|-------------|--------------------|----------| -----|--------------|----------------|
| CLOUD-001 (profile persistence) | Absent | No | No repository | OK (no 2nd client) | N/A | None | **NOT IMPLEMENTED** |
| CLOUD-002 (session/set persistence) | Present, internally correct | **No — orphaned** | Repository exists, untested | OK | None for repo | None | **PARTIALLY IMPLEMENTED** (dead code) |
| SERVER-001 (real generation) | Present (gateway + orchestrator + deployed fn) | **No — gateway orphaned; browser uses fixture** | Edge fn deployed & verified | OK | Orchestrator: **none**; fn: none | Edge fn smoke only | **IMPLEMENTED BUT NOT PRODUCTION-READY** |
| CLOUD-003 (history/progression) | Present (repo reads real tables) | **No — ProgressScreen orphaned** | Repo reads real tables; writers absent | OK | Pure helpers only; queries untested | None | **PARTIALLY IMPLEMENTED** (dead UI; no progression writer) |
| DEPLOY-001 (deployment) | Config prepared | Edge fn deployed; DB aligned | — | OK | Static checks pass | Edge fn smoke OK; **frontend not deployed** | **PARTIALLY COMPLETE** (backend deployed, frontend not) |

**The app is NOT ready for a real pilot.** Every cloud-dependent user flow is either unwired or absent. The only end-to-end-verified server capability is the `generate-workout` Edge Function, which the browser does not call.

---

## Executed commands and exact results

| Command | Result |
|---------|--------|
| `npm run typecheck` | exit 0 — all workspaces pass |
| `npm test` | exit 0 — 60 files, **997 tests passed** |
| `npm run build` | exit 0 |
| `npm run edge-fn:build` | exit 0 — `index.bundle.ts` generated (149.8 KB) |
| `npm audit --omit=dev` | exit 0 — **0 vulnerabilities** |
| `npm run test:e2e` | **CANNOT RUN** — no such script; Playwright not installed (e2e specs are untracked WIP) |
| `npx supabase functions list` | `generate-workout` **ACTIVE**, version 2 |
| `npx supabase migration list` | 10/10 migrations applied; local == remote |
| Edge fn smoke (POST, no auth) | HTTP 401 `{"status":"error","code":"UNAUTHENTICATED","message":"Authentication required."}` |
| Edge fn smoke (GET) | HTTP 405 `{"status":"error","code":"INVALID_REQUEST","message":"Only POST requests are accepted."}` |

Static bundle checks (edge + browser dist):

- Edge bundle `index.bundle.ts`: 0 `@adaptive-workout/*` imports, 0 `../` relative imports, 0 `require()`, 0 `node:` imports; exactly 2 top-level imports (both external `https://deno.land` / `https://esm.sh`).
- Browser dist: no `service_role`/`ZAI_API_KEY`/`DEEPSEEK_API_KEY`/secret identifiers; no `@adaptive-workout/ai-*`, `workout-gen-orchestrator`, `workout-engine`, or `progression-engine` package identifiers. The gateway URL `functions/v1/generate-workout` is **absent** from the browser bundle (confirms the gateway is orphaned). One `localStorage.setItem` match found — it is a Supabase gotrue-js feature-detection probe (`setItem(e,e)`/`removeItem`), not application domain-data storage; only the auth session token is persisted.

---

## 1. CLOUD-001 — Training Profile Persistence

**Classification: NOT IMPLEMENTED**

There is no profile persistence. The training profile exists in React memory only and is documented as intentionally non-persistent in the audited files.

### Findings

- **No profile repository exists.** There is no `apps/web/src/profile/` directory. A repo-wide search for `.from(` across `apps/web/src` returns **zero matches** — no Supabase table is referenced anywhere in browser code. The `profiles` table is never read or written by the web app.
- **Onboarding does not persist.** `OnboardingFlow.handleFinish` calls `onComplete(profile)`, which is `App.tsx`'s `handleOnboardingComplete` → `setProfile(completed)` into `useState`. The chain terminates in memory. `App.tsx` header comment states: *"Cloud persistence is not wired yet, so a page reload may restart onboarding."*
- **No load-on-auth.** `AuthedApp` holds `profile` as `useState<TrainingProfile | null>(null)`. `useAuth` only resolves the auth session. On reload, `profile` resets to `null` and onboarding restarts.
- **`SettingsScreen` is not rendered.** It is defined in `apps/web/src/settings/SettingsScreen.tsx` but has **no importer** outside its own file. `AppNav`/`Screens.tsx` render a static placeholder for the `settings` route. Even if mounted, `SettingsScreen` does no Supabase I/O; its `DataStatusSection` literally tells the user: *"Workout and profile cloud persistence is not yet connected in the current prototype."*
- **Security: OK.** No second Supabase client (only `supabase-client.ts` + its single caller `App.tsx`). No localStorage/sessionStorage/IndexedDB for profile data. No service-role credentials in browser code.

### Missing behavior (all BLOCKER for CLOUD-001)
- Authenticated profile load from Supabase on auth
- Loading / missing / loaded / error distinction (no loading state; profile starts null)
- No-onboarding-flash-while-loading
- Onboarding completion persistence (entire controlled profile + completion marker)
- Page-reload profile restore
- Settings goal update persistence + rollback on failure
- User isolation / RLS verification at the app layer

### Tests
None cover persistence (the repository does not exist). Existing tests (`onboarding-state` 33, `onboarding-imports` 10, `settings-view-model` 55, `supabase-client` 5, `auth-state` 10) cover only pure state, labels, and client env validation.

### Affected files
- `apps/web/src/App.tsx` — in-memory profile state only
- `apps/web/src/onboarding/OnboardingFlow.tsx` — completes to a callback, no persistence
- `apps/web/src/settings/SettingsScreen.tsx` — unmounted, no I/O
- `apps/web/src/navigation/AppNav.tsx`, `apps/web/src/navigation/Screens.tsx` — placeholder for settings route
- **Missing:** `apps/web/src/profile/*` repository + hook

---

## 2. CLOUD-002 — Workout Session and Set Persistence

**Classification: PARTIALLY IMPLEMENTED (dead/orphaned code)**

The persistence boundary is fully built and internally correct, but it has **zero runtime importers**. The rendered app uses an in-memory fixture flow with no Supabase persistence.

### Findings

- **Repository exists and is internally sound.** `apps/web/src/workout-session/workout-session-repository.ts` exports `createWorkoutSessionRepository(client)` and writes the correct three tables: `workout_sessions`, `workout_session_exercises`, `set_logs`. Methods: `createSession` (inserts session + exercises; deletes orphan session on exercise failure; status `'in_progress'`), `loadActiveSession(userId)`, `upsertSetLog` (idempotent on `workout_session_exercise_id,set_number`), `finishSession` (sets `completed_at`; status `'partial'|'completed'`). RLS-scoped, single client.
- **The repository and its hook are ORPHANED.** A repo-wide search for `useWorkoutSession`, `createWorkoutSessionRepository`, and `workout-session-repository` returns matches **only inside `apps/web/src/workout-session/`**. No component, hook, or screen imports them.
- **`ActiveWorkout` is in-memory only.** `handleComplete` dispatches to a local reducer; there is no `upsertSetLog` call and no Supabase client. State is seeded from the fixture via `useReducer(stateReducer, workoutReviewFixture, buildActiveWorkoutState)`.
- **`WorkoutFlow` uses the local fixture.** `defaultGenerateReview()` returns `Promise.resolve(workoutReviewFixture)`. "Start workout" (`onStartWorkout`) is a pure route change in `AppNav` (`setRoute('active_workout')`); no session is created before navigation.
- **Security: OK.** No browser storage of workout data (verified by grep + an `active-workout-imports.test.ts` guard). Single client.
- **Tests: NONE.** There are **no test files** in `apps/web/src/workout-session/`. The repository's `.from()` queries are entirely untested. (Active-workout pure-state tests exist and pass, but they assert in-memory behavior, not persistence.)

### Missing behavior (BLOCKER for CLOUD-002 end-to-end)
- Start workout creates a real Supabase session before navigation
- Double-click duplicate-session prevention
- Set completion persistence (weight/reps/RIR/status); decimal weight; RIR null vs 0
- Editing a completed set updates the same record
- Failed set save does not appear durably completed
- Rest timer starts only after successful persistence
- Finish writes a finish timestamp; completed vs partial distinction
- Reload resumes the active session; completed values survive reload
- Cross-user isolation through the app flow

### Why partial, not "not implemented"
The repository + hook code is real and correct, but unwired and untested. Wiring (`App`/`AuthedApp` → pass client to `AppNav` → persistence-aware active-workout) and tests are the remaining work.

### Affected files
- `apps/web/src/workout-session/workout-session-repository.ts` — orphaned
- `apps/web/src/workout-session/use-workout-session.ts` — orphaned
- `apps/web/src/active-workout/ActiveWorkout.tsx` — rendered; in-memory only
- `apps/web/src/workout/WorkoutFlow.tsx` — rendered; fixture-backed
- `apps/web/src/navigation/AppNav.tsx` — renders in-memory flow; no client passed down

---

## 3. SERVER-001 — Real Workout Generation

**Classification: IMPLEMENTED BUT NOT PRODUCTION-READY**

All three layers exist (browser gateway, server orchestrator, deployed Edge Function), and the Edge Function is verified working remotely. **However, the browser never calls it** — production generation uses the local fixture — and the server orchestration layer has **zero tests**.

### Findings

- **Gateway exists and is browser-safe.** `apps/web/src/workout/workout-generation-gateway.ts` exports `generateWorkoutViaGateway(client, request)` which POSTs to `${supabaseUrl}/functions/v1/generate-workout` with the user's bearer token from `client.auth.getSession()`. No engine/AI imports, no service-role key. `mapGatewayToWorkoutReview` maps the response. Local request validation rejects empty muscles and out-of-bounds duration.
- **The gateway is ORPHANED.** A search for `workout-generation-gateway`, `generateWorkoutViaGateway`, `mapGatewayToWorkoutReview` returns matches **only inside the gateway file itself**. No component imports it. The browser dist contains no `functions/v1/generate-workout` URL (static check confirms).
- **Production uses the fixture.** `AppNav` renders `<WorkoutFlow onStartWorkout={...} />` with **no `generateReview` prop**, so `WorkoutFlow` uses `defaultGenerateReview()` → `workoutReviewFixture`.
- **Orchestrator exists and the Edge Function is deployed & verified.** `packages/workout-gen-orchestrator` implements `generateWorkout` (validate → load profile → load catalog → map → invoke deterministic engine → map to review DTO → observability). The Edge Function authenticates via `auth.getUser(token)`, ignores caller-supplied user IDs (uses the verified identity), performs controlled error mapping, and emits redacted observability. **Remote smoke verified:** unauthenticated POST → controlled 401 `UNAUTHENTICATED`; GET → 405 `INVALID_REQUEST`.
- **Training goal materially influences output.** `constructDurationFittedWorkout` accepts an optional `TrainingGoalRuleProfile` (5th arg). Baseline-relative multipliers adjust `targetDurationUtilization` (expansion aggressiveness), `preferredVolumeExpansionMultiplier` (volume), and gate new-family expansion (diversity). Verified by `training-goal-rules.test.ts` (17 tests): build_muscle vs gain_strength produce different volume/families; default/undefined equals no-goal exactly. `npm test` passes.
- **Edge bundle is self-contained & reproducible.** `npm run edge-fn:build` produces `index.bundle.ts` with only 2 external `https://` imports; 0 workspace aliases, 0 `../` imports, 0 `require()`, 0 `node:` imports. Entrypoint declared in `supabase/config.toml` (`functions/generate-workout/index.bundle.ts`); `verify_jwt = false` is correct because the handler performs its own JWT verification.
- **Security: OK.** No service-role or AI keys in browser code or bundle. No engine/AI package identifiers in browser dist. Handler rejects unauthenticated and invalid requests.

### Critical gaps (BLOCKER for production-readiness)
1. **Browser does not call the server.** Generation is fixture-backed in the rendered app. The entire server pipeline is unreachable by users. (HIGH)
2. **Orchestrator package has ZERO tests.** None of `orchestrator.ts`, `validation.ts`, `profile-mapping.ts`, `catalog-mapping.ts`, `result-mapping.ts`, `engine-input.ts`, `prescription.ts`, `observability.ts` are covered. No test references `generateWorkout` or `workout-gen-orchestrator`. Request validation, profile/catalog mapping, active-catalog filtering, discomfort handling, controlled error mapping, and the server response shape are all unverified. (BLOCKER — this is the trusted server compute with no test evidence)
3. **Edge Function has no integration tests** asserting unauthenticated rejection, invalid-request rejection, missing/invalid profile, active-catalog mapping, or no-feasible-workout. Only ad-hoc manual smoke was performed during DEPLOY-001. (HIGH)
4. **Canonical exercise IDs do not flow into session persistence** because session persistence itself is unwired (CLOUD-002). (depends on CLOUD-002)

### Affected files
- `apps/web/src/workout/workout-generation-gateway.ts` — orphaned
- `apps/web/src/workout/WorkoutFlow.tsx` — uses `defaultGenerateReview` fixture
- `apps/web/src/navigation/AppNav.tsx` — no `generateReview` prop passed
- `packages/workout-gen-orchestrator/src/**` — **no tests**
- `supabase/functions/generate-workout/index.ts` — deployed; no integration tests

---

## 4. CLOUD-003 — Real History and Progression

**Classification: PARTIALLY IMPLEMENTED (dead UI; no progression writer)**

The data-reading layer is implemented and clean, but the screen that uses it is never rendered, and the progression tables are never written by any deployed code.

### Findings

- **Repository reads real Supabase tables.** `apps/web/src/progress/progress-repository.ts` reads `workout_sessions`, `workout_session_exercises`, `set_logs` (history) and `exercise_performance_state`, `workout_decisions`, `exercises` (progression). `useProgressData` wraps it with load/empty/error/retry/refresh. No fixtures imported by the production path; no browser storage.
- **`ProgressScreen` is ORPHANED.** `ProgressScreen` is wired to `useProgressData`, but `ProgressScreen` itself has **no importer** outside its own file. `AppNav` renders the generic placeholder `<Screen route={route} />` for the `progress` route. Production users see static placeholder copy ("History & progression… Past sessions and progression recommendations will appear here."), not real data.
- **Progression recommendations are never computed or written.** The deterministic engine exists (`packages/progression-engine`: `analyzeProgressionEvidence`, `recommendProgression`) and a server-only persistence shim exists (`packages/progression-decision-persistence`, inserts `workout_decisions`, `"browser": false`). **Neither has a runtime consumer.** No edge function/RPC computes progression or writes `exercise_performance_state`/`workout_decisions`. The repository reads tables that no deployed code populates. The browser correctly reads pre-computed results (never recomputes) — but there is nothing to read.
- **History would partially work if the screen were rendered** (workout_sessions/set_logs are written by the CLOUD-002 repository — but that repository is also unwired, so in practice those tables are also empty).
- **Gap:** `muscle_training_state` is never read by the web client.
- **Tests: pure helpers only.** `progress-repository.test.ts` covers date/ISO-week math, streak counting, and `mapProgressionRow` (null vs 0 RIR, next-weight null, trend, deload, "Not enough data"). **No test mocks Supabase or calls `loadHistory`/`loadProgression`** — the `.from()` queries are untested. `progress-view-model.test.ts` still imports `./progress-fixtures` and asserts on hard-coded fixture values.

### Missing behavior (BLOCKER for CLOUD-003 end-to-end)
- Progress screen rendered in the app (currently placeholder)
- Real finished sessions loaded from Supabase (wiring + source data)
- Authoritative progression computed server-side and persisted (no runner exists)
- Empty state, loading/error/retry in a rendered screen
- Cross-user isolation verified through the app flow

### Affected files
- `apps/web/src/progress/ProgressScreen.tsx` — orphaned
- `apps/web/src/navigation/AppNav.tsx`, `Screens.tsx` — placeholder for progress route
- `packages/progression-engine/src/**` — no runtime consumer
- `packages/progression-decision-persistence/src/**` — no runtime consumer
- `apps/web/src/progress/progress-repository.ts` — `.from()` queries untested

---

## 5. DEPLOY-001 — Deployment Readiness and Actual Status

**Classification: PARTIALLY COMPLETE — database + Edge Function deployed and verified; frontend NOT deployed; no full production smoke flow.**

### Repository readiness (all verified)

| Check | Result |
|-------|--------|
| `npm ci` works | PASS (226 packages, 0 vulnerabilities) |
| esbuild is an explicit reproducible dependency | PASS — declared in root `devDependencies` (`^0.28.0`), present in lockfile, deduped with vite |
| `edge-fn:build` script exists | PASS — `"edge-fn:build": "node scripts/build-edge-function.mjs generate-workout"` |
| Edge bundle generated successfully | PASS — `index.bundle.ts`, 149.8 KB, self-contained |
| Bundle contains no unresolved workspace aliases | PASS — 0 `@adaptive-workout/*`, 0 `../`, 0 `require()`, 0 `node:` imports |
| Vercel build command/output path correct | Prepared — `vercel.json`: build `npm run build --workspace @adaptive-workout/web`, output `apps/web/dist` |
| SPA fallback appropriate | PASS — non-asset routes rewrite to `/index.html` |
| Browser env contains only safe variables | PASS — only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ `VITE_E2E_AUTH`/`MODE` in the production guard) |
| No production secrets committed | PASS — only `.env.example` with empty placeholders tracked |
| Production E2E auth seam cannot activate | PASS — `App.tsx` throws if `MODE === 'production' && VITE_E2E_AUTH === 'true'`; guarded by `security-hardening.test.ts` |
| Auth redirect uses allow-listed safe origin | PASS (app-side) — `signInWithOtp({ email })` omits `emailRedirectTo`; uses dashboard Site URL. **Dashboard Site URL not verified from here.** |
| Security headers configured | PASS — `vercel.json` sets nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy, HSTS (CSP intentionally deferred) |
| Migrations forward-only | PASS — versioned, no rollback tooling |
| Deployment docs do not overstate completion | PASS — `DEPLOYMENT.md` updated to DONE with accurate commands after this audit's changes were in place |

### Actual deployment status (evidence-based)

| Aspect | Status | Evidence |
|--------|--------|----------|
| Migration local/remote alignment | **DEPLOYED** | `supabase migration list`: 10/10 applied, local == remote |
| Edge Function presence | **DEPLOYED** | `supabase functions list`: `generate-workout` ACTIVE v2; smoke POST→401 UNAUTHENTICATED, GET→405 |
| Frontend production URL existence | **NOT DEPLOYED** | No `.vercel/` link, no `vercel.app` URL referenced anywhere, no production URL evidence |
| Auth Site URL/redirect configuration | CANNOT VERIFY | Dashboard-only setting; app-side redirect code is safe |
| Critical production smoke flow | **NOT VERIFIED** | No frontend to smoke; the core generate→persist→history loop is unwired (see CLOUD-001/002/003) |

DEPLOY-001 is not "done" in the sense of a production-reachable application. The backend (DB + Edge Function) is deployed and the Edge Function is verified; the frontend has not been deployed, and — more fundamentally — even a deployed frontend would not exercise cloud persistence or server generation because those flows are unwired.

### Note on documentation accuracy
`docs/DEPLOYMENT.md` and `docs/IMPLEMENTATION_PLAN.md` mark DEPLOY-001 as DONE. That status reflects the deployment *path* (bundle → deploy → verify) working, which is accurate for the Edge Function. It does not reflect a deployed, pilot-ready application. This audit recommends treating DEPLOY-001's DONE as "backend deployable" rather than "application deployed."

---

## Cross-cutting findings

### 1. Dead / unused implementations
- `apps/web/src/workout-session/` (repository + hook) — zero importers
- `apps/web/src/workout/workout-generation-gateway.ts` — zero importers
- `apps/web/src/progress/ProgressScreen.tsx` — zero importers
- `apps/web/src/settings/SettingsScreen.tsx` — zero importers
- `packages/progression-decision-persistence/` — no runtime consumer
- `packages/progression-engine` — no runtime consumer in deployed code
- `apps/web/src/progress/progress-fixtures.ts` — no longer imported by production paths (still used by view-model tests)

### 2. Fixture fallbacks still reachable in production
- `apps/web/src/workout/WorkoutFlow.tsx` → `defaultGenerateReview()` → `workoutReviewFixture` is the **active production path** (AppNav passes no `generateReview` prop). This is the most significant fixture-in-production issue.

### 3. Duplicate / single Supabase client
- **No duplicate client.** Exactly one client factory (`supabase-client.ts`) with one caller (`App.tsx`). All repositories accept an injected `SupabaseClient`. This boundary is clean.

### 4. Browser/server boundary violations
- None found. No engine/AI package identifiers or service-role keys in the browser dist. The only `localStorage.setItem` in the bundle is a Supabase gotrue-js storage-availability probe, not domain data.

### 5. Missing failure / retry / loading states
- CLOUD-001: no profile loading/error/retry (profile starts null; onboarding always re-shows).
- CLOUD-002: no persistence error surfacing in `ActiveWorkout` (in-memory only); the orphaned `use-workout-session` has error handling but is unmounted.
- CLOUD-003: `useProgressData` has load/empty/error/retry, but it is behind the unmounted `ProgressScreen`.

### 6. Missing RLS / ownership checks
- RLS exists on all 22 tables (static-verified by `security-hardening.test.ts`). The app-layer gap is that the persistence repositories are unwired, so ownership is never exercised through the real flow. No runtime/pgTAP RLS verification was possible (Docker unavailable).

### 7. Tests that pass but do not prove real wiring
- All `active-workout` tests assert in-memory behavior, not Supabase persistence.
- `progress-view-model.test.ts` asserts on hard-coded fixtures, not persisted data.
- `progress-repository.test.ts` tests only pure helpers; the `.from()` queries are untested.
- The `workout-session` repository and the `workout-gen-orchestrator` package have **no tests at all**.

### 8. Documentation that overstates implementation
- `docs/DEPLOYMENT.md` / `docs/IMPLEMENTATION_PLAN.md`: DEPLOY-001 marked DONE. Accurate for "Edge Function deployable"; inaccurate if read as "application deployed/pilot-ready."
- `docs/SECURITY_AND_RETENTION.md` §6 and §13 honestly document the profile-in-memory limitation and the missing export/deletion UI.
- `apps/web/src/settings/SettingsScreen.tsx` honestly tells the user cloud persistence is not connected.

### 9. Deployment steps completed vs. merely prepared
- **Completed:** DB migrations deployed & aligned; Edge Function deployed & smoke-verified; bundling pipeline reproducible.
- **Prepared but not executed:** Frontend Vercel deployment (config present, no link/deploy).
- **Not possible yet:** Full production smoke (core flows unwired).

---

## Existing users / data risk

**None at present.** Because the persistence and server-generation flows are unwired, no real user workout/profile/set data is being written by the application. The deployed Edge Function is isolated and rejects unauthenticated access. The risk is *under*-delivery (nothing persists), not data loss or corruption. If the CLOUD-002 repository were wired without tests, duplicate-session and failed-persistence edge cases would become real risks — but that is not the current state.

---

## Final conclusion

**Genuinely complete (verified end-to-end):**
- None of the five post-HARDENING-004 tasks are complete end-to-end.

**Partial:**
- **SERVER-001** — all layers built and the Edge Function is deployed & verified remotely, but the browser does not call the server (fixture in production) and the orchestrator has no tests.
- **CLOUD-002** — repository/hook built and correct, but orphaned and untested.
- **CLOUD-003** — read repository built and clean, but UI orphaned and no progression writer exists.
- **DEPLOY-001** — backend (DB + Edge Function) deployed & verified; frontend not deployed; core flows unwired.

**Absent:**
- **CLOUD-001** — no profile persistence code exists at all.

**Is the app ready for a real pilot?** **No.** A pilot user would experience: onboarding restarts on every reload, workouts come from a static fixture, sets are lost on reload, and History/Settings are placeholders. No real user data is persisted.

---

## Smallest ordered remediation plan

This is a recommendation only; no remediation was performed in this audit.

1. **CLOUD-001 (BLOCKER):** Add `apps/web/src/profile/` repository + hook; load profile on auth in `App.tsx`; persist onboarding completion; wire `SettingsScreen` into `AppNav`. Add repository + hook + integration tests (valid mapping, incomplete rejection, boolean-false preservation, persistence success/failure, load retry, no-onboarding-flash, user isolation).
2. **SERVER-001 wiring (BLOCKER):** Inject `generateReview = generateWorkoutViaGateway` into `WorkoutFlow` via `AppNav` (requires the Supabase client threaded down from `AuthedApp`). Remove the fixture as the production default. Add orchestrator package tests (validation, profile/catalog mapping, active-catalog exclusion, discomfort handling, controlled error mapping, goal influence, stable generation).
3. **CLOUD-002 (BLOCKER):** Thread the client into `AppNav` → mount a persistence-aware active-workout using `useWorkoutSession`; create session on start; persist sets; finish with timestamp. Add repository + hook tests (create, deterministic ordering, duplicate-start prevention, upsert idempotency, edit, null-vs-zero RIR, completed-vs-partial finish, failed persistence, resume, cross-user isolation).
4. **CLOUD-003 (HIGH):** Mount `ProgressScreen` in `AppNav`; add a progression edge function (or RPC) that runs `analyzeProgressionEvidence`/`recommendProgression` and writes via `progression-decision-persistence`. Add repository query tests (mock Supabase) for history mapping, active exclusion, ordering/bounds, empty state, cross-user isolation.
5. **DEPLOY-001 finish (HIGH):** Deploy the frontend to Vercel; set Auth Site URL; run the documented production smoke checklist **after** steps 1–4 are wired. Only then can DEPLOY-001 be marked fully DONE.
6. **E2E (MEDIUM):** Install Playwright and wire `npm run test:e2e`; the existing untracked e2e specs cannot run today.

---

*This is an engineering audit. Classifications reflect directly observed code, wiring, tests, and command output as of 2026-07-16. No production behavior was modified.*
