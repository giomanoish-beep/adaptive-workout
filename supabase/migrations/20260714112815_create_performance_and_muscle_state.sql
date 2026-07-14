create table public.exercise_performance_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  source_watermark_set_log_id uuid not null references public.set_logs (id) on delete cascade,
  source_window_started_at timestamptz not null,
  source_window_ended_at timestamptz not null,
  source_watermark_at timestamptz not null,
  last_exposure_at timestamptz not null,
  completed_exposure_count integer not null,
  last_weight numeric(10, 3),
  last_weight_unit text,
  last_reps integer,
  last_rir numeric(3, 1),
  engine_version text not null,
  rule_set_version text not null,
  calculated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_performance_state_user_exercise_unique unique (user_id, exercise_id),
  constraint exercise_performance_state_source_window_valid check (
    source_window_ended_at >= source_window_started_at
  ),
  constraint exercise_performance_state_watermark_valid check (
    source_watermark_at between source_window_started_at and source_window_ended_at
    and last_exposure_at between source_window_started_at and source_watermark_at
    and calculated_at >= source_watermark_at
  ),
  constraint exercise_performance_state_exposure_count_positive check (
    completed_exposure_count > 0
  ),
  constraint exercise_performance_state_weight_valid check (
    (last_weight is null and last_weight_unit is null)
    or (
      last_weight is not null
      and last_weight >= 0
      and last_weight_unit is not null
      and last_weight_unit in ('kg', 'lb')
    )
  ),
  constraint exercise_performance_state_reps_valid check (
    last_reps is null
    or last_reps >= 0
  ),
  constraint exercise_performance_state_rir_valid check (
    last_rir is null
    or last_rir between 0 and 10
  ),
  constraint exercise_performance_state_engine_version_valid check (
    char_length(btrim(engine_version)) between 1 and 64
  ),
  constraint exercise_performance_state_rule_set_version_valid check (
    char_length(btrim(rule_set_version)) between 1 and 64
  ),
  constraint exercise_performance_state_timestamps_ordered check (
    updated_at >= created_at
  )
);

create table public.muscle_training_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  muscle_id uuid not null references public.muscles (id) on delete restrict,
  source_watermark_set_log_id uuid not null references public.set_logs (id) on delete cascade,
  source_window_started_at timestamptz not null,
  source_window_ended_at timestamptz not null,
  source_watermark_at timestamptz not null,
  weighted_set_count numeric(12, 3) not null,
  volume_load numeric(16, 3),
  fatigue_score numeric(12, 4),
  last_trained_at timestamptz,
  engine_version text not null,
  rule_set_version text not null,
  calculated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint muscle_training_state_user_muscle_window_unique unique (
    user_id,
    muscle_id,
    source_window_started_at,
    source_window_ended_at
  ),
  constraint muscle_training_state_source_window_valid check (
    source_window_ended_at >= source_window_started_at
  ),
  constraint muscle_training_state_watermark_valid check (
    source_watermark_at between source_window_started_at and source_window_ended_at
    and calculated_at >= source_watermark_at
  ),
  constraint muscle_training_state_last_trained_at_valid check (
    last_trained_at is null
    or last_trained_at between source_window_started_at and source_watermark_at
  ),
  constraint muscle_training_state_weighted_set_count_valid check (
    weighted_set_count >= 0
  ),
  constraint muscle_training_state_volume_load_valid check (
    volume_load is null
    or volume_load >= 0
  ),
  constraint muscle_training_state_fatigue_score_valid check (
    fatigue_score is null
    or fatigue_score >= 0
  ),
  constraint muscle_training_state_engine_version_valid check (
    char_length(btrim(engine_version)) between 1 and 64
  ),
  constraint muscle_training_state_rule_set_version_valid check (
    char_length(btrim(rule_set_version)) between 1 and 64
  ),
  constraint muscle_training_state_timestamps_ordered check (
    updated_at >= created_at
  )
);

create index exercise_performance_state_user_calculated_at_idx
on public.exercise_performance_state (user_id, calculated_at desc);

create index exercise_performance_state_exercise_id_idx
on public.exercise_performance_state (exercise_id);

create index exercise_performance_state_source_watermark_set_log_id_idx
on public.exercise_performance_state (source_watermark_set_log_id);

create index muscle_training_state_user_calculated_at_idx
on public.muscle_training_state (user_id, calculated_at desc);

create index muscle_training_state_user_muscle_window_end_idx
on public.muscle_training_state (user_id, muscle_id, source_window_ended_at desc);

create index muscle_training_state_muscle_id_idx
on public.muscle_training_state (muscle_id);

create index muscle_training_state_source_watermark_set_log_id_idx
on public.muscle_training_state (source_watermark_set_log_id);

create trigger exercise_performance_state_set_updated_at
before update on public.exercise_performance_state
for each row execute function public.set_updated_at();

create trigger muscle_training_state_set_updated_at
before update on public.muscle_training_state
for each row execute function public.set_updated_at();

alter table public.exercise_performance_state enable row level security;
alter table public.muscle_training_state enable row level security;

create policy exercise_performance_state_select_owned
on public.exercise_performance_state
for select
to authenticated
using (user_id = (select auth.uid()));

create policy muscle_training_state_select_owned
on public.muscle_training_state
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.exercise_performance_state from anon;
revoke all on table public.muscle_training_state from anon;
revoke all on table public.exercise_performance_state from authenticated;
revoke all on table public.muscle_training_state from authenticated;

grant select on table public.exercise_performance_state to authenticated;
grant select on table public.muscle_training_state to authenticated;
