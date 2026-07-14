create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_program_workout_id uuid references public.program_workouts (id) on delete set null,
  origin text not null,
  status text not null default 'planned',
  planned_for timestamptz,
  planned_duration_minutes integer,
  source_program_slug text,
  source_program_version integer,
  source_program_workout_name text,
  workout_engine_version text,
  workout_rule_set_version text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_sessions_origin_valid check (
    origin in ('programmed', 'generated', 'custom', 'adapted')
  ),
  constraint workout_sessions_status_valid check (
    status in ('planned', 'in_progress', 'completed', 'abandoned')
  ),
  constraint workout_sessions_planned_duration_valid check (
    planned_duration_minutes is null
    or planned_duration_minutes > 0
  ),
  constraint workout_sessions_source_program_slug_valid check (
    source_program_slug is null
    or source_program_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint workout_sessions_source_program_version_valid check (
    source_program_version is null
    or source_program_version > 0
  ),
  constraint workout_sessions_source_program_workout_name_valid check (
    source_program_workout_name is null
    or char_length(btrim(source_program_workout_name)) between 1 and 160
  ),
  constraint workout_sessions_engine_version_valid check (
    workout_engine_version is null
    or char_length(btrim(workout_engine_version)) between 1 and 64
  ),
  constraint workout_sessions_rule_set_version_valid check (
    workout_rule_set_version is null
    or char_length(btrim(workout_rule_set_version)) between 1 and 64
  ),
  constraint workout_sessions_lifecycle_valid check (
    (status = 'planned' and started_at is null and completed_at is null)
    or (status = 'in_progress' and started_at is not null and completed_at is null)
    or (status = 'completed' and started_at is not null and completed_at is not null)
    or (status = 'abandoned' and completed_at is null)
  ),
  constraint workout_sessions_completion_order_valid check (
    completed_at is null
    or completed_at >= started_at
  ),
  constraint workout_sessions_timestamps_ordered check (updated_at >= created_at)
);

