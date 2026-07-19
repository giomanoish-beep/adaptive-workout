create index exercises_search_document_idx
on public.exercises
using gin (
  to_tsvector(
    'simple'::regconfig,
    name || ' ' || replace(slug, '-', ' ')
  )
)
where is_active;

create function public.search_exercise_catalog(
  search_text text default null,
  family_slugs text[] default null,
  target_muscle_slugs text[] default null,
  available_equipment_slugs text[] default null,
  result_limit integer default 50,
  result_offset integer default 0
)
returns table (
  exercise_id uuid,
  slug text,
  name text,
  description text,
  version integer,
  exercise_family_id uuid,
  exercise_family_slug text,
  exercise_family_name text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with search_input as (
    select case
      when nullif(btrim(search_text), '') is null then null
      else websearch_to_tsquery('simple'::regconfig, btrim(search_text))
    end as query
  ),
  matching_exercises as (
    select
      exercises.id as exercise_id,
      exercises.slug,
      exercises.name,
      exercises.description,
      exercises.version,
      exercise_families.id as exercise_family_id,
      exercise_families.slug as exercise_family_slug,
      exercise_families.name as exercise_family_name,
      case
        when search_input.query is null then 0::real
        else ts_rank(
          to_tsvector(
            'simple'::regconfig,
            exercises.name || ' ' || replace(exercises.slug, '-', ' ')
          ),
          search_input.query
        )
      end as search_rank
    from public.exercises
    join public.exercise_families
      on exercise_families.id = exercises.exercise_family_id
    cross join search_input
    where exercises.is_active
      and exercise_families.is_active
      and (
        search_input.query is null
        or to_tsvector(
          'simple'::regconfig,
          exercises.name || ' ' || replace(exercises.slug, '-', ' ')
        ) @@ search_input.query
      )
      and (
        coalesce(cardinality(family_slugs), 0) = 0
        or exercise_families.slug = any(family_slugs)
      )
      and (
        coalesce(cardinality(target_muscle_slugs), 0) = 0
        or exists (
          select 1
          from public.exercise_muscles
          join public.muscles on muscles.id = exercise_muscles.muscle_id
          where exercise_muscles.exercise_id = exercises.id
            and muscles.is_active
            and exercise_muscles.role in ('primary', 'secondary')
            and muscles.slug = any(target_muscle_slugs)
        )
      )
      and (
        available_equipment_slugs is null
        or not exists (
          select 1
          from public.exercise_equipment
          join public.equipment on equipment.id = exercise_equipment.equipment_id
          where exercise_equipment.exercise_id = exercises.id
            and exercise_equipment.requirement = 'required'
            and (
              not equipment.is_active
              or not equipment.slug = any(available_equipment_slugs)
            )
        )
      )
  )
  select
    matching_exercises.exercise_id,
    matching_exercises.slug,
    matching_exercises.name,
    matching_exercises.description,
    matching_exercises.version,
    matching_exercises.exercise_family_id,
    matching_exercises.exercise_family_slug,
    matching_exercises.exercise_family_name,
    count(*) over () as total_count
  from matching_exercises
  order by
    matching_exercises.search_rank desc,
    matching_exercises.name,
    matching_exercises.slug
  limit least(greatest(coalesce(result_limit, 50), 1), 100)
  offset greatest(coalesce(result_offset, 0), 0);
$$;

create function public.get_exercise_catalog_filter_options()
returns table (
  filter_type text,
  slug text,
  name text,
  exercise_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    'exercise_family'::text as filter_type,
    exercise_families.slug as slug,
    exercise_families.name as name,
    count(distinct exercises.id)::bigint as exercise_count
  from public.exercise_families
  join public.exercises on exercises.exercise_family_id = exercise_families.id
  where exercise_families.is_active
    and exercises.is_active
  group by exercise_families.slug, exercise_families.name

  union all

  select
    'muscle'::text as filter_type,
    muscles.slug as slug,
    muscles.name as name,
    count(distinct exercises.id)::bigint as exercise_count
  from public.muscles
  join public.exercise_muscles on exercise_muscles.muscle_id = muscles.id
  join public.exercises on exercises.id = exercise_muscles.exercise_id
  where muscles.is_active
    and exercises.is_active
    and exercise_muscles.role in ('primary', 'secondary')
  group by muscles.slug, muscles.name

  union all

  select
    'equipment'::text as filter_type,
    equipment.slug as slug,
    equipment.name as name,
    count(distinct exercises.id)::bigint as exercise_count
  from public.equipment
  join public.exercise_equipment on exercise_equipment.equipment_id = equipment.id
  join public.exercises on exercises.id = exercise_equipment.exercise_id
  where equipment.is_active
    and exercises.is_active
  group by equipment.slug, equipment.name

  order by filter_type, name, slug;
$$;

revoke all on function public.search_exercise_catalog(
  text,
  text[],
  text[],
  text[],
  integer,
  integer
) from public;
revoke all on function public.get_exercise_catalog_filter_options() from public;

grant execute on function public.search_exercise_catalog(
  text,
  text[],
  text[],
  text[],
  integer,
  integer
) to authenticated;
grant execute on function public.get_exercise_catalog_filter_options() to authenticated;
