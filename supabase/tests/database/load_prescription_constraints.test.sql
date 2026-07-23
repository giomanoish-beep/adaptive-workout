begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- Column existence
select has_column('public', 'profiles', 'body_weight_kg', 'profiles has body_weight_kg column');
select has_column('public', 'workout_session_exercises', 'planned_load_kind', 'workout_session_exercises has planned_load_kind');
select has_column('public', 'workout_session_exercises', 'planned_load_kg', 'workout_session_exercises has planned_load_kg');
select has_column('public', 'workout_session_exercises', 'planned_load_increment', 'workout_session_exercises has planned_load_increment');

-- Constraint existence
select has_check('public', 'profiles', 'profiles has check constraints');
select col_has_check('public', 'workout_session_exercises', 'planned_load_kind',
  'workout_session_exercises has planned_load_kind check');

insert into auth.users (id)
values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

insert into public.exercise_families (id, slug, name)
values ('44444444-4444-4444-4444-444444444444', 'load-test-family', 'Load test family');

insert into public.exercises (id, exercise_family_id, slug, name, version)
values (
  '55555555-5555-5555-5555-555555555555',
  '44444444-4444-4444-4444-444444444444',
  'load-test-exercise',
  'Load test exercise',
  1
);

insert into public.workout_sessions (id, user_id, origin)
values (
  '66666666-6666-6666-6666-666666666666',
  '33333333-3333-3333-3333-333333333333',
  'generated'
);

-- Body weight bounds: valid value accepted
select lives_ok(
  $$ insert into public.profiles (id, body_weight_kg) values ('11111111-1111-1111-1111-111111111111', 75.0) $$,
  'body_weight_kg of 75.0 is accepted'
);

-- Body weight bounds: implausible low rejected
select throws_ok(
  $$ insert into public.profiles (id, body_weight_kg) values ('22222222-2222-2222-2222-222222222222', 10.0) $$,
  '23514',
  null,
  'body_weight_kg below 30 is rejected'
);

-- Load kind: invalid kind rejected
select throws_ok(
  $$ insert into public.workout_session_exercises (workout_session_id, planned_exercise_id, position, status, planned_exercise_name, planned_exercise_version, planned_sets, planned_reps_min, planned_reps_max, planned_load_kind, planned_load_kg)
    values ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 1, 'planned', 'test', 1, 3, 8, 10, 'invalid_kind', 50.0) $$,
  '23514',
  null,
  'invalid planned_load_kind is rejected'
);

-- Load kind/kg consistency: external_numeric without numeric load rejected
select throws_ok(
  $$ insert into public.workout_session_exercises (workout_session_id, planned_exercise_id, position, status, planned_exercise_name, planned_exercise_version, planned_sets, planned_reps_min, planned_reps_max, planned_load_kind, planned_load_kg)
    values ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 2, 'planned', 'test', 1, 3, 8, 10, 'external_numeric', null) $$,
  '23514',
  null,
  'external_numeric without planned_load_kg is rejected'
);

-- Load kind/kg consistency: bodyweight with numeric load rejected
select throws_ok(
  $$ insert into public.workout_session_exercises (workout_session_id, planned_exercise_id, position, status, planned_exercise_name, planned_exercise_version, planned_sets, planned_reps_min, planned_reps_max, planned_load_kind, planned_load_kg)
    values ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 3, 'planned', 'test', 1, 3, 8, 10, 'bodyweight', 50.0) $$,
  '23514',
  null,
  'bodyweight with planned_load_kg is rejected'
);

select finish();
rollback;
