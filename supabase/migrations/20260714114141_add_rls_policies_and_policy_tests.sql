create policy profiles_select_owned
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy profiles_insert_owned
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

create policy profiles_update_owned
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy muscles_select_active
on public.muscles
for select
to authenticated
using (is_active);

create policy equipment_select_active
on public.equipment
for select
to authenticated
using (is_active);

create policy exercise_families_select_active
on public.exercise_families
for select
to authenticated
using (is_active);

create policy exercises_select_active
on public.exercises
for select
to authenticated
using (
  is_active
  and exists (
    select 1
    from public.exercise_families
    where exercise_families.id = exercises.exercise_family_id
      and exercise_families.is_active
  )
);

create policy exercise_muscles_select_active
on public.exercise_muscles
for select
to authenticated
using (
  exists (
    select 1
    from public.exercises
    join public.exercise_families
      on exercise_families.id = exercises.exercise_family_id
    where exercises.id = exercise_muscles.exercise_id
      and exercises.is_active
      and exercise_families.is_active
  )
  and exists (
    select 1
    from public.muscles
    where muscles.id = exercise_muscles.muscle_id
      and muscles.is_active
  )
);

create policy exercise_equipment_select_active
on public.exercise_equipment
for select
to authenticated
using (
  exists (
    select 1
    from public.exercises
    join public.exercise_families
      on exercise_families.id = exercises.exercise_family_id
    where exercises.id = exercise_equipment.exercise_id
      and exercises.is_active
      and exercise_families.is_active
  )
  and exists (
    select 1
    from public.equipment
    where equipment.id = exercise_equipment.equipment_id
      and equipment.is_active
  )
);

create policy exercise_substitutions_select_active
on public.exercise_substitutions
for select
to authenticated
using (
  is_active
  and exists (
    select 1
    from public.exercises as source_exercise
    join public.exercise_families as source_family
      on source_family.id = source_exercise.exercise_family_id
    where source_exercise.id = exercise_substitutions.source_exercise_id
      and source_exercise.is_active
      and source_family.is_active
  )
  and exists (
    select 1
    from public.exercises as substitute_exercise
    join public.exercise_families as substitute_family
      on substitute_family.id = substitute_exercise.exercise_family_id
    where substitute_exercise.id = exercise_substitutions.substitute_exercise_id
      and substitute_exercise.is_active
      and substitute_family.is_active
  )
);

revoke all on table public.profiles from anon;
revoke all on table public.muscles from anon;
revoke all on table public.equipment from anon;
revoke all on table public.exercise_families from anon;
revoke all on table public.exercises from anon;
revoke all on table public.exercise_muscles from anon;
revoke all on table public.exercise_equipment from anon;
revoke all on table public.exercise_substitutions from anon;

revoke all on table public.profiles from authenticated;
revoke all on table public.muscles from authenticated;
revoke all on table public.equipment from authenticated;
revoke all on table public.exercise_families from authenticated;
revoke all on table public.exercises from authenticated;
revoke all on table public.exercise_muscles from authenticated;
revoke all on table public.exercise_equipment from authenticated;
revoke all on table public.exercise_substitutions from authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.muscles to authenticated;
grant select on table public.equipment to authenticated;
grant select on table public.exercise_families to authenticated;
grant select on table public.exercises to authenticated;
grant select on table public.exercise_muscles to authenticated;
grant select on table public.exercise_equipment to authenticated;
grant select on table public.exercise_substitutions to authenticated;
