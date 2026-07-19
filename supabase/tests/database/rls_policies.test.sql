begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select results_eq(
  $$
    select c.relname
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
    order by c.relname
  $$,
  $$select null::name where false$$,
  'RLS is enabled on every public table'
);

select results_eq(
  $$
    select schemaname || '.' || tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
      and (
        has_table_privilege('anon', schemaname || '.' || tablename, 'SELECT')
        or has_table_privilege('anon', schemaname || '.' || tablename, 'INSERT')
        or has_table_privilege('anon', schemaname || '.' || tablename, 'UPDATE')
        or has_table_privilege('anon', schemaname || '.' || tablename, 'DELETE')
      )
    order by tablename
  $$,
  $$select null::text where false$$,
  'anonymous users have no public table privileges'
);

select results_eq(
  $$
    select c.relname
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not exists (
        select 1
        from pg_catalog.pg_policy as p
        where p.polrelid = c.oid
      )
    order by c.relname
  $$,
  $$select null::name where false$$,
  'every public table has at least one RLS policy'
);

select ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT')
  and has_table_privilege('authenticated', 'public.profiles', 'INSERT')
  and has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'authenticated profile privileges are least-privilege'
);

select ok(
  has_table_privilege('authenticated', 'public.exercises', 'SELECT')
  and not has_table_privilege('authenticated', 'public.exercises', 'INSERT')
  and not has_table_privilege('authenticated', 'public.exercises', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.exercises', 'DELETE'),
  'authenticated users can read but not write the exercise catalog'
);

select ok(
  not has_table_privilege('authenticated', 'public.exercise_performance_state', 'INSERT')
  and not has_table_privilege('authenticated', 'public.exercise_performance_state', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.exercise_performance_state', 'DELETE')
  and not has_table_privilege('authenticated', 'public.muscle_training_state', 'INSERT')
  and not has_table_privilege('authenticated', 'public.muscle_training_state', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.muscle_training_state', 'DELETE')
  and not has_table_privilege('authenticated', 'public.pain_exercise_associations', 'INSERT')
  and not has_table_privilege('authenticated', 'public.pain_exercise_associations', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.pain_exercise_associations', 'DELETE')
  and not has_table_privilege('authenticated', 'public.workout_decisions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.workout_decisions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.workout_decisions', 'DELETE')
  and not has_table_privilege('authenticated', 'public.ai_interactions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.ai_interactions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.ai_interactions', 'DELETE'),
  'derived and audit tables remain server-written'
);

insert into auth.users (id)
values
  ('10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000003');

insert into public.profiles (id, display_name)
values
  ('10000000-0000-0000-0000-000000000001', 'First user'),
  ('20000000-0000-0000-0000-000000000002', 'Second user');

insert into public.muscles (id, slug, name, is_active)
values
  ('30000000-0000-0000-0000-000000000003', 'active-muscle', 'Active muscle', true),
  ('40000000-0000-0000-0000-000000000004', 'inactive-muscle', 'Inactive muscle', false);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000001';

select results_eq(
  $$select id from public.profiles order by id$$,
  $$values ('10000000-0000-0000-0000-000000000001'::uuid)$$,
  'a user can read only their own profile'
);

select ok(
  exists (
    select 1 from public.muscles where id = '30000000-0000-0000-0000-000000000003'
  ),
  'active test muscle is visible to authenticated users'
);

select ok(
  not exists (
    select 1 from public.muscles where id = '40000000-0000-0000-0000-000000000004'
  ),
  'inactive test muscle is hidden from authenticated users'
);

select ok(
  not exists (
    select 1 from public.muscles where not is_active
  ),
  'authenticated users see no inactive catalog rows'
);

select throws_ok(
  $$
    insert into public.profiles (id, display_name)
    values ('30000000-0000-0000-0000-000000000003', 'Blocked')
  $$,
  '42501',
  'new row violates row-level security policy for table "profiles"',
  'a user cannot insert another user profile'
);

select throws_ok(
  $$
    insert into public.muscles (slug, name)
    values ('blocked-muscle', 'Blocked muscle')
  $$,
  '42501',
  'permission denied for table muscles',
  'authenticated users cannot write shared catalog rows'
);

select * from finish();

rollback;
