begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select ok(
  has_function_privilege(
    'authenticated',
    'public.search_exercise_catalog(text,text[],text[],text[],integer,integer)',
    'EXECUTE'
  ),
  'authenticated users can execute catalog search'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.search_exercise_catalog(text,text[],text[],text[],integer,integer)',
    'EXECUTE'
  ),
  'anonymous users cannot execute catalog search'
);

update public.exercises
set is_active = false
where slug = 'cable-front-raise';

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000001';

select ok(
  exists (
    select 1
    from public.search_exercise_catalog('bench press')
    where slug = 'barbell-bench-press'
  ),
  'full-text search finds canonical names and slugs'
);

select ok(
  not exists (
    select 1
    from public.search_exercise_catalog(null, array['vertical-pull'])
    where exercise_family_slug <> 'vertical-pull'
  ),
  'family filters return only requested families'
);

select ok(
  not exists (
    select 1
    from public.search_exercise_catalog(null, null, array['chest']) as search_result
    where not exists (
      select 1
      from public.exercise_muscles
      join public.muscles on muscles.id = exercise_muscles.muscle_id
      where exercise_muscles.exercise_id = search_result.exercise_id
        and exercise_muscles.role in ('primary', 'secondary')
        and muscles.slug = 'chest'
    )
  ),
  'muscle filters require a matching primary or secondary contribution'
);

select ok(
  exists (
    select 1
    from public.search_exercise_catalog(
      'dumbbell bench press',
      null,
      null,
      array['dumbbell', 'bench']
    )
    where slug = 'dumbbell-bench-press'
  ),
  'available-equipment filters include exercises when every requirement is available'
);

select ok(
  not exists (
    select 1
    from public.search_exercise_catalog(
      'dumbbell bench press',
      null,
      null,
      array['dumbbell']
    )
    where slug = 'dumbbell-bench-press'
  ),
  'available-equipment filters exclude exercises with a missing requirement'
);

select is(
  (select count(*) from public.search_exercise_catalog('hyperextension')),
  0::bigint,
  'aliases remain canonical-source metadata and are not persisted search terms'
);

select is(
  (select count(*) from public.search_exercise_catalog('cable front raise')),
  0::bigint,
  'inactive exercises remain hidden from search'
);

select ok(
  exists (
    select 1
    from public.get_exercise_catalog_filter_options()
    where filter_type = 'muscle'
      and slug = 'chest'
      and exercise_count > 0
  ),
  'filter options include active muscle counts'
);

select ok(
  exists (
    select 1
    from public.get_exercise_catalog_filter_options()
    where filter_type = 'equipment'
      and slug = 'dumbbell'
      and exercise_count > 0
  ),
  'filter options include active equipment counts'
);

select ok(
  (select count(*) from public.search_exercise_catalog(null, null, null, null, 500, 0)) <= 100,
  'search clamps result pages to the documented maximum'
);

select * from finish();

rollback;
