-- V1.2: persistent, versioned multi-week programs and temporary adaptations.
-- Forward-only migration; completed workout history remains untouched.

alter table public.programs
  add column if not exists status text not null default 'active',
  add column if not exists goal text,
  add column if not exists experience_level text,
  add column if not exists start_date date,
  add column if not exists duration_weeks integer,
  add column if not exists training_days integer[],
  add column if not exists split text,
  add column if not exists session_duration_minutes integer,
  add column if not exists engine_version text,
  add column if not exists rule_set_version text,
  add column if not exists current_revision integer not null default 1;

alter table public.programs
  add constraint programs_v12_status_valid check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  add constraint programs_v12_goal_valid check (goal is null or goal in ('build_muscle', 'gain_strength', 'recomposition', 'fat_loss_support')),
  add constraint programs_v12_experience_valid check (experience_level is null or experience_level in ('beginner', 'intermediate', 'advanced')),
  add constraint programs_v12_duration_valid check (duration_weeks is null or duration_weeks in (8, 12, 16)),
  add constraint programs_v12_training_days_valid check (training_days is null or cardinality(training_days) between 2 and 6),
  add constraint programs_v12_session_duration_valid check (session_duration_minutes is null or session_duration_minutes between 15 and 240),
  add constraint programs_v12_revision_positive check (current_revision > 0);

alter table public.program_workouts
  add column if not exists template_key text,
  add column if not exists expected_duration_minutes integer,
  add column if not exists focus_muscles text[] not null default '{}';

alter table public.program_workout_exercises
  add column if not exists movement_pattern text,
  add column if not exists initial_load_kg numeric(10, 3),
  add column if not exists calibration_status text not null default 'calibration_required',
  add column if not exists recommendation_reason text;

alter table public.program_workout_exercises
  add constraint program_workout_exercises_v12_load_valid check (initial_load_kg is null or initial_load_kg >= 0),
  add constraint program_workout_exercises_v12_calibration_valid check (calibration_status in ('calibration_required', 'history_based'));

create table public.program_revisions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  revision integer not null,
  reason_code text not null,
  setup_snapshot jsonb not null,
  generated_snapshot jsonb not null,
  engine_version text not null,
  rule_set_version text not null,
  created_at timestamptz not null default now(),
  constraint program_revisions_unique unique (program_id, revision),
  constraint program_revisions_revision_positive check (revision > 0),
  constraint program_revisions_reason_valid check (reason_code ~ '^[a-z][a-z0-9_]{0,63}$')
);

create table public.program_scheduled_workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  program_revision_id uuid not null references public.program_revisions (id) on delete restrict,
  program_workout_id uuid not null references public.program_workouts (id) on delete restrict,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  schedule_key text not null,
  week_number integer not null,
  scheduled_date date not null,
  original_scheduled_date date not null,
  phase text not null,
  status text not null default 'upcoming',
  is_deload boolean not null default false,
  completed_session_id uuid references public.workout_sessions (id) on delete set null,
  completed_at timestamptz,
  skipped_at timestamptz,
  rescheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_scheduled_workouts_key_unique unique (program_id, schedule_key),
  constraint program_scheduled_workouts_week_valid check (week_number > 0),
  constraint program_scheduled_workouts_phase_valid check (phase in ('foundation', 'build', 'intensification', 'deload')),
  constraint program_scheduled_workouts_status_valid check (status in ('upcoming', 'in_progress', 'completed', 'skipped', 'rescheduled')),
  constraint program_scheduled_workouts_lifecycle_valid check (
    (status in ('upcoming', 'in_progress', 'rescheduled') and completed_at is null and skipped_at is null)
    or (status = 'completed' and completed_at is not null and completed_session_id is not null and skipped_at is null)
    or (status = 'skipped' and skipped_at is not null and completed_at is null and completed_session_id is null)
  )
);