create table public.workout_session_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions (id) on delete cascade,
  planned_exercise_id uuid not null references public.exercises (id) on delete restrict,
  performed_exercise_id uuid references public.exercises (id) on delete restrict,
  position integer not null,
  status text not null default 'planned',
  planned_exercise_name text not null,
  planned_exercise_version integer not null,
  performed_exercise_name text,
  performed_exercise_version integer,
  planned_sets integer not null,
  planned_reps_min integer,
  planned_reps_max integer,
  planned_rir numeric(3, 1),
  planned_rest_seconds integer,
  substitution_reason_code text,
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_session_exercises_session_position_unique unique (
    workout_session_id,
    position
  ),
  constraint workout_session_exercises_position_positive check (position > 0),
  constraint workout_session_exercises_status_valid check (
    status in ('planned', 'in_progress', 'completed', 'skipped')
  ),
  constraint workout_session_exercises_planned_name_valid check (
    char_length(btrim(planned_exercise_name)) between 1 and 160
  ),
  constraint workout_session_exercises_planned_version_valid check (
    planned_exercise_version > 0
  ),
  constraint workout_session_exercises_performed_snapshot_valid check (
    (
      performed_exercise_id is null
      and performed_exercise_name is null
      and performed_exercise_version is null
    )
    or (
      performed_exercise_id is not null
      and performed_exercise_name is not null
      and performed_exercise_version is not null
      and char_length(btrim(performed_exercise_name)) between 1 and 160
      and performed_exercise_version > 0
    )
  ),
  constraint workout_session_exercises_planned_sets_positive check (planned_sets > 0),
  constraint workout_session_exercises_planned_reps_valid check (
    (planned_reps_min is null and planned_reps_max is null)
    or (
      planned_reps_min is not null
      and planned_reps_max is not null
      and planned_reps_min > 0
      and planned_reps_max >= planned_reps_min
    )
  ),
  constraint workout_session_exercises_planned_rir_valid check (
    planned_rir is null
    or planned_rir between 0 and 10
  ),
  constraint workout_session_exercises_planned_rest_valid check (
    planned_rest_seconds is null
    or planned_rest_seconds >= 0
  ),
  constraint workout_session_exercises_substitution_valid check (
    (
      performed_exercise_id is null
      and substitution_reason_code is null
    )
    or (
      performed_exercise_id is not null
      and performed_exercise_id = planned_exercise_id
      and substitution_reason_code is null
    )
    or (
      performed_exercise_id is not null
      and performed_exercise_id <> planned_exercise_id
      and substitution_reason_code is not null
      and substitution_reason_code ~ '^[a-z][a-z0-9_]{0,63}$'
    )
  ),
  constraint workout_session_exercises_lifecycle_valid check (
    (
      status = 'planned'
      and performed_exercise_id is null
      and started_at is null
      and completed_at is null
      and skipped_at is null
    )
    or (
      status = 'in_progress'
      and performed_exercise_id is not null
      and started_at is not null
      and completed_at is null
      and skipped_at is null
    )
    or (
      status = 'completed'
      and performed_exercise_id is not null
      and started_at is not null
      and completed_at is not null
      and skipped_at is null
    )
    or (
      status = 'skipped'
      and performed_exercise_id is null
      and started_at is null
      and completed_at is null
      and skipped_at is not null
    )
  ),
  constraint workout_session_exercises_completion_order_valid check (
    completed_at is null
    or completed_at >= started_at
  ),
  constraint workout_session_exercises_timestamps_ordered check (updated_at >= created_at)
);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_session_exercise_id uuid not null references public.workout_session_exercises (id) on delete cascade,
  set_number integer not null,
  set_type text not null,
  status text not null default 'pending',
  weight numeric(10, 3),
  weight_unit text,
  reps integer,
  rir numeric(3, 1),
  performed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint set_logs_exercise_set_number_unique unique (
    workout_session_exercise_id,
    set_number
  ),
  constraint set_logs_set_number_positive check (set_number > 0),
  constraint set_logs_set_type_valid check (set_type in ('warm_up', 'working')),
  constraint set_logs_status_valid check (status in ('pending', 'completed', 'skipped')),
  constraint set_logs_weight_valid check (weight is null or weight >= 0),
  constraint set_logs_weight_unit_valid check (
    (weight is null and weight_unit is null)
    or (
      weight is not null
      and weight_unit is not null
      and weight_unit in ('kg', 'lb')
    )
  ),
  constraint set_logs_reps_valid check (reps is null or reps >= 0),
  constraint set_logs_rir_valid check (rir is null or rir between 0 and 10),
  constraint set_logs_lifecycle_valid check (
    (
      status = 'pending'
      and weight is null
      and weight_unit is null
      and reps is null
      and rir is null
      and performed_at is null
      and skipped_at is null
    )
    or (
      status = 'completed'
      and performed_at is not null
      and skipped_at is null
    )
    or (
      status = 'skipped'
      and weight is null
      and weight_unit is null
      and reps is null
      and rir is null
      and performed_at is null
      and skipped_at is not null
    )
  ),
  constraint set_logs_timestamps_ordered check (updated_at >= created_at)
);

create index workout_sessions_user_started_at_idx
on public.workout_sessions (user_id, started_at desc nulls last, created_at desc);

create index workout_sessions_user_status_planned_for_idx
on public.workout_sessions (user_id, status, planned_for);

create index workout_sessions_user_completed_at_idx
on public.workout_sessions (user_id, completed_at desc)
where status = 'completed';

create index workout_sessions_source_program_workout_id_idx
on public.workout_sessions (source_program_workout_id)
where source_program_workout_id is not null;

create index workout_session_exercises_planned_exercise_id_idx
on public.workout_session_exercises (planned_exercise_id);

create index workout_session_exercises_performed_exercise_id_idx
on public.workout_session_exercises (performed_exercise_id)
where performed_exercise_id is not null;

