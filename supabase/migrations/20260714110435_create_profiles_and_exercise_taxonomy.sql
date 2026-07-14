create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at = old.created_at;
  new.updated_at = greatest(statement_timestamp(), old.updated_at);
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_valid check (
    display_name is null
    or char_length(btrim(display_name)) between 1 and 100
  ),
  constraint profiles_timestamps_ordered check (updated_at >= created_at)
);

create table public.muscles (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint muscles_slug_unique unique (slug),
  constraint muscles_slug_valid check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint muscles_name_valid check (char_length(btrim(name)) between 1 and 120),
  constraint muscles_description_valid check (
    description is null
    or char_length(btrim(description)) between 1 and 1000
  ),
  constraint muscles_timestamps_ordered check (updated_at >= created_at)
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_slug_unique unique (slug),
  constraint equipment_slug_valid check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint equipment_name_valid check (char_length(btrim(name)) between 1 and 120),
  constraint equipment_description_valid check (
    description is null
    or char_length(btrim(description)) between 1 and 1000
  ),
  constraint equipment_timestamps_ordered check (updated_at >= created_at)
);

create table public.exercise_families (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_families_slug_unique unique (slug),
  constraint exercise_families_slug_valid check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint exercise_families_name_valid check (char_length(btrim(name)) between 1 and 120),
  constraint exercise_families_description_valid check (
    description is null
    or char_length(btrim(description)) between 1 and 1000
  ),
  constraint exercise_families_timestamps_ordered check (updated_at >= created_at)
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  exercise_family_id uuid not null references public.exercise_families (id) on delete restrict,
  slug text not null,
  name text not null,
  description text,
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_slug_unique unique (slug),
  constraint exercises_slug_valid check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint exercises_name_valid check (char_length(btrim(name)) between 1 and 160),
  constraint exercises_description_valid check (
    description is null
    or char_length(btrim(description)) between 1 and 2000
  ),
  constraint exercises_version_positive check (version > 0),
  constraint exercises_timestamps_ordered check (updated_at >= created_at)
);

create table public.exercise_muscles (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  muscle_id uuid not null references public.muscles (id) on delete restrict,
  role text not null,
  contribution numeric(4, 3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_muscles_exercise_muscle_unique unique (exercise_id, muscle_id),
  constraint exercise_muscles_role_valid check (role in ('primary', 'secondary', 'stabilizer')),
  constraint exercise_muscles_contribution_valid check (
    contribution > 0
    and contribution <= 1
  ),
  constraint exercise_muscles_timestamps_ordered check (updated_at >= created_at)
);

create table public.exercise_equipment (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  equipment_id uuid not null references public.equipment (id) on delete restrict,
  requirement text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_equipment_exercise_equipment_unique unique (exercise_id, equipment_id),
  constraint exercise_equipment_requirement_valid check (requirement in ('required', 'optional')),
  constraint exercise_equipment_timestamps_ordered check (updated_at >= created_at)
);

create table public.exercise_substitutions (
  id uuid primary key default gen_random_uuid(),
  source_exercise_id uuid not null references public.exercises (id) on delete cascade,
  substitute_exercise_id uuid not null references public.exercises (id) on delete cascade,
  reason_code text not null,
  compatibility_score numeric(4, 3) not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_substitutions_pair_unique unique (
    source_exercise_id,
    substitute_exercise_id
  ),
  constraint exercise_substitutions_distinct_exercises check (
    source_exercise_id <> substitute_exercise_id
  ),
  constraint exercise_substitutions_reason_code_valid check (
    reason_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint exercise_substitutions_compatibility_score_valid check (
    compatibility_score > 0
    and compatibility_score <= 1
  ),
  constraint exercise_substitutions_notes_valid check (
    notes is null
    or char_length(btrim(notes)) between 1 and 1000
  ),
  constraint exercise_substitutions_timestamps_ordered check (updated_at >= created_at)
);

create index muscles_active_name_idx on public.muscles (name) where is_active;
create index equipment_active_name_idx on public.equipment (name) where is_active;
create index exercise_families_active_name_idx on public.exercise_families (name) where is_active;
create index exercises_exercise_family_id_idx on public.exercises (exercise_family_id);
create index exercises_active_family_name_idx
on public.exercises (exercise_family_id, name)
where is_active;
create index exercise_muscles_muscle_id_idx on public.exercise_muscles (muscle_id);
create index exercise_equipment_equipment_id_idx on public.exercise_equipment (equipment_id);
create index exercise_substitutions_substitute_exercise_id_idx
on public.exercise_substitutions (substitute_exercise_id);
create index exercise_substitutions_active_source_idx
on public.exercise_substitutions (source_exercise_id)
where is_active;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger muscles_set_updated_at
before update on public.muscles
for each row execute function public.set_updated_at();

create trigger equipment_set_updated_at
before update on public.equipment
for each row execute function public.set_updated_at();

create trigger exercise_families_set_updated_at
before update on public.exercise_families
for each row execute function public.set_updated_at();

create trigger exercises_set_updated_at
before update on public.exercises
for each row execute function public.set_updated_at();

create trigger exercise_muscles_set_updated_at
before update on public.exercise_muscles
for each row execute function public.set_updated_at();

create trigger exercise_equipment_set_updated_at
before update on public.exercise_equipment
for each row execute function public.set_updated_at();

create trigger exercise_substitutions_set_updated_at
before update on public.exercise_substitutions
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.muscles enable row level security;
alter table public.equipment enable row level security;
alter table public.exercise_families enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_muscles enable row level security;
alter table public.exercise_equipment enable row level security;
alter table public.exercise_substitutions enable row level security;
