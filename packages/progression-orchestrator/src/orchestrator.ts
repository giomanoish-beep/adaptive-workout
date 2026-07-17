/**
 * Progression Orchestrator — Main orchestrator
 *
 * Server-only module. Coordinates:
 * 1. History loading from workout_sessions, workout_session_exercises, set_logs
 * 2. Evidence mapping into progression-engine contracts
 * 3. Progression engine invocation
 * 4. Persistence to exercise_performance_state + workout_decisions
 * 5. Safe DTO mapping for browser consumption
 *
 * Never bundled for the browser. Service role DB client is used only
 * within trusted server-side runtime (Edge Functions).
 */

import type {
  PerformanceStateUpsert,
  ObservabilitySink,
  MappedExposure,
  MappedSet,
  SessionRow,
  SessionExerciseRow,
  SetLogRow,
  ExerciseCatalogRow,
  ProgressionRefreshDto,
  RefreshProgressionSuccessResponse,
  RefreshProgressionErrorResponse,
  SupabaseServiceClient,
} from './contracts.js';
import { engineName, engineVersion, ruleSetVersion, defaultPrescription } from './contracts.js';

// ── Observability factory ──────────────────────────────────────────

export function createNoopSink(): ObservabilitySink {
  return { emit: () => {} };
}

// ── History loading ────────────────────────────────────────────────

export async function loadCompletedSessions(client: any): Promise<readonly SessionRow[]> {
  const { data, error } = await client
    .from('workout_sessions')
    .select('id,status,started_at,completed_at,title,was_deload')
    .in('status', ['completed', 'partial'])
    .order('completed_at', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Failed to load sessions: ${error.message}`);
  }
  return (data ?? []) as SessionRow[];
}

export async function loadSessionExercises(
  client: any,
  sessionIds: readonly string[],
): Promise<readonly SessionExerciseRow[]> {
  if (sessionIds.length === 0) return [];

  const { data, error } = await client
    .from('workout_session_exercises')
    .select(
      'id,workout_session_id,exercise_id,planned_sets,target_rep_min,target_rep_max,target_rir_min,target_rir_max,status,planned_exercise_name',
    )
    .in('workout_session_id', sessionIds as string[]);

  if (error) {
    throw new Error(`Failed to load session exercises: ${error.message}`);
  }
  return (data ?? []) as SessionExerciseRow[];
}

export async function loadSetLogs(
  client: any,
  exerciseIds: readonly string[],
): Promise<readonly SetLogRow[]> {
  if (exerciseIds.length === 0) return [];

  const { data, error } = await client
    .from('set_logs')
    .select(
      'id,workout_session_exercise_id,set_number,weight,weight_unit,reps,rir,status,classification,logged_at',
    )
    .in('workout_session_exercise_id', exerciseIds as string[])
    .order('set_number', { ascending: true });

  if (error) {
    throw new Error(`Failed to load set logs: ${error.message}`);
  }
  return (data ?? []) as SetLogRow[];
}

export async function loadExerciseNames(
  client: any,
  exerciseIds: readonly string[],
): Promise<Map<string, string>> {
  if (exerciseIds.length === 0) return new Map();

  const { data, error } = await client
    .from('exercises')
    .select('id,exercise_name')
    .in('id', exerciseIds as string[]);

  if (error) {
    throw new Error(`Failed to load exercise names: ${error.message}`);
  }

  const map = new Map<string, string>();
  for (const row of (data ?? []) as ExerciseCatalogRow[]) {
    map.set(row.id, row.exercise_name);
  }
  return map;
}

// ── Evidence mapping ───────────────────────────────────────────────

export interface HistoryAssembly {
  readonly sessions: readonly SessionRow[];
  readonly exercisesBySession: Map<string, readonly SessionExerciseRow[]>;
  readonly setsByExercise: Map<string, readonly SetLogRow[]>;
}

export function assembleHistory(
  sessions: readonly SessionRow[],
  sessionExercises: readonly SessionExerciseRow[],
  setLogs: readonly SetLogRow[],
): HistoryAssembly {
  const exercisesBySession = new Map<string, SessionExerciseRow[]>();
  for (const se of sessionExercises) {
    const list = exercisesBySession.get(se.workout_session_id) ?? [];
    list.push(se);
    exercisesBySession.set(se.workout_session_id, list);
  }

  const setsByExercise = new Map<string, SetLogRow[]>();
  for (const sl of setLogs) {
    const list = setsByExercise.get(sl.workout_session_exercise_id) ?? [];
    list.push(sl);
    setsByExercise.set(sl.workout_session_exercise_id, list);
  }

  return { sessions, exercisesBySession, setsByExercise };
}

export function collectDistinctExerciseIds(
  sessionExercises: readonly SessionExerciseRow[],
): readonly string[] {
  return [...new Set(sessionExercises.map((se) => se.exercise_id))];
}

export function mapExposuresForExercise(
  exerciseId: string,
  assembly: HistoryAssembly,
): readonly MappedExposure[] {
  const exposures: MappedExposure[] = [];

  for (const session of assembly.sessions) {
    if (session.status !== 'completed' && session.status !== 'partial') continue;

    const sessionExercises = assembly.exercisesBySession.get(session.id) ?? [];
    const matching = sessionExercises.filter((se) => se.exercise_id === exerciseId);

    for (const se of matching) {
      const rawSets = assembly.setsByExercise.get(se.id) ?? [];
      const sets: MappedSet[] = rawSets.map((sl) => ({
        setId: sl.id,
        setNumber: sl.set_number,
        classification: sl.classification === 'warm_up' ? 'warm_up' : 'working',
        status:
          sl.status === 'completed'
            ? 'completed'
            : sl.status === 'skipped'
              ? 'skipped'
              : 'incomplete',
        load: sl.weight,
        loadUnit: sl.weight_unit === 'kg' || sl.weight_unit === 'lb' ? sl.weight_unit : null,
        reps: sl.reps,
        rir: sl.rir,
        performedAt: sl.logged_at,
      }));

      const exposureStatus: 'completed' | 'incomplete' | 'skipped' =
        se.status === 'completed' ? 'completed' : 'skipped';

      const prescription =
        se.target_rep_min !== null && se.target_rep_max !== null
          ? {
              plannedWorkingSets: se.planned_sets,
              targetRepRange: {
                minimum: se.target_rep_min,
                maximum: se.target_rep_max,
              },
              targetRirRange:
                se.target_rir_min !== null && se.target_rir_max !== null
                  ? { minimum: se.target_rir_min, maximum: se.target_rir_max }
                  : null,
            }
          : null;

      const occurredAt = session.completed_at ?? session.started_at ?? new Date(0).toISOString();

      exposures.push({
        exposureId: se.id,
        exerciseId: se.exercise_id,
        status: exposureStatus,
        occurredAt,
        prescription,
        substitution: null,
        wasDeload: session.was_deload === true,
        sets,
      });
    }
  }

  exposures.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  return exposures;
}

// ── Progression computing ──────────────────────────────────────────

type ProgressionEngineModule = {
  recommendProgression: (input: any, ruleSet: any) => any;
};

export type ProgressionEngineLoader = () => Promise<ProgressionEngineModule | null>;

export class ProgressionEngineUnavailableError extends Error {
  readonly code = 'PROGRESSION_ENGINE_UNAVAILABLE';

  constructor() {
    super('Progression engine is unavailable.');
    this.name = 'ProgressionEngineUnavailableError';
  }
}

let _progressionEngine: ProgressionEngineModule | null = null;

async function importProgressionEngine(): Promise<ProgressionEngineModule> {
  if (_progressionEngine === null) {
    const loadedEngine = await import('@adaptive-workout/progression-engine');
    _progressionEngine = loadedEngine;
  }
  return _progressionEngine;
}

export async function loadProgressionEngine(
  loader: ProgressionEngineLoader = importProgressionEngine,
): Promise<ProgressionEngineModule> {
  try {
    const engine = await loader();
    if (engine === null) {
      throw new ProgressionEngineUnavailableError();
    }
    return engine;
  } catch (error) {
    if (error instanceof ProgressionEngineUnavailableError) {
      throw error;
    }
    throw new ProgressionEngineUnavailableError();
  }
}

function toEngineExposure(exposure: MappedExposure): Record<string, unknown> {
  return {
    exposureId: exposure.exposureId,
    exerciseId: exposure.exerciseId,
    status: exposure.status,
    occurredAt: exposure.occurredAt,
    prescription: exposure.prescription
      ? {
          plannedWorkingSets: exposure.prescription.plannedWorkingSets,
          targetRepRange: exposure.prescription.targetRepRange,
          targetRirRange: exposure.prescription.targetRirRange,
        }
      : null,
    substitution: null,
    wasDeload: exposure.wasDeload,
    sets: exposure.sets.map((s) => ({
      setId: s.setId,
      setNumber: s.setNumber,
      classification: s.classification,
      status: s.status,
      load: s.load,
      loadUnit: s.loadUnit,
      reps: s.reps,
      rir: s.rir,
      performedAt: s.performedAt,
    })),
  };
}

function buildEngineInput(
  userId: string,
  exerciseId: string,
  exposures: readonly MappedExposure[],
  calculatedAt: string,
): Record<string, unknown> {
  return {
    contractVersion: 'progression-input-v1',
    subjectId: userId,
    exerciseId,
    exposures: exposures.map(toEngineExposure),
    prescription: {
      targetRepRange: defaultPrescription.targetRepRange,
      targetRirRange: defaultPrescription.targetRirRange,
      currentPlannedLoad: defaultPrescription.currentPlannedLoad,
      availableLoadIncrements: defaultPrescription.availableLoadIncrements,
    },
    version: {
      engineName,
      engineVersion,
      ruleSetVersion,
    },
    calculatedAt,
  };
}

function defaultRuleSet(): Record<string, unknown> {
  return {
    contractVersion: 'progression-rules-v1',
    ruleSetVersion,
    minimumUsableExposureCount: 3,
    maximumExposureHistory: 20,
    analysisWindowExposureCount: 10,
    increaseRequiredExposureCount: 2,
    reductionRequiredExposureCount: 2,
    minimumKnownRirSetsPerExposureForIncrease: 1,
    rirReductionMargin: 1,
    maximumLoadReductionFraction: 0.15,
    plateauRequiredExposureCount: 4,
    plateauMaximumRepChange: 1,
    substitutionReviewRequiredExposureCount: 6,
    substitutionReviewMinimumHighEffortExposureCount: 4,
    deloadReviewRequiredExposureCount: 4,
    deloadReviewMinimumHighEffortExposureCount: 2,
  };
}

// ── DTO mapping ────────────────────────────────────────────────────

function mapResultToDto(
  result: any,
  exerciseIdForFailure: string,
  exerciseName: string,
  sourceExposureCount: number,
): ProgressionRefreshDto {
  const isSuccess = result.status === 'success';

  let recommendation: ProgressionRefreshDto['recommendation'] = 'insufficient_data';
  if (isSuccess) {
    recommendation = result.action;
  }

  let currentWeight: number | null = null;
  let weightUnit: string | null = null;
  if (isSuccess && result.previousLoad) {
    currentWeight = result.previousLoad.value;
    weightUnit = result.previousLoad.unit;
  }

  let recentReps: number | null = null;
  if (isSuccess && result.evidence?.observedRepRange) {
    recentReps = result.evidence.observedRepRange.maximum;
  }

  let suggestedNextWeight: number | null = null;
  if (isSuccess && result.recommendedLoad) {
    suggestedNextWeight = result.recommendedLoad.value;
  }

  let targetRir: number | null = null;
  if (isSuccess && result.targetRirRange) {
    targetRir = result.targetRirRange.maximum;
  }

  let trend: ProgressionRefreshDto['trend'] = null;
  if (isSuccess && result.evidence?.trend) {
    trend = result.evidence.trend.direction;
  }

  return {
    exerciseId: isSuccess ? result.exerciseId : exerciseIdForFailure,
    exerciseName,
    currentWeight,
    weightUnit,
    recentReps,
    targetRir,
    trend,
    recommendation,
    suggestedNextWeight,
    reasonCodes: isSuccess ? (result.reasonCodes ?? []) : [],
    sourceExposureCount,
    calculatedAt: isSuccess ? result.calculatedAt : new Date().toISOString(),
    engineVersion: isSuccess ? result.version.engineVersion : engineVersion,
    ruleSetVersion: isSuccess ? result.version.ruleSetVersion : ruleSetVersion,
    insufficientData: !isSuccess,
  };
}

// ── Persistence ────────────────────────────────────────────────────

function buildPerformanceStateUpsert(
  userId: string,
  exerciseId: string,
  exposures: readonly MappedExposure[],
  result: any,
  calculatedAt: string,
): PerformanceStateUpsert {
  if (result.status !== 'success') {
    return {
      user_id: userId,
      exercise_id: exerciseId,
      status: 'insufficient_data',
      completed_exposure_count: 0,
      engine_version: engineVersion,
      rule_set_version: ruleSetVersion,
      calculated_at: calculatedAt,
    };
  }

  const usableExposures = exposures.filter(
    (e) =>
      e.status === 'completed' &&
      e.sets.some(
        (s) => s.status === 'completed' && s.classification === 'working' && s.reps !== null,
      ),
  );

  const lastExposure = usableExposures[usableExposures.length - 1];
  const lastWorkingSets =
    lastExposure?.sets.filter(
      (s) => s.status === 'completed' && s.classification === 'working' && s.reps !== null,
    ) ?? [];

  const lastSet = lastWorkingSets[lastWorkingSets.length - 1];
  const watermarkSetId = lastSet?.setId;

  const earliestTs = exposures.length > 0 ? exposures[0]!.occurredAt : calculatedAt;
  const latestTs = lastExposure?.occurredAt ?? calculatedAt;

  return {
    user_id: userId,
    exercise_id: exerciseId,
    status: 'active',
    source_watermark_set_log_id: watermarkSetId,
    source_window_started_at: earliestTs,
    source_window_ended_at: latestTs,
    source_watermark_at: latestTs,
    last_exposure_at: latestTs,
    completed_exposure_count: usableExposures.length,
    last_weight: lastSet?.load ?? undefined,
    last_weight_unit:
      lastSet?.loadUnit === 'kg' || lastSet?.loadUnit === 'lb' ? lastSet.loadUnit : undefined,
    last_reps: lastSet?.reps ?? undefined,
    last_rir: lastSet?.rir ?? undefined,
    engine_version: engineVersion,
    rule_set_version: ruleSetVersion,
    calculated_at: calculatedAt,
  };
}

export async function persistPerformanceState(
  serviceClient: SupabaseServiceClient,
  upserts: readonly PerformanceStateUpsert[],
): Promise<void> {
  if (upserts.length === 0) return;

  const { error } = await serviceClient
    .from('exercise_performance_state')
    .upsert([...upserts])
    .select();

  if (error) {
    throw new Error(`Failed to persist progression state: ${error.message}`);
  }
}

export async function persistDecision(
  serviceClient: SupabaseServiceClient,
  decision: Record<string, unknown>,
): Promise<void> {
  const { error } = await serviceClient
    .from('workout_decisions')
    .insert(decision)
    .select('id')
    .single();

  if (error) {
    console.error(JSON.stringify({ kind: 'progression.decision.persistence_failed' }));
  }
}

// ── Main orchestration ─────────────────────────────────────────────

export interface RefreshProgressionContext {
  readonly userId: string;
  readonly anonClient: any;
  readonly serviceClient: SupabaseServiceClient;
  readonly correlationId: string;
  readonly sink: ObservabilitySink;
  readonly progressionEngineLoader?: ProgressionEngineLoader;
}

export async function refreshProgression(
  ctx: RefreshProgressionContext,
): Promise<RefreshProgressionSuccessResponse | RefreshProgressionErrorResponse> {
  const { userId, anonClient, serviceClient, correlationId, sink, progressionEngineLoader } = ctx;
  const startTime = Date.now();

  sink.emit({
    kind: 'refresh.progression.received',
    correlationId,
    metadata: {},
  });

  try {
    const sessions = await loadCompletedSessions(anonClient);

    if (sessions.length === 0) {
      sink.emit({
        kind: 'refresh.progression.completed',
        correlationId,
        metadata: {
          exerciseCount: 0,
          exposureCount: 0,
          durationMs: Date.now() - startTime,
        },
      });
      return {
        status: 'ok',
        progressions: [],
        correlationId,
      };
    }

    const sessionIds = sessions.map((s) => s.id);
    const sessionExercises = await loadSessionExercises(anonClient, sessionIds);
    const allExerciseIds = sessionExercises.map((se) => se.id);
    const setLogs = await loadSetLogs(anonClient, allExerciseIds);

    sink.emit({
      kind: 'refresh.progression.history_loaded',
      correlationId,
      metadata: {
        sessionCount: sessions.length,
        sessionExerciseCount: sessionExercises.length,
        setLogCount: setLogs.length,
      },
    });

    const assembly = assembleHistory(sessions, sessionExercises, setLogs);
    const distinctExerciseIds = collectDistinctExerciseIds(sessionExercises);
    const exerciseNames = await loadExerciseNames(anonClient, distinctExerciseIds);

    const engine =
      progressionEngineLoader === undefined
        ? await loadProgressionEngine()
        : await loadProgressionEngine(progressionEngineLoader);
    const ruleSet = defaultRuleSet();
    const calculatedAt = new Date().toISOString();

    const dtos: ProgressionRefreshDto[] = [];
    const upserts: PerformanceStateUpsert[] = [];
    let insufficientCount = 0;

    for (const exerciseId of distinctExerciseIds) {
      const exposures = mapExposuresForExercise(exerciseId, assembly);
      const name = exerciseNames.get(exerciseId) ?? 'Unknown Exercise';

      if (exposures.length === 0) continue;

      const input = buildEngineInput(userId, exerciseId, exposures, calculatedAt);
      const result = engine.recommendProgression(input, ruleSet);

      if (result.status !== 'success') {
        insufficientCount += 1;
        sink.emit({
          kind: 'refresh.progression.insufficient_evidence',
          correlationId,
          metadata: { exerciseId, exposureCount: exposures.length },
        });
      }

      const dto = mapResultToDto(result, exerciseId, name, exposures.length);
      dtos.push(dto);

      const upsert = buildPerformanceStateUpsert(
        userId,
        exerciseId,
        exposures,
        result,
        calculatedAt,
      );
      upserts.push(upsert);

      if (result.status === 'success') {
        void persistDecision(serviceClient, {
          user_id: userId,
          engine: engineName,
          engine_version: engineVersion,
          rule_set_version: ruleSetVersion,
          decision_type: `progression_${result.action}`,
          normalized_input: {
            exerciseId,
            calculatedAt,
            exposureCount: exposures.length,
          },
          decision_output: {
            action: result.action,
            recommendedLoad: result.recommendedLoad,
          },
          reason_codes: result.reasonCodes ?? [],
          decision_trace: { kind: 'progression_recommendation', exerciseId },
          created_at: calculatedAt,
        });
      }
    }

    await persistPerformanceState(serviceClient, upserts);

    sink.emit({
      kind: 'refresh.progression.persistence_succeeded',
      correlationId,
      metadata: { exerciseCount: dtos.length, insufficientCount },
    });

    sink.emit({
      kind: 'refresh.progression.calculated',
      correlationId,
      metadata: { exerciseCount: dtos.length, insufficientCount },
    });

    sink.emit({
      kind: 'refresh.progression.completed',
      correlationId,
      metadata: {
        exerciseCount: dtos.length,
        exposureCount: sessionExercises.length,
        insufficientCount,
        durationMs: Date.now() - startTime,
      },
    });

    return {
      status: 'ok',
      progressions: dtos,
      correlationId,
    };
  } catch (err) {
    const engineUnavailable = err instanceof ProgressionEngineUnavailableError;
    const errorCode = engineUnavailable ? err.code : 'REFRESH_FAILED';
    sink.emit({
      kind: 'refresh.progression.persistence_failed',
      correlationId,
      metadata: { errorCode },
    });
    return {
      status: 'error',
      code: errorCode,
      message: engineUnavailable
        ? 'Progression engine is unavailable. Please try again.'
        : 'Progression refresh failed. Please try again.',
    };
  }
}