create table public.program_adaptations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  affected_region text not null,
  affected_movement_patterns text[] not null,
  severity text not null,
  start_date date not null,
  review_date date,
  end_date date,
  aggravating_actions text[] not null default '{}',
  reason_codes text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_adaptations_region_valid check (char_length(btrim(affected_region)) between 1 and 120),
  constraint program_adaptations_patterns_valid check (cardinality(affected_movement_patterns) > 0),
  constraint program_adaptations_severity_valid check (severity in ('mild', 'moderate', 'severe')),
  constraint program_adaptations_dates_valid check ((review_date is null or review_date >= start_date) and (end_date is null or end_date >= start_date)),
  constraint program_adaptations_active_valid check ((is_active and end_date is null) or not is_active)
);

create table public.program_session_adaptations (
  id uuid primary key default gen_random_uuid(),
  scheduled_workout_id uuid not null references public.program_scheduled_workouts (id) on delete cascade,
  program_adaptation_id uuid not null references public.program_adaptations (id) on delete cascade,
  base_program_workout_exercise_id uuid not null references public.program_workout_exercises (id) on delete restrict,
  adapted_exercise_id uuid references public.exercises (id) on delete restrict,
  adapted_sets integer,
  adapted_reps_min integer,
  adapted_reps_max integer,
  adapted_target_rir numeric(3, 1),
  adapted_rest_seconds integer,
  reason_codes text[] not null,
  created_at timestamptz not null default now(),
  constraint program_session_adaptations_unique unique (scheduled_workout_id, base_program_workout_exercise_id, program_adaptation_id),
  constraint program_session_adaptations_sets_valid check (adapted_sets is null or adapted_sets > 0),
  constraint program_session_adaptations_reps_valid check ((adapted_reps_min is null and adapted_reps_max is null) or (adapted_reps_min > 0 and adapted_reps_max >= adapted_reps_min)),
  constraint program_session_adaptations_rir_valid check (adapted_target_rir is null or adapted_target_rir between 0 and 10)
);

alter table public.workout_sessions
  add column if not exists scheduled_program_workout_id uuid references public.program_scheduled_workouts (id) on delete set null,
  add column if not exists counts_for_program boolean not null default false;

create index programs_owner_active_v12_idx on public.programs (owner_user_id, status) where status = 'active';
create index program_scheduled_workouts_owner_date_idx on public.program_scheduled_workouts (owner_user_id, scheduled_date, status);
create index program_adaptations_owner_active_idx on public.program_adaptations (owner_user_id, is_active) where is_active;

create trigger program_scheduled_workouts_set_updated_at before update on public.program_scheduled_workouts for each row execute function public.set_updated_at();
create trigger program_adaptations_set_updated_at before update on public.program_adaptations for each row execute function public.set_updated_at();

alter table public.program_revisions enable row level security;
alter table public.program_scheduled_workouts enable row level security;
alter table public.program_adaptations enable row level security;
alter table public.program_session_adaptations enable row level security;

create policy program_revisions_owned on public.program_revisions for all to authenticated
  using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy program_scheduled_workouts_owned on public.program_scheduled_workouts for all to authenticated
  using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy program_adaptations_owned on public.program_adaptations for all to authenticated
  using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy program_session_adaptations_owned on public.program_session_adaptations for all to authenticated
  using (exists (select 1 from public.program_scheduled_workouts s where s.id = scheduled_workout_id and s.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.program_scheduled_workouts s where s.id = scheduled_workout_id and s.owner_user_id = (select auth.uid())));

revoke all on public.program_revisions, public.program_scheduled_workouts, public.program_adaptations, public.program_session_adaptations from anon;
grant select, insert on public.program_revisions to authenticated;
grant select, insert, update on public.program_scheduled_workouts, public.program_adaptations, public.program_session_adaptations to authenticated;

-- Completed scheduled-workout history may not be rewritten by browser clients.
create or replace function public.protect_resolved_scheduled_workout()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status in ('completed', 'skipped') then
    raise exception 'Resolved scheduled workouts are immutable';
  end if;
  return new;
end;
$$;

create trigger protect_resolved_scheduled_workout_before_update
before update on public.program_scheduled_workouts
for each row execute function public.protect_resolved_scheduled_workout();
