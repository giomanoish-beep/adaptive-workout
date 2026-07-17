/**
 * Progression Orchestrator — Contracts
 *
 * Server-only types for history loading, evidence mapping, progression computation,
 * persistence, and browser-safe DTO mapping.
 *
 * This package is server-only. Never import it in browser code.
 */

// ── Database row types (raw, from Supabase) ────────────────────────

export interface SetLogRow {
  readonly id: string;
  readonly workout_session_exercise_id: string;
  readonly set_number: number;
  readonly weight: number | null;
  readonly weight_unit: string | null;
  readonly reps: number | null;
  readonly rir: number | null;
  readonly status: string;
  readonly classification: string;
  readonly logged_at: string | null;
}

export interface SessionExerciseRow {
  readonly id: string;
  readonly workout_session_id: string;
  readonly exercise_id: string;
  readonly planned_sets: number;
  readonly target_rep_min: number | null;
  readonly target_rep_max: number | null;
  readonly target_rir_min: number | null;
  readonly target_rir_max: number | null;
  readonly status: string;
  readonly planned_exercise_name: string;
}

export interface SessionRow {
  readonly id: string;
  readonly status: string;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly title: string | null;
  readonly was_deload: boolean;
}

export interface ExerciseCatalogRow {
  readonly id: string;
  readonly exercise_name: string;
}

// ── Performance state persistence ──────────────────────────────────

export interface PerformanceStateUpsert {
  readonly user_id: string;
  readonly exercise_id: string;
  readonly status: 'active' | 'insufficient_data';
  readonly source_watermark_set_log_id?: string;
  readonly source_window_started_at?: string;
  readonly source_window_ended_at?: string;
  readonly source_watermark_at?: string;
  readonly last_exposure_at?: string;
  readonly completed_exposure_count: number;
  readonly last_weight?: number;
  readonly last_weight_unit?: string;
  readonly last_reps?: number;
  readonly last_rir?: number;
  readonly engine_version: string;
  readonly rule_set_version: string;
  readonly calculated_at: string;
}

// ── Engine input construction (internal) ───────────────────────────

export interface MappedExposure {
  readonly exposureId: string;
  readonly exerciseId: string;
  readonly status: 'completed' | 'incomplete' | 'skipped';
  readonly occurredAt: string;
  readonly prescription: {
    readonly plannedWorkingSets: number;
    readonly targetRepRange: { readonly minimum: number; readonly maximum: number } | null;
    readonly targetRirRange: { readonly minimum: number; readonly maximum: number } | null;
  } | null;
  readonly substitution: {
    readonly plannedExerciseId: string;
    readonly reasonCode: string;
  } | null;
  readonly wasDeload: boolean;
  readonly sets: readonly MappedSet[];
}

export interface MappedSet {
  readonly setId: string;
  readonly setNumber: number;
  readonly classification: 'warm_up' | 'working';
  readonly status: 'completed' | 'skipped' | 'incomplete';
  readonly load: number | null;
  readonly loadUnit: 'kg' | 'lb' | null;
  readonly reps: number | null;
  readonly rir: number | null;
  readonly performedAt: string | null;
}

// ── Browser-safe DTO types ─────────────────────────────────────────

export interface ProgressionRefreshDto {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly currentWeight: number | null;
  readonly weightUnit: string | null;
  readonly recentReps: number | null;
  readonly targetRir: number | null;
  readonly trend: 'improving' | 'stable' | 'declining' | 'mixed' | null;
  readonly recommendation:
    | 'increase_load'
    | 'maintain_load'
    | 'reduce_load'
    | 'review_deload'
    | 'change_rep_range'
    | 'consider_substitution'
    | 'insufficient_data';
  readonly suggestedNextWeight: number | null;
  readonly reasonCodes: readonly string[];
  readonly sourceExposureCount: number;
  readonly calculatedAt: string;
  readonly engineVersion: string;
  readonly ruleSetVersion: string;
  readonly insufficientData: boolean;
}

export interface RefreshProgressionSuccessResponse {
  readonly status: 'ok';
  readonly progressions: readonly ProgressionRefreshDto[];
  readonly correlationId: string;
}

export interface RefreshProgressionErrorResponse {
  readonly status: 'error';
  readonly code: string;
  readonly message: string;
}

export type RefreshProgressionResponse =
  | RefreshProgressionSuccessResponse
  | RefreshProgressionErrorResponse;

// ── Observability ──────────────────────────────────────────────────

export interface ObservabilitySink {
  emit(event: ObservabilityEvent): void;
}

export type ObservabilityEventKind =
  | 'refresh.progression.received'
  | 'refresh.progression.auth_failed'
  | 'refresh.progression.history_loaded'
  | 'refresh.progression.insufficient_evidence'
  | 'refresh.progression.calculated'
  | 'refresh.progression.persistence_succeeded'
  | 'refresh.progression.persistence_failed'
  | 'refresh.progression.completed';

export interface ObservabilityEvent {
  readonly kind: ObservabilityEventKind;
  readonly correlationId: string;
  readonly metadata: Record<string, unknown>;
}

// ── Persistence ports ──────────────────────────────────────────────

export interface SupabaseServiceClient {
  from(table: 'exercise_performance_state'): {
    upsert(rows: PerformanceStateUpsert[]): {
      select(): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
  from(table: 'workout_decisions'): {
    insert(row: Record<string, unknown>): {
      select(columns: string): {
        single(): PromiseLike<{ data: unknown | null; error: { message: string } | null }>;
      };
    };
  };
}

// ── Engine configuration (deterministic, versioned) ────────────────

export const engineName = 'progression-orchestrator';
export const engineVersion = '1.0.0';
export const ruleSetVersion = 'ruleset-v1';

export const defaultPrescription = {
  targetRepRange: { minimum: 6, maximum: 12 } as const,
  targetRirRange: { minimum: 1, maximum: 3 } as const,
  currentPlannedLoad: null as { value: number; unit: string } | null,
  availableLoadIncrements: { unit: 'kg' as const, increments: [2.5, 5, 10] } as const,
};