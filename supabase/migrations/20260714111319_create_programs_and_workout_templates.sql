create table public.programs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users (id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programs_slug_valid check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint programs_name_valid check (char_length(btrim(name)) between 1 and 160),
  constraint programs_description_valid check (
    description is null
    or char_length(btrim(description)) between 1 and 2000
  ),
  constraint programs_version_positive check (version > 0),
  constraint programs_timestamps_ordered check (updated_at >= created_at)
);

create table public.program_workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  position integer not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_workouts_program_position_unique unique (program_id, position),
  constraint program_workouts_position_positive check (position > 0),
  constraint program_workouts_name_valid check (char_length(btrim(name)) between 1 and 160),
  constraint program_workouts_description_valid check (
    description is null
    or char_length(btrim(description)) between 1 and 2000
  ),
  constraint program_workouts_timestamps_ordered check (updated_at >= created_at)
);

create table public.program_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  program_workout_id uuid not null references public.program_workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position integer not null,
  target_sets integer not null,
  target_reps_min integer not null,
  target_reps_max integer not null,
  target_rir numeric(3, 1),
  rest_seconds integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_workout_exercises_workout_position_unique unique (
    program_workout_id,
    position
  ),
  constraint program_workout_exercises_position_positive check (position > 0),
  constraint program_workout_exercises_target_sets_positive check (target_sets > 0),
  constraint program_workout_exercises_target_reps_valid check (
    target_reps_min > 0
    and target_reps_max >= target_reps_min
  ),
  constraint program_workout_exercises_target_rir_valid check (
    target_rir is null
    or target_rir between 0 and 10
  ),
  constraint program_workout_exercises_rest_seconds_valid check (
    rest_seconds is null
    or rest_seconds >= 0
  ),
  constraint program_workout_exercises_notes_valid check (
    notes is null
    or char_length(btrim(notes)) between 1 and 1000
  ),
  constraint program_workout_exercises_timestamps_ordered check (updated_at >= created_at)
);

create unique index programs_system_slug_version_unique_idx
on public.programs (slug, version)
where owner_user_id is null;

create unique index programs_user_slug_version_unique_idx
on public.programs (owner_user_id, slug, version)
where owner_user_id is not null;

create unique index programs_active_system_slug_unique_idx
on public.programs (slug)
where owner_user_id is null and is_active;

create unique index programs_active_user_slug_unique_idx
on public.programs (owner_user_id, slug)
where owner_user_id is not null and is_active;

create index programs_owner_user_id_idx on public.programs (owner_user_id)
where owner_user_id is not null;

create index program_workout_exercises_exercise_id_idx
on public.program_workout_exercises (exercise_id);

create trigger programs_set_updated_at
before update on public.programs
for each row execute function public.set_updated_at();

create trigger program_workouts_set_updated_at
before update on public.program_workouts
for each row execute function public.set_updated_at();

create trigger program_workout_exercises_set_updated_at
before update on public.program_workout_exercises
for each row execute function public.set_updated_at();

alter table public.programs enable row level security;
alter table public.program_workouts enable row level security;
alter table public.program_workout_exercises enable row level security;

create policy programs_select_authenticated
on public.programs
for select
to authenticated
using (
  (owner_user_id is null and is_active)
  or owner_user_id = (select auth.uid())
);

create policy programs_insert_owned
on public.programs
for insert
to authenticated
with check (owner_user_id = (select auth.uid()));

create policy programs_update_owned
on public.programs
for update
to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

create policy programs_delete_owned
on public.programs
for delete
to authenticated
using (owner_user_id = (select auth.uid()));

create policy program_workouts_select_authenticated
on public.program_workouts
for select
to authenticated
using (
  exists (
    select 1
    from public.programs
    where programs.id = program_workouts.program_id
      and (
        (programs.owner_user_id is null and programs.is_active)
        or programs.owner_user_id = (select auth.uid())
      )
  )
);

create policy program_workouts_insert_owned
on public.program_workouts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.programs
    where programs.id = program_workouts.program_id
      and programs.owner_user_id = (select auth.uid())
  )
);

create policy program_workouts_update_owned
on public.program_workouts
for update
to authenticated
using (
  exists (
    select 1
    from public.programs
    where programs.id = program_workouts.program_id
      and programs.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.programs
    where programs.id = program_workouts.program_id
      and programs.owner_user_id = (select auth.uid())
  )
);

create policy program_workouts_delete_owned
on public.program_workouts
for delete
to authenticated
using (
  exists (
    select 1
    from public.programs
    where programs.id = program_workouts.program_id
      and programs.owner_user_id = (select auth.uid())
  )
);

create policy program_workout_exercises_select_authenticated
on public.program_workout_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.program_workouts
    join public.programs on programs.id = program_workouts.program_id
    where program_workouts.id = program_workout_exercises.program_workout_id
      and (
        (programs.owner_user_id is null and programs.is_active)
        or programs.owner_user_id = (select auth.uid())
      )
  )
);

create policy program_workout_exercises_insert_owned
on public.program_workout_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.program_workouts
    join public.programs on programs.id = program_workouts.program_id
    where program_workouts.id = program_workout_exercises.program_workout_id
      and programs.owner_user_id = (select auth.uid())
  )
);

create policy program_workout_exercises_update_owned
on public.program_workout_exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.program_workouts
    join public.programs on programs.id = program_workouts.program_id
    where program_workouts.id = program_workout_exercises.program_workout_id
      and programs.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.program_workouts
    join public.programs on programs.id = program_workouts.program_id
    where program_workouts.id = program_workout_exercises.program_workout_id
      and programs.owner_user_id = (select auth.uid())
  )
);

create policy program_workout_exercises_delete_owned
on public.program_workout_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.program_workouts
    join public.programs on programs.id = program_workouts.program_id
    where program_workouts.id = program_workout_exercises.program_workout_id
      and programs.owner_user_id = (select auth.uid())
  )
);

revoke all on table public.programs from anon;
revoke all on table public.program_workouts from anon;
revoke all on table public.program_workout_exercises from anon;

grant select, insert, update, delete on table public.programs to authenticated;
grant select, insert, update, delete on table public.program_workouts to authenticated;
grant select, insert, update, delete on table public.program_workout_exercises to authenticated;
