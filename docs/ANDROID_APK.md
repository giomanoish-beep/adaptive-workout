# Adaptive Workout Android APK

Adaptive Workout ships as a Capacitor application that bundles the existing
Vite web client in a native Android shell. The APK does not embed a Supabase
service-role key or an AI-provider key. It uses the same public Supabase URL and
anonymous key as the production web client, while privileged and AI work stays
behind the existing authenticated Supabase Edge Functions.

## Supported Android configuration

- Application ID: `com.adaptiveworkout.app`
- Version: `1.0` (`versionCode` 1)
- Minimum Android SDK: 24
- Target and compile Android SDK: 36
- Primary physical test device: Samsung Galaxy A14 5G, Android 15 / One UI 7

Targeting SDK 36 keeps the package compatible with Android 15 and provides a
forward-looking target for later OS updates. A new Android major version still
requires a fresh physical smoke test and normal dependency/target-SDK review.

## Local prerequisites

Use the free Android tooling:

1. Android Studio and Android SDK Platform 36.
2. Android SDK Build Tools 36.0.0 and Platform Tools.
3. JDK 21 LTS. Gradle 8.14 does not run on the JDK 25 bundled with the current
   Android Studio release.
4. Repository dependencies installed with `npm ci`.
5. The normal public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` build
   configuration. Never add a service-role key, DeepSeek key, signing password,
   or another secret to a Vite variable.

On this workstation the SDK is stored under the ignored `.tools/android-sdk`
directory. The build script also honors `ANDROID_SDK_ROOT`, `ANDROID_HOME`, and
`JAVA_HOME` when they are set.

## Signing material

Release builds read signing configuration from:

`%USERPROFILE%/.adaptive-workout/signing.properties`

The properties file points to the release keystore and contains
`storePassword`, `keyAlias`, and `keyPassword`. Both files are outside the
repository, and `*.jks`, `*.keystore`, and signing/build artifacts are ignored.

Back up the keystore and credentials in a secure password manager or encrypted
backup before distributing the APK. Every future update to the installed app
must be signed by the same key. Losing it prevents an in-place update.

## Reproducible commands

```text
npm run android:build:debug
npm run android:test:device
npm run android:build
```

`android:build:debug` and `android:build` perform the production web build,
Capacitor synchronization, Android lint, Gradle unit tasks, and APK assembly.
The release command also requires the external signing properties. Artifacts
are written to the ignored `artifacts/` directory with an adjacent SHA-256
file.

`android:test:device` expects one booted emulator or connected Android device
and runs only the app's `:app:connectedDebugAndroidTest` task.

Before sharing a release APK, verify it with Android SDK tools:

```text
apksigner verify --verbose --print-certs artifacts/adaptive-workout-1.0-release.apk
aapt dump badging artifacts/adaptive-workout-1.0-release.apk
```

## Galaxy A14 installation

Direct APK installation is free and does not require a store account.

1. Copy `adaptive-workout-1.0-release.apk` to the phone without renaming or
   modifying it.
2. Compare its SHA-256 with the adjacent `.sha256` file.
3. Open the APK from My Files. Android may ask for permission to install unknown
   apps for that file source; enable it only for the installation source you
   deliberately used.
4. Install the app and confirm Android identifies it as **Adaptive Workout**.
5. Disable the unknown-app permission again if it is no longer needed.

Alternatively, with USB debugging explicitly enabled on the phone:

```text
adb install -r artifacts/adaptive-workout-1.0-release.apk
```

## Physical production checklist

Record pass/fail and any screenshot or exact error for each item.

### Installation and shell

- The APK installs without a signature or compatibility warning.
- The launcher icon and app name are correct.
- Cold launch shows the branded splash and then the sign-in screen.
- Portrait layout has no clipping, overlap, or horizontal scroll.
- Status bar, navigation bar, display cutout, and software keyboard do not hide
  controls.
- The Android Back button returns within the app when a prior app screen exists.
- Android Back at the root minimizes the app instead of destroying the session.

### Production OTP and session

- Requesting sign-in sends a numeric six-digit email code, not a magic link.
- The email template uses `{{ .Token }}` and not `{{ .ConfirmationURL }}`.
- Invalid, expired, and rate-limited codes show safe visible errors.
- Resend cooldown and duplicate-click protection behave correctly.
- A valid code signs in once and opens the authenticated app.
- Background/foreground, task switching, screen lock, and normal app relaunch
  preserve or restore the Supabase session.
- A device reboot followed by app launch restores the session without sending a
  new OTP.

### Workout flows

- Onboarding and profile data load from Supabase.
- A custom workout can be generated for 30, 45, 60, 75, and 90 minutes, and the
  displayed estimate is truthful for the returned workout.
- Equipment and requested muscles affect the result as expected.
- Start, set logging, replacement, RIR, weight, finish, and review controls are
  reachable with the keyboard open and closed.
- Leaving and resuming an active workout does not lose already persisted data.
- History and the next launch show the completed workout consistently.

### Network and server boundaries

- Wi-Fi and mobile data both reach Supabase over HTTPS.
- Going offline produces a safe user-facing failure and does not corrupt the
  current workout; reconnecting allows a deliberate retry.
- Authenticated workout generation succeeds through the deployed Edge Function.
- If an AI explanation is present, it is grounded in the deterministic result.
  If DeepSeek is unavailable, deterministic generation still succeeds safely.
- No API key, raw provider response, prompt, stack trace, or internal error is
  visible in the UI.

### Update safety

- Reinstalling a newer APK signed by the same release key updates in place.
- The update preserves the authenticated session and server-persisted data.
- Increase `versionCode` for every distributed update and update `versionName`
  when the user-visible release changes.

## Remaining human gates

Automated and emulator checks cannot replace the physical Galaxy A14 checks,
real production email delivery, real production Supabase/Edge Function calls,
Samsung One UI background behavior, mobile-network transitions, or the final
decision to distribute the APK. These remain deliberate human release gates.