create index workout_session_exercises_completed_exposure_idx
on public.workout_session_exercises (
  performed_exercise_id,
  completed_at desc,
  workout_session_id
)
where status = 'completed';

create index workout_session_exercises_substitution_lineage_idx
on public.workout_session_exercises (planned_exercise_id, performed_exercise_id)
where performed_exercise_id is not null
  and performed_exercise_id <> planned_exercise_id;

create index set_logs_completed_timeline_idx
on public.set_logs (workout_session_exercise_id, performed_at)
where status = 'completed';

create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row execute function public.set_updated_at();

create trigger workout_session_exercises_set_updated_at
before update on public.workout_session_exercises
for each row execute function public.set_updated_at();

create trigger set_logs_set_updated_at
before update on public.set_logs
for each row execute function public.set_updated_at();

alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;
alter table public.set_logs enable row level security;

create policy workout_sessions_select_owned
on public.workout_sessions
for select
to authenticated
using (user_id = (select auth.uid()));

create policy workout_sessions_insert_owned
on public.workout_sessions
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy workout_sessions_update_owned
on public.workout_sessions
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy workout_sessions_delete_owned
on public.workout_sessions
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy workout_session_exercises_select_owned
on public.workout_session_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions
    where workout_sessions.id = workout_session_exercises.workout_session_id
      and workout_sessions.user_id = (select auth.uid())
  )
);

create policy workout_session_exercises_insert_owned
on public.workout_session_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_sessions
    where workout_sessions.id = workout_session_exercises.workout_session_id
      and workout_sessions.user_id = (select auth.uid())
  )
);

create policy workout_session_exercises_update_owned
on public.workout_session_exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions
    where workout_sessions.id = workout_session_exercises.workout_session_id
      and workout_sessions.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.workout_sessions
    where workout_sessions.id = workout_session_exercises.workout_session_id
      and workout_sessions.user_id = (select auth.uid())
  )
);

create policy workout_session_exercises_delete_owned
on public.workout_session_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions
    where workout_sessions.id = workout_session_exercises.workout_session_id
      and workout_sessions.user_id = (select auth.uid())
  )
);

create policy set_logs_select_owned
on public.set_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_session_exercises
    join public.workout_sessions
      on workout_sessions.id = workout_session_exercises.workout_session_id
    where workout_session_exercises.id = set_logs.workout_session_exercise_id
      and workout_sessions.user_id = (select auth.uid())
  )
);

create policy set_logs_insert_owned
on public.set_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_session_exercises
    join public.workout_sessions
      on workout_sessions.id = workout_session_exercises.workout_session_id
    where workout_session_exercises.id = set_logs.workout_session_exercise_id
      and workout_sessions.user_id = (select auth.uid())
  )
);

create policy set_logs_update_owned
on public.set_logs
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_session_exercises
    join public.workout_sessions
      on workout_sessions.id = workout_session_exercises.workout_session_id
    where workout_session_exercises.id = set_logs.workout_session_exercise_id
      and workout_sessions.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.workout_session_exercises
    join public.workout_sessions
      on workout_sessions.id = workout_session_exercises.workout_session_id
    where workout_session_exercises.id = set_logs.workout_session_exercise_id
      and workout_sessions.user_id = (select auth.uid())
  )
);

create policy set_logs_delete_owned
on public.set_logs
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_session_exercises
    join public.workout_sessions
      on workout_sessions.id = workout_session_exercises.workout_session_id
    where workout_session_exercises.id = set_logs.workout_session_exercise_id
      and workout_sessions.user_id = (select auth.uid())
  )
);

revoke all on table public.workout_sessions from anon;
revoke all on table public.workout_session_exercises from anon;
revoke all on table public.set_logs from anon;

grant select, insert, update, delete on table public.workout_sessions to authenticated;
grant select, insert, update, delete on table public.workout_session_exercises to authenticated;
grant select, insert, update, delete on table public.set_logs to authenticated;
