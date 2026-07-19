import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  GeneratedProgramDto,
  LoadedProgram,
  ProgramAdaptationDto,
  ProgramSetupDraft,
  ScheduledWorkoutState,
} from './program-types';

export class ProgramRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgramRepositoryError';
  }
}

export function createProgramRepository(client: SupabaseClient) {
  async function userId(): Promise<string> {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new ProgramRepositoryError('Please sign in again.');
    return data.user.id;
  }

  async function create(setup: ProgramSetupDraft, generated: GeneratedProgramDto): Promise<void> {
    const owner = await userId();
    const programResult = await client
      .from('programs')
      .insert({
        owner_user_id: owner,
        slug: `personal-${Date.now()}`,
        name: generated.name,
        version: 1,
        is_active: true,
        status: 'active',
        goal: setup.goal,
        experience_level: setup.experience,
        start_date: setup.startDate,
        duration_weeks: setup.durationWeeks,
        training_days: [
          ...new Set(generated.schedule.filter((s) => s.week === 1).map((s) => s.dayOfWeek)),
        ],
        split: generated.split,
        session_duration_minutes: setup.sessionDurationMinutes,
        engine_version: generated.engineVersion,
        rule_set_version: generated.ruleSetVersion,
        current_revision: 1,
      })
      .select('*')
      .single();
    // Supabase's untyped client exposes `.single().data` as `any`; map it at this boundary.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const programData = programResult.data;
    const program = programData as Record<string, unknown> | null;
    const programError = programResult.error;
    if (programError || !program)
      throw new ProgramRepositoryError('We could not save your program. Try again.');
    const programId = String(program['id']);
    const revisionResult = await client
      .from('program_revisions')
      .insert({
        program_id: programId,
        owner_user_id: owner,
        revision: 1,
        reason_code: 'program_created',
        setup_snapshot: setup,
        generated_snapshot: generated,
        engine_version: generated.engineVersion,
        rule_set_version: generated.ruleSetVersion,
      })
      .select('*')
      .single();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const revisionData = revisionResult.data;
    const revision = revisionData as Record<string, unknown> | null;
    const revisionError = revisionResult.error;
    if (revisionError || !revision)
      throw new ProgramRepositoryError('We could not save the program version. Try again.');
    const revisionId = String(revision['id']);
    const templateIds = new Map<string, string>();
    for (const [index, template] of generated.templates.entries()) {
      const workoutResult = await client
        .from('program_workouts')
        .insert({
          program_id: programId,
          position: index + 1,
          template_key: template.templateKey,
          name: template.name,
          expected_duration_minutes: template.expectedDurationMinutes,
          focus_muscles: template.focus,
        })
        .select('*')
        .single();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const workoutData = workoutResult.data;
      const workout = workoutData as Record<string, unknown> | null;
      const error = workoutResult.error;
      if (error || !workout)
        throw new ProgramRepositoryError('We could not save a workout template. Try again.');
      const workoutId = String(workout['id']);
      templateIds.set(template.templateKey, workoutId);
      for (const item of template.prescriptions) {
        const { error: itemError } = await client.from('program_workout_exercises').insert({
          program_workout_id: workoutId,
          exercise_id: item.exerciseId,
          position: item.position,
          target_sets: item.sets,
          target_reps_min: item.repsMin,
          target_reps_max: item.repsMax,
          target_rir: item.targetRir,
          rest_seconds: item.restSeconds,
          movement_pattern: item.movementPattern,
          initial_load_kg: item.initialLoadKg,
          calibration_status: item.calibrationStatus,
          recommendation_reason: item.recommendationReason,
        });
        if (itemError)
          throw new ProgramRepositoryError(
            'We could not save an exercise prescription. Try again.',
          );
      }
    }
    for (const scheduled of generated.schedule) {
      const templateId = templateIds.get(scheduled.templateKey);
      if (!templateId) throw new ProgramRepositoryError('Program template mapping failed.');
      const { error } = await client.from('program_scheduled_workouts').insert({
        program_id: programId,
        program_revision_id: revisionId,
        program_workout_id: templateId,
        owner_user_id: owner,
        schedule_key: scheduled.scheduleKey,
        week_number: scheduled.week,
        scheduled_date: scheduled.scheduledDate,
        original_scheduled_date: scheduled.scheduledDate,
        phase: scheduled.phase,
        status: 'upcoming',
        is_deload: scheduled.isDeload,
      });
      if (error)
        throw new ProgramRepositoryError('We could not save the program calendar. Try again.');
    }
  }

  async function loadActive(): Promise<LoadedProgram | null> {
    const owner = await userId();
    const { data: programs, error } = await client
      .from('programs')
      .select('*')
      .eq('owner_user_id', owner)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new ProgramRepositoryError('We could not load your program.');
    const program = programs?.[0] as Record<string, unknown> | undefined;
    if (!program) return null;
    const programId = String(program['id']);
    const revisionNumber = Number(program['current_revision']);
    const { data: revisions, error: revisionError } = await client
      .from('program_revisions')
      .select('*')
      .eq('program_id', programId)
      .eq('revision', revisionNumber)
      .limit(1);
    const revision = revisions?.[0] as Record<string, unknown> | undefined;
    if (revisionError || !revision)
      throw new ProgramRepositoryError('The active program version could not be loaded.');
    const [
      { data: schedules, error: scheduleError },
      { data: adaptations, error: adaptationError },
    ] = await Promise.all([
      client
        .from('program_scheduled_workouts')
        .select('*')
        .eq('program_id', programId)
        .order('scheduled_date', { ascending: true }),
      client
        .from('program_adaptations')
        .select('*')
        .eq('program_id', programId)
        .eq('is_active', true)
        .order('start_date', { ascending: true }),
    ]);
    if (scheduleError || adaptationError)
      throw new ProgramRepositoryError('The program calendar could not be loaded.');
    const generated = revision['generated_snapshot'] as GeneratedProgramDto;
    const generatedByKey = new Map(generated.schedule.map((row) => [row.scheduleKey, row]));
    return {
      id: programId,
      revisionId: String(revision['id']),
      revision: revisionNumber,
      startDate: String(program['start_date']),
      durationWeeks: Number(program['duration_weeks']),
      generated,
      setup: revision['setup_snapshot'] as ProgramSetupDraft,
      schedule: (schedules ?? [])
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        .filter((row) => generatedByKey.has(String(row['schedule_key'])))
        .map((row) => mapSchedule(row as Record<string, unknown>, generatedByKey)),
      adaptations: (adaptations ?? []).map((row) => mapAdaptation(row as Record<string, unknown>)),
    };
  }

  async function revise(
    current: LoadedProgram,
    setup: ProgramSetupDraft,
    generated: GeneratedProgramDto,
    reasonCode: string,
  ): Promise<void> {
    const owner = await userId();
    const nextRevision = current.revision + 1;
    const revisionResult = await client
      .from('program_revisions')
      .insert({
        program_id: current.id,
        owner_user_id: owner,
        revision: nextRevision,
        reason_code: reasonCode,
        setup_snapshot: setup,
        generated_snapshot: generated,
        engine_version: generated.engineVersion,
        rule_set_version: generated.ruleSetVersion,
      })
      .select('*')
      .single();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const revisionData = revisionResult.data;
    const revision = revisionData as Record<string, unknown> | null;
    if (revisionResult.error || !revision)
      throw new ProgramRepositoryError('We could not save the new program version. Try again.');
    const { error } = await client
      .from('programs')
      .update({
        current_revision: nextRevision,
        version: nextRevision,
        goal: setup.goal,
        experience_level: setup.experience,
        duration_weeks: setup.durationWeeks,
        training_days: [
          ...new Set(
            generated.schedule.filter((item) => item.week === 1).map((item) => item.dayOfWeek),
          ),
        ],
        split: generated.split,
        session_duration_minutes: setup.sessionDurationMinutes,
        engine_version: generated.engineVersion,
        rule_set_version: generated.ruleSetVersion,
      })
      .eq('id', current.id);
    if (error)
      throw new ProgramRepositoryError('We could not activate the new program version. Try again.');

    const { data: workoutRows, error: workoutsError } = await client
      .from('program_workouts')
      .select('*')
      .eq('program_id', current.id)
      .order('position', { ascending: true });
    if (workoutsError || !workoutRows?.length)
      throw new ProgramRepositoryError('The program templates could not be revised.');
    const templateIds = new Map(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      workoutRows.map((row) => [String(row['template_key']), String(row['id'])]),
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const fallbackTemplateId = String(workoutRows[0]?.['id']);
    const existingByKey = new Map(current.schedule.map((item) => [item.scheduleKey, item]));
    const nextKeys = new Set(generated.schedule.map((item) => item.scheduleKey));
    for (const scheduled of generated.schedule) {
      const existing = existingByKey.get(scheduled.scheduleKey);
      if (existing && ['upcoming', 'rescheduled'].includes(existing.status)) {
        const { error: updateError } = await client
          .from('program_scheduled_workouts')
          .update({
            program_revision_id: String(revision['id']),
            scheduled_date: scheduled.scheduledDate,
            phase: scheduled.phase,
            is_deload: scheduled.isDeload,
            status: 'upcoming',
          })
          .eq('id', existing.id);
        if (updateError)
          throw new ProgramRepositoryError('The future calendar could not be revised.');
      } else if (!existing) {
        const { error: insertError } = await client.from('program_scheduled_workouts').insert({
          program_id: current.id,
          program_revision_id: String(revision['id']),
          program_workout_id: templateIds.get(scheduled.templateKey) ?? fallbackTemplateId,
          owner_user_id: owner,
          schedule_key: scheduled.scheduleKey,
          week_number: scheduled.week,
          scheduled_date: scheduled.scheduledDate,
          original_scheduled_date: scheduled.scheduledDate,
          phase: scheduled.phase,
          status: 'upcoming',
          is_deload: scheduled.isDeload,
        });
        if (insertError)
          throw new ProgramRepositoryError('The expanded calendar could not be saved.');
      }
    }
    for (const existing of current.schedule) {
      if (
        !nextKeys.has(existing.scheduleKey) &&
        ['upcoming', 'rescheduled'].includes(existing.status)
      ) {
        const { error: skipError } = await client
          .from('program_scheduled_workouts')
          .update({ status: 'skipped', skipped_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (skipError)
          throw new ProgramRepositoryError('Removed future sessions could not be resolved.');
      }
    }
  }

  async function reschedule(id: string, date: string): Promise<void> {
    const { error } = await client
      .from('program_scheduled_workouts')
      .update({
        scheduled_date: date,
        status: 'rescheduled',
        rescheduled_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new ProgramRepositoryError('We could not reschedule this workout. Try again.');
  }

  async function skip(id: string): Promise<void> {
    const { error } = await client
      .from('program_scheduled_workouts')
      .update({ status: 'skipped', skipped_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new ProgramRepositoryError('We could not skip this workout. Try again.');
  }

  async function addAdaptation(
    programId: string,
    input: Omit<ProgramAdaptationDto, 'id'>,
  ): Promise<void> {
    const owner = await userId();
    const { error } = await client.from('program_adaptations').insert({
      program_id: programId,
      owner_user_id: owner,
      affected_region: input.affectedRegion,
      affected_movement_patterns: input.affectedMovementPatterns,
      severity: input.severity,
      start_date: input.startDate,
      review_date: input.reviewDate,
      reason_codes: ['user_reported_temporary_restriction'],
      is_active: true,
    });
    if (error)
      throw new ProgramRepositoryError('We could not save this training adaptation. Try again.');
  }

  async function removeAdaptation(id: string): Promise<void> {
    const { error } = await client
      .from('program_adaptations')
      .update({ is_active: false, end_date: new Date().toISOString().slice(0, 10) })
      .eq('id', id);
    if (error)
      throw new ProgramRepositoryError('We could not remove this training adaptation. Try again.');
  }

  return { create, revise, loadActive, reschedule, skip, addAdaptation, removeAdaptation };
}

function mapSchedule(
  row: Record<string, unknown>,
  generated: ReadonlyMap<string, LoadedProgram['generated']['schedule'][number]>,
): ScheduledWorkoutState {
  const scheduleKey = String(row['schedule_key']);
  const source = generated.get(scheduleKey);
  if (!source)
    throw new ProgramRepositoryError('A scheduled workout does not match its program version.');
  return {
    ...source,
    id: String(row['id']),
    status: row['status'] as ScheduledWorkoutState['status'],
    scheduledDate: String(row['scheduled_date']),
    originalScheduledDate: String(row['original_scheduled_date']),
  };
}

function mapAdaptation(row: Record<string, unknown>): ProgramAdaptationDto {
  return {
    id: String(row['id']),
    affectedRegion: String(row['affected_region']),
    affectedMovementPatterns: row['affected_movement_patterns'] as readonly string[],
    severity: row['severity'] as ProgramAdaptationDto['severity'],
    startDate: String(row['start_date']),
    reviewDate: typeof row['review_date'] === 'string' ? row['review_date'] : null,
  };
}
