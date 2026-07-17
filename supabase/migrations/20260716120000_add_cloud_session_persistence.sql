-- CLOUD-002: Persist workout sessions and set logs
-- Forward-only migration. Do not edit historical migrations.

-- 1. Add title column to workout_sessions for workout name snapshot
alter table public.workout_sessions
  add column if not exists title text;

-- 2. Add 'partial' status for explicitly finished workouts with incomplete sets
alter table public.workout_sessions
  drop constraint if exists workout_sessions_status_valid;

alter table public.workout_sessions
  add constraint workout_sessions_status_valid check (
    status in ('planned', 'in_progress', 'completed', 'partial', 'abandoned')
  );

-- Update lifecycle constraint to allow partial status
alter table public.workout_sessions
  drop constraint if exists workout_sessions_lifecycle_valid;

alter table public.workout_sessions
  add constraint workout_sessions_lifecycle_valid check (
    (status = 'planned' and started_at is null and completed_at is null)
    or (status = 'in_progress' and started_at is not null and completed_at is null)
    or (status = 'completed' and started_at is not null and completed_at is not null)
    or (status = 'partial' and started_at is not null and completed_at is not null)
    or (status = 'abandoned' and completed_at is null)
  );

-- 3. Make planned_exercise_id nullable to support fixture-based snapshots
-- without canonical database exercise UUIDs (CLOUD-002 temporary integration limitation)
alter table public.workout_session_exercises
  alter column planned_exercise_id drop not null;

-- Make planned_exercise_version nullable when exercise_id is null
alter table public.workout_session_exercises
  alter column planned_exercise_version drop not null;

-- Drop the constraint that requires version > 0; replace with conditional constraint
alter table public.workout_session_exercises
  drop constraint if exists workout_session_exercises_planned_version_valid;

alter table public.workout_session_exercises
  add constraint workout_session_exercises_planned_version_valid check (
    (planned_exercise_id is null and planned_exercise_version is null)
    or (planned_exercise_id is not null and planned_exercise_version is not null and planned_exercise_version > 0)
  );

-- Drop the constraint that requires exercise names always; now only required when exercise_id is present
-- The existing constraint workout_session_exercises_planned_name_valid already enforces char_length 1-160,
-- keep it as-is since we always snapshot the name.

-- 4. Change set_logs.rir from numeric(3,1) to integer for consistency with domain validation
alter table public.set_logs
  alter column rir type integer using (case when rir is null then null else round(rir)::integer end);

-- Drop and recreate the RIR constraint for integer type
alter table public.set_logs
  drop constraint if exists set_logs_rir_valid;

alter table public.set_logs
  add constraint set_logs_rir_valid check (rir is null or rir between 0 and 10);

-- 5. Add non-negative integer reps constraint (strengthen existing check)
alter table public.set_logs
  drop constraint if exists set_logs_reps_valid;

alter table public.set_logs
  add constraint set_logs_reps_valid check (
    reps is null
    or (reps >= 0 and reps = floor(reps))
  );

-- 6. Add set_logs reference to session for direct query convenience (RPC alternative not needed)
-- The existing join path through workout_session_exercises is sufficient.

-- 7. Add index for active session lookup (most recently started in_progress session per user)
create index if not exists workout_sessions_user_active_idx
  on public.workout_sessions (user_id, started_at desc)
  where status = 'in_progress';