# Database

PostgreSQL in Supabase is authoritative. IDs use UUIDs, timestamps use `timestamptz`, mutable tables include `created_at` and `updated_at`, and database changes are delivered only by migrations. User tables use RLS on `user_id`.

## Ownership model

| Table                        | Ownership and purpose                                                  | Key relationships and deletion                                                                       |
| ---------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `profiles`                   | One user-owned extension of `auth.users`                               | PK/FK `id -> auth.users.id`; delete with auth user                                                   |
| `muscles`                    | Shared reference taxonomy                                              | Restrict deletion while referenced                                                                   |
| `equipment`                  | Shared reference taxonomy                                              | Restrict deletion while referenced                                                                   |
| `exercise_families`          | Shared movement-pattern grouping                                       | Restrict deletion while exercises exist                                                              |
| `exercises`                  | Shared exercise catalog; supports active/version fields                | Family deletion restricted; prefer deactivation over deletion                                        |
| `exercise_muscles`           | Shared exercise-to-muscle role and contribution                        | Cascade from exercise; restrict muscle deletion                                                      |
| `exercise_equipment`         | Shared required/optional equipment links                               | Cascade from exercise; restrict equipment deletion                                                   |
| `exercise_substitutions`     | Shared directed replacement rules with reason/compatibility data       | Cascade when either exercise is deleted                                                              |
| `programs`                   | Shared curated or user-owned program metadata                          | Owner nullable for shared programs; cascade owned children                                           |
| `program_workouts`           | Ordered workout templates within a program                             | Cascade from program                                                                                 |
| `program_workout_exercises`  | Ordered exercise prescriptions                                         | Cascade from workout; restrict exercise deletion                                                     |
| `workout_sessions`           | User-owned planned/in-progress/completed session                       | Cascade from user; retain snapshot of engine/program version                                         |
| `workout_session_exercises`  | User-owned ordered exercise snapshot and prescription                  | Cascade from session; exercise FK restricted or nullable with snapshot                               |
| `set_logs`                   | User-owned load, reps, RIR, completion data                            | Cascade from session exercise                                                                        |
| `exercise_performance_state` | User-owned computed state per exercise                                 | Cascade from user; restrict exercise deletion; unique user/exercise                                  |
| `muscle_training_state`      | User-owned recent volume/fatigue state per muscle and window           | Cascade from user; restrict muscle deletion; unique user/muscle/window                               |
| `pain_events`                | User-owned non-diagnostic discomfort report and workflow status        | Cascade from user; retain classification/version snapshot                                            |
| `pain_event_observations`    | Structured symptom observations and answers                            | Cascade from pain event                                                                              |
| `pain_exercise_associations` | User-owned historical association between an event and exercise/family | Cascade from event; referenced catalog rows restricted                                               |
| `user_exercise_preferences`  | User-owned preference/avoidance per exercise                           | Cascade from user; restrict exercise deletion; unique user/exercise                                  |
| `workout_decisions`          | User-owned immutable engine audit record                               | Cascade from user; session/event links nullable on parent deletion only if retention policy requires |
| `ai_interactions`            | User-owned AI request metadata, structured contracts, and outcome      | Cascade from user; optional decision/event links set null                                            |

## Important fields and relationships

- Join tables use composite uniqueness to prevent duplicate relationships.
- Catalog rows use stable slugs and `is_active`; historical rows snapshot names and prescriptions needed for display.
- `workout_sessions` may reference a program workout and generation decision, but remains valid if templates later change.
- Session exercises store planned sets, rep range, target RIR, rest, substitution origin, and ordering.
- `set_logs` store set number, weight with unit, reps, RIR, status, and logged time; constraints reject impossible negative values.
- State tables record `calculated_at`, source-window bounds, algorithm version, and source watermark so they can be rebuilt.
- Pain observations use a controlled schema for location, onset, severity, sensation, duration, aggravators, and warning-signal answers; raw wording may be retained separately.
- Decisions store `engine`, `engine_version`, `decision_type`, normalized input, output, reason codes, and trace JSON. They are append-only.
- AI interactions store provider/model, contract version, latency/status, structured request/response, and error category. Secrets and raw credentials are never stored.

## Important indexes

- Unique: catalog slugs; join-table pairs; `(user_id, exercise_id)` preferences/performance state.
- Session history: `(user_id, started_at desc)`, `(user_id, status, planned_for)`.
- Set history: `(workout_session_exercise_id, set_number)` and exercise-history support through session exercise plus completion time.
- State lookup: `(user_id, calculated_at desc)` and unique natural keys including state window.
- Pain workflow: `(user_id, occurred_at desc)`, `(user_id, follow_up_status, next_follow_up_at)`.
- Decisions: `(user_id, created_at desc)`, `(workout_session_id)`, `(pain_event_id)`, `(engine, engine_version)`.
- AI operations: `(user_id, created_at desc)`, `(provider, status, created_at)`.
- Catalog discovery: active/filter indexes for exercise family, muscle joins, and equipment joins; add text search only after query evidence.

## Deletion policy

Account deletion cascades user-owned operational data. Shared catalog rows are normally deactivated, not deleted. Historical session snapshots and audit records follow an explicit retention policy; foreign keys must not silently erase audit evidence. Large JSON payloads require documented retention and redaction rules before production.
