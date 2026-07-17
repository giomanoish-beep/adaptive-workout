-- Forward-only migration: support insufficient-data exercise_performance_state rows.
-- V1-004 needs to persist an explicit insufficient-data status when a user has no usable
-- history for an exercise. The current schema requires a watermark set_log_id and a
-- positive exposure count, which prevents representing this state cleanly.
--
-- Changes:
--  1. Add status column (active | insufficient_data)
--  2. Relax source_watermark_set_log_id to nullable (null for insufficient_data)
--  3. Relax completed_exposure_count to allow 0
--  4. Make source-window timestamp columns nullable
--  5. Add CHECK constraints so active rows keep existing invariants and
--     insufficient_data rows cannot carry performance data
--  6. Grant server-write: service_role may insert/update/delete so the Edge Function
--     can write derived state. Authenticated users remain read-only.

alter table public.exercise_performance_state
  add column status text not null default 'active'
    check (status in ('active', 'insufficient_data'));

alter table public.exercise_performance_state
  alter column source_watermark_set_log_id drop not null;

alter table public.exercise_performance_state
  drop constraint if exists exercise_performance_state_exposure_count_positive;

alter table public.exercise_performance_state
  add constraint exercise_performance_state_exposure_count_non_negative
    check (completed_exposure_count >= 0);

alter table public.exercise_performance_state
  alter column source_window_started_at drop not null;

alter table public.exercise_performance_state
  alter column source_window_ended_at drop not null;

alter table public.exercise_performance_state
  alter column source_watermark_at drop not null;

alter table public.exercise_performance_state
  alter column last_exposure_at drop not null;

-- When status = 'active' all source-window fields must be present and watermark valid.
-- When status = 'insufficient_data' none of the performance-carrying columns may have values.
alter table public.exercise_performance_state
  add constraint exercise_performance_state_active_requires_window
    check (
      (status = 'active' and
       source_watermark_set_log_id is not null and
       source_window_started_at is not null and
       source_window_ended_at is not null and
       source_watermark_at is not null and
       last_exposure_at is not null and
       source_window_ended_at >= source_window_started_at and
       source_watermark_at between source_window_started_at and source_window_ended_at and
       last_exposure_at between source_window_started_at and source_watermark_at and
       calculated_at >= source_watermark_at and
       completed_exposure_count > 0)
      or
      (status = 'insufficient_data' and
       source_watermark_set_log_id is null and
       source_window_started_at is null and
       source_window_ended_at is null and
       source_watermark_at is null and
       last_exposure_at is null and
       completed_exposure_count = 0 and
       last_weight is null and
       last_weight_unit is null and
       last_reps is null and
       last_rir is null)
    );

-- Service role may write derived state (Edge Function needs this).
-- Authenticated users remain read-only (existing policy already denies insert/update/delete).
grant insert, update, delete on table public.exercise_performance_state to service_role;

-- Also grant service_role access to workout_decisions for progression audit persistence.
grant insert on table public.workout_decisions to service_role;