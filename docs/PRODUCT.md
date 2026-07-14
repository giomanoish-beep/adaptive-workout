# Product

## Purpose

`adaptive-workout` is a mobile-first web application that builds and adapts workouts from structured exercise data, user goals, time, equipment, history, preferences, and reported discomfort.

## Product principles

- Supabase is the source of truth for user fitness and workout data.
- Deterministic engines own workout programming, progression, and safety outcomes.
- AI converts language to structured input and explains recorded decisions.
- Every meaningful adaptation is traceable to inputs, rules, and engine versions.
- Discomfort features are conservative and non-diagnostic.

## Core workflows

1. Sign in and maintain training preferences.
2. Select a program or request a workout by muscles, time, and equipment.
3. Review deterministic exercise choices and substitutions.
4. Log sets with load, reps, and RIR.
5. Review history and configurable progression recommendations.
6. Report discomfort, answer missing-information questions, and receive GREEN, ADAPT, or STOP guidance.

## Initial non-goals

- Medical diagnosis or rehabilitation prescriptions.
- Offline-first workout storage.
- Autonomous AI programming decisions.
- Payments, social features, analytics SDKs, or native mobile applications.
