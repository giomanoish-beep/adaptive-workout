alter table public.profiles
  add column if not exists body_weight_kg numeric(5,1);

alter table public.workout_session_exercises
  add column if not exists planned_load_kind text,
  add column if not exists planned_load_kg numeric(6,2),
  add column if not exists planned_load_label text,
  add column if not exists planned_load_increment numeric(4,1);
--
-- Constraints
--

-- Body weight: positive, plausible human range (30.0–300.0 kg).
alter table public.profiles
  drop constraint if exists profiles_body_weight_kg_valid;
alter table public.profiles
  add constraint profiles_body_weight_kg_valid check (
    body_weight_kg is null
    or (body_weight_kg >= 30 and body_weight_kg <= 300)
  );

-- Planned load kind: controlled vocabulary.
alter table public.workout_session_exercises
  drop constraint if exists workout_session_exercises_load_kind_valid;
alter table public.workout_session_exercises
  add constraint workout_session_exercises_load_kind_valid check (
    planned_load_kind is null
    or planned_load_kind in ('external_numeric', 'bodyweight', 'unloaded_bar', 'calibration_required')
  );

-- Planned load kg: non-negative when present.
alter table public.workout_session_exercises
  drop constraint if exists workout_session_exercises_load_kg_nonneg;
alter table public.workout_session_exercises
  add constraint workout_session_exercises_load_kg_nonneg check (
    planned_load_kg is null or planned_load_kg >= 0
  );

-- Planned load increment: positive when present.
alter table public.workout_session_exercises
  drop constraint if exists workout_session_exercises_load_increment_positive;
alter table public.workout_session_exercises
  add constraint workout_session_exercises_load_increment_positive check (
    planned_load_increment is null or planned_load_increment > 0
  );

-- Consistency: external_numeric must carry a non-null numeric load;
-- bodyweight / calibration_required must not carry one.
alter table public.workout_session_exercises
  drop constraint if exists workout_session_exercises_load_kind_kg_consistent;
alter table public.workout_session_exercises
  add constraint workout_session_exercises_load_kind_kg_consistent check (
    planned_load_kind is null
    or (planned_load_kind = 'external_numeric' and planned_load_kg is not null)
    or (planned_load_kind in ('bodyweight', 'unloaded_bar', 'calibration_required') and planned_load_kg is null)
  );
