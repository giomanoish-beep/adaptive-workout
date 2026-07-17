-- V1-001: Add training profile fields to the profiles table.
-- Forward-only migration. Do not edit historical migrations.

-- 1. Add training profile columns
alter table public.profiles
  add column if not exists goal text,
  add column if not exists experience text,
  add column if not exists training_frequency text,
  add column if not exists typical_duration_minutes integer,
  add column if not exists training_environment text,
  add column if not exists program_preference text,
  add column if not exists has_current_discomfort boolean,
  add column if not exists onboarding_completed boolean not null default false;

-- 2. Add check constraints for controlled enums
alter table public.profiles
  drop constraint if exists profiles_goal_valid;

alter table public.profiles
  add constraint profiles_goal_valid check (
    goal is null
    or goal in (
      'build_muscle', 'lose_fat', 'gain_strength', 'improve_fitness', 'recomposition'
    )
  );

alter table public.profiles
  drop constraint if exists profiles_experience_valid;

alter table public.profiles
  add constraint profiles_experience_valid check (
    experience is null
    or experience in ('beginner', 'intermediate', 'advanced')
  );

alter table public.profiles
  drop constraint if exists profiles_frequency_valid;

alter table public.profiles
  add constraint profiles_frequency_valid check (
    training_frequency is null
    or training_frequency in ('2', '3', '4', '5', 'six_plus')
  );

alter table public.profiles
  drop constraint if exists profiles_duration_valid;

alter table public.profiles
  add constraint profiles_duration_valid check (
    typical_duration_minutes is null
    or (typical_duration_minutes >= 15 and typical_duration_minutes <= 240)
  );

alter table public.profiles
  drop constraint if exists profiles_environment_valid;

alter table public.profiles
  add constraint profiles_environment_valid check (
    training_environment is null
    or training_environment in (
      'commercial_gym', 'home_gym', 'minimal_equipment', 'bodyweight'
    )
  );

alter table public.profiles
  drop constraint if exists profiles_program_preference_valid;

alter table public.profiles
  add constraint profiles_program_preference_valid check (
    program_preference is null
    or program_preference in (
      'app_decide', 'push_pull_legs', 'upper_lower', 'full_body', 'other'
    )
  );

-- 3. Add constraint: onboarding_completed requires all profile fields
alter table public.profiles
  drop constraint if exists profiles_onboarding_fields_required;

alter table public.profiles
  add constraint profiles_onboarding_fields_required check (
    onboarding_completed = false
    or (
      goal is not null
      and experience is not null
      and training_frequency is not null
      and typical_duration_minutes is not null
      and training_environment is not null
      and program_preference is not null
      and has_current_discomfort is not null
    )
  );

-- 4. Add index for profile lookup by user (already indexed via PK id, but add
--    a partial index for rapid completed-profile existence checks).
create index if not exists profiles_onboarding_completed_idx
  on public.profiles (id)
  where onboarding_completed = true;

-- 5. RLS policies already exist for profiles (select/insert/update owned rows).
--    No new policies needed; the existing policies in migration
--    20260714114141_add_rls_policies_and_policy_tests.sql cover these columns.