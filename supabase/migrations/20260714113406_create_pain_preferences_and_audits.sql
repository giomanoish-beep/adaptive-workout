create table public.pain_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  report_text text not null,
  occurred_at timestamptz not null,
  follow_up_status text not null default 'unresolved',
  next_follow_up_at timestamptz,
  safety_classification text,
  safety_engine_version text,
  safety_rule_set_version text,
  classified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pain_events_id_user_unique unique (id, user_id),
  constraint pain_events_report_text_valid check (
    char_length(btrim(report_text)) between 1 and 4000
  ),
  constraint pain_events_follow_up_status_valid check (
    follow_up_status in (
      'unresolved',
      'improving',
      'unchanged',
      'worsening',
      'resolved',
      'referred'
    )
  ),
  constraint pain_events_classification_valid check (
    (
      safety_classification is null
      and safety_engine_version is null
      and safety_rule_set_version is null
      and classified_at is null
    )
    or (
      safety_classification is not null
      and safety_classification in ('GREEN', 'ADAPT', 'STOP')
      and safety_engine_version is not null
      and char_length(btrim(safety_engine_version)) between 1 and 64
      and safety_rule_set_version is not null
      and char_length(btrim(safety_rule_set_version)) between 1 and 64
      and classified_at is not null
    )
  ),
  constraint pain_events_timestamps_ordered check (updated_at >= created_at)
);

create table public.pain_event_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pain_event_id uuid not null,
  observation_type text not null,
  observed_at timestamptz not null,
  reported_text text,
  body_area_code text,
  body_side text,
  severity smallint,
  onset_pattern text,
  activity_context text,
  sensation_code text,
  duration_minutes integer,
  trend text,
  aggravated_by_movement boolean,
  aggravated_by_load boolean,
  affects_normal_activity boolean,
  traumatic_onset boolean,
  unable_to_use_area boolean,
  visible_deformity boolean,
  major_swelling boolean,
  numbness_or_weakness boolean,
  chest_pain_or_breathing_difficulty boolean,
  fainting boolean,
  severe_systemic_symptoms boolean,
  created_at timestamptz not null default now(),
  constraint pain_event_observations_event_owner_fk foreign key (pain_event_id, user_id)
    references public.pain_events (id, user_id) on delete cascade,
  constraint pain_event_observations_type_valid check (
    observation_type in ('initial', 'follow_up')
  ),
  constraint pain_event_observations_reported_text_valid check (
    reported_text is null
    or char_length(btrim(reported_text)) between 1 and 4000
  ),
  constraint pain_event_observations_body_area_valid check (
    body_area_code is null
    or body_area_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint pain_event_observations_body_side_valid check (
    body_side is null
    or body_side in ('left', 'right', 'bilateral', 'midline', 'not_applicable')
  ),
  constraint pain_event_observations_severity_valid check (
    severity is null
    or severity between 0 and 10
  ),
  constraint pain_event_observations_onset_pattern_valid check (
    onset_pattern is null
    or onset_pattern in ('sudden', 'gradual')
  ),
  constraint pain_event_observations_activity_context_valid check (
    activity_context is null
    or activity_context in ('training', 'daily_activity', 'rest', 'other')
  ),
  constraint pain_event_observations_sensation_valid check (
    sensation_code is null
    or sensation_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint pain_event_observations_duration_valid check (
    duration_minutes is null
    or duration_minutes >= 0
  ),
  constraint pain_event_observations_trend_valid check (
    trend is null
    or trend in ('improving', 'unchanged', 'worsening', 'resolved')
  )
);

create table public.pain_exercise_associations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pain_event_id uuid not null,
  exercise_id uuid references public.exercises (id) on delete restrict,
  exercise_family_id uuid references public.exercise_families (id) on delete restrict,
  source_workout_session_exercise_id uuid references public.workout_session_exercises (id) on delete set null,
  evidence_type text not null,
  derivation_method text not null,
  engine_version text,
  rule_set_version text,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint pain_exercise_associations_event_owner_fk foreign key (pain_event_id, user_id)
    references public.pain_events (id, user_id) on delete cascade,
  constraint pain_exercise_associations_target_valid check (
    (exercise_id is null) <> (exercise_family_id is null)
  ),
  constraint pain_exercise_associations_evidence_type_valid check (
    evidence_type in ('reported_during', 'reported_after', 'reported_aggravation')
  ),
  constraint pain_exercise_associations_derivation_valid check (
    (
      derivation_method = 'user_reported'
      and engine_version is null
      and rule_set_version is null
    )
    or (
      derivation_method = 'rule_derived'
      and engine_version is not null
      and char_length(btrim(engine_version)) between 1 and 64
      and rule_set_version is not null
      and char_length(btrim(rule_set_version)) between 1 and 64
    )
  )
);

create table public.user_exercise_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  preference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_exercise_preferences_user_exercise_unique unique (user_id, exercise_id),
  constraint user_exercise_preferences_preference_valid check (
    preference in ('like', 'dislike')
  ),
  constraint user_exercise_preferences_timestamps_ordered check (
    updated_at >= created_at
  )
);

create table public.workout_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_session_id uuid references public.workout_sessions (id) on delete set null,
  pain_event_id uuid references public.pain_events (id) on delete set null,
  engine text not null,
  engine_version text not null,
  rule_set_version text not null,
  decision_type text not null,
  normalized_input jsonb not null,
  decision_output jsonb not null,
  reason_codes text[] not null,
  decision_trace jsonb not null,
  created_at timestamptz not null default now(),
  constraint workout_decisions_engine_valid check (
    char_length(btrim(engine)) between 1 and 64
  ),
  constraint workout_decisions_engine_version_valid check (
    char_length(btrim(engine_version)) between 1 and 64
  ),
  constraint workout_decisions_rule_set_version_valid check (
    char_length(btrim(rule_set_version)) between 1 and 64
  ),
  constraint workout_decisions_decision_type_valid check (
    decision_type ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint workout_decisions_normalized_input_valid check (
    jsonb_typeof(normalized_input) = 'object'
  ),
  constraint workout_decisions_output_valid check (
    jsonb_typeof(decision_output) = 'object'
  ),
  constraint workout_decisions_reason_codes_valid check (
    cardinality(reason_codes) > 0
    and array_position(reason_codes, null) is null
  ),
  constraint workout_decisions_trace_valid check (
    jsonb_typeof(decision_trace) = 'object'
  )
);

create table public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_decision_id uuid references public.workout_decisions (id) on delete set null,
  pain_event_id uuid references public.pain_events (id) on delete set null,
  fallback_from_interaction_id uuid references public.ai_interactions (id) on delete set null,
  provider text not null,
  model text not null,
  task_type text not null,
  contract_version text not null,
  status text not null,
  validation_status text not null,
  latency_ms integer not null,
  structured_request jsonb not null,
  structured_response jsonb,
  error_category text,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null,
  constraint ai_interactions_fallback_not_self check (
    fallback_from_interaction_id is null
    or fallback_from_interaction_id <> id
  ),
  constraint ai_interactions_provider_valid check (provider in ('glm', 'deepseek')),
  constraint ai_interactions_model_valid check (
    char_length(btrim(model)) between 1 and 120
  ),
  constraint ai_interactions_task_type_valid check (
    task_type in (
      'workout_intent_extraction',
      'discomfort_extraction',
      'decision_explanation'
    )
  ),
  constraint ai_interactions_contract_version_valid check (
    char_length(btrim(contract_version)) between 1 and 64
  ),
  constraint ai_interactions_status_valid check (status in ('succeeded', 'failed')),
  constraint ai_interactions_validation_status_valid check (
    validation_status in ('not_run', 'passed', 'failed')
  ),
  constraint ai_interactions_latency_valid check (latency_ms >= 0),
  constraint ai_interactions_request_valid check (
    jsonb_typeof(structured_request) = 'object'
  ),
  constraint ai_interactions_result_valid check (
    (
      status = 'succeeded'
      and validation_status = 'passed'
      and structured_response is not null
      and jsonb_typeof(structured_response) = 'object'
      and error_category is null
    )
    or (
      status = 'failed'
      and validation_status in ('not_run', 'failed')
      and structured_response is null
      and error_category is not null
      and error_category ~ '^[a-z][a-z0-9_]{0,63}$'
    )
  ),
  constraint ai_interactions_timestamps_ordered check (completed_at >= created_at)
);

create index pain_events_user_occurred_at_idx
on public.pain_events (user_id, occurred_at desc);

create index pain_events_active_follow_up_idx
on public.pain_events (user_id, follow_up_status, next_follow_up_at)
where follow_up_status not in ('resolved', 'referred');

create index pain_event_observations_event_observed_at_idx
on public.pain_event_observations (pain_event_id, observed_at);

create index pain_event_observations_user_observed_at_idx
on public.pain_event_observations (user_id, observed_at desc);

create unique index pain_exercise_associations_event_exercise_evidence_unique_idx
on public.pain_exercise_associations (
  pain_event_id,
  exercise_id,
  evidence_type,
  observed_at
)
where exercise_id is not null;

create unique index pain_exercise_associations_event_family_evidence_unique_idx
on public.pain_exercise_associations (
  pain_event_id,
  exercise_family_id,
  evidence_type,
  observed_at
)
where exercise_family_id is not null;

create index pain_exercise_associations_pain_event_id_idx
on public.pain_exercise_associations (pain_event_id);

create index pain_exercise_associations_user_observed_at_idx
on public.pain_exercise_associations (user_id, observed_at desc);

create index pain_exercise_associations_user_exercise_history_idx
on public.pain_exercise_associations (user_id, exercise_id, observed_at desc)
where exercise_id is not null;

create index pain_exercise_associations_user_family_history_idx
on public.pain_exercise_associations (user_id, exercise_family_id, observed_at desc)
where exercise_family_id is not null;

create index pain_exercise_associations_exercise_id_idx
on public.pain_exercise_associations (exercise_id)
where exercise_id is not null;

create index pain_exercise_associations_exercise_family_id_idx
on public.pain_exercise_associations (exercise_family_id)
where exercise_family_id is not null;

create index pain_exercise_associations_source_session_exercise_id_idx
on public.pain_exercise_associations (source_workout_session_exercise_id)
where source_workout_session_exercise_id is not null;

create index user_exercise_preferences_exercise_id_idx
on public.user_exercise_preferences (exercise_id);

create index workout_decisions_user_created_at_idx
on public.workout_decisions (user_id, created_at desc);

create index workout_decisions_workout_session_id_idx
on public.workout_decisions (workout_session_id)
where workout_session_id is not null;

create index workout_decisions_pain_event_id_idx
on public.workout_decisions (pain_event_id)
where pain_event_id is not null;

create index workout_decisions_engine_version_idx
on public.workout_decisions (engine, engine_version);

create index ai_interactions_user_created_at_idx
on public.ai_interactions (user_id, created_at desc);

create index ai_interactions_provider_status_created_at_idx
on public.ai_interactions (provider, status, created_at desc);

create index ai_interactions_workout_decision_id_idx
on public.ai_interactions (workout_decision_id)
where workout_decision_id is not null;

create index ai_interactions_pain_event_id_idx
on public.ai_interactions (pain_event_id)
where pain_event_id is not null;

create index ai_interactions_fallback_from_interaction_id_idx
on public.ai_interactions (fallback_from_interaction_id)
where fallback_from_interaction_id is not null;

create trigger pain_events_set_updated_at
before update on public.pain_events
for each row execute function public.set_updated_at();

create trigger user_exercise_preferences_set_updated_at
before update on public.user_exercise_preferences
for each row execute function public.set_updated_at();

alter table public.pain_events enable row level security;
alter table public.pain_event_observations enable row level security;
alter table public.pain_exercise_associations enable row level security;
alter table public.user_exercise_preferences enable row level security;
alter table public.workout_decisions enable row level security;
alter table public.ai_interactions enable row level security;

create policy pain_events_select_owned
on public.pain_events
for select
to authenticated
using (user_id = (select auth.uid()));

create policy pain_events_insert_owned_report
on public.pain_events
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and follow_up_status = 'unresolved'
  and next_follow_up_at is null
  and safety_classification is null
  and safety_engine_version is null
  and safety_rule_set_version is null
  and classified_at is null
);

create policy pain_event_observations_select_owned
on public.pain_event_observations
for select
to authenticated
using (user_id = (select auth.uid()));

create policy pain_event_observations_insert_owned
on public.pain_event_observations
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy pain_exercise_associations_select_owned
on public.pain_exercise_associations
for select
to authenticated
using (user_id = (select auth.uid()));

create policy user_exercise_preferences_select_owned
on public.user_exercise_preferences
for select
to authenticated
using (user_id = (select auth.uid()));

create policy user_exercise_preferences_insert_owned
on public.user_exercise_preferences
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy user_exercise_preferences_update_owned
on public.user_exercise_preferences
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy user_exercise_preferences_delete_owned
on public.user_exercise_preferences
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy workout_decisions_select_owned
on public.workout_decisions
for select
to authenticated
using (user_id = (select auth.uid()));

create policy ai_interactions_select_owned
on public.ai_interactions
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.pain_events from anon;
revoke all on table public.pain_event_observations from anon;
revoke all on table public.pain_exercise_associations from anon;
revoke all on table public.user_exercise_preferences from anon;
revoke all on table public.workout_decisions from anon;
revoke all on table public.ai_interactions from anon;

revoke all on table public.pain_events from authenticated;
revoke all on table public.pain_event_observations from authenticated;
revoke all on table public.pain_exercise_associations from authenticated;
revoke all on table public.user_exercise_preferences from authenticated;
revoke all on table public.workout_decisions from authenticated;
revoke all on table public.ai_interactions from authenticated;

grant select, insert on table public.pain_events to authenticated;
grant select, insert on table public.pain_event_observations to authenticated;
grant select on table public.pain_exercise_associations to authenticated;
grant select, insert, update, delete on table public.user_exercise_preferences to authenticated;
grant select on table public.workout_decisions to authenticated;
grant select on table public.ai_interactions to authenticated;
