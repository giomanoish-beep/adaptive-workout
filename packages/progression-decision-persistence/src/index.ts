import { isUuid, parseVersionIdentifier, type DomainId } from '@adaptive-workout/domain';
import {
  progressionRecommendationActions,
  progressionRecommendationReasonCodes,
  type ProgressionRecommendation,
  type ProgressionRecommendationAction,
} from '@adaptive-workout/progression-engine';

export const progressionDecisionPersistenceBoundary = 'server-only' as const;

export type WorkoutDecisionId = DomainId<'workout-decision'>;
export type WorkoutSessionId = DomainId<'workout-session'>;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface ProgressionDecisionTrace {
  readonly recommendation: ProgressionRecommendation;
  readonly workoutSessionId?: WorkoutSessionId;
}

export const progressionDecisionTypes = [
  'progression_increase_load',
  'progression_maintain_load',
  'progression_reduce_load',
  'progression_review_deload',
  'progression_change_rep_range',
  'progression_consider_substitution',
] as const;

export type ProgressionDecisionType = (typeof progressionDecisionTypes)[number];

export interface ProgressionDecisionInsertRow {
  readonly user_id: string;
  readonly workout_session_id?: string;
  readonly engine: string;
  readonly engine_version: string;
  readonly rule_set_version: string;
  readonly decision_type: ProgressionDecisionType;
  readonly normalized_input: JsonObject;
  readonly decision_output: JsonObject;
  readonly reason_codes: readonly string[];
  readonly decision_trace: JsonObject;
  readonly created_at: string;
}

export const progressionDecisionValidationCodes = [
  'USER_OWNERSHIP_REQUIRED',
  'EXERCISE_ID_REQUIRED',
  'INVALID_WORKOUT_SESSION_ID',
  'INVALID_DECISION_TIMESTAMP',
  'INVALID_CONTRACT_VERSION',
  'INVALID_ENGINE_NAME',
  'INVALID_ENGINE_VERSION',
  'INVALID_RULE_SET_VERSION',
  'INVALID_RECOMMENDATION_ACTION',
  'INVALID_REASON_CODES',
  'INVALID_SOURCE_EVIDENCE',
  'IDENTITY_MISMATCH',
  'VERSION_MISMATCH',
] as const;

export type ProgressionDecisionValidationCode = (typeof progressionDecisionValidationCodes)[number];

export interface ProgressionDecisionValidationIssue {
  readonly code: ProgressionDecisionValidationCode;
  readonly path: string;
}

export type ProgressionDecisionMappingResult =
  | { readonly ok: true; readonly row: ProgressionDecisionInsertRow }
  | { readonly ok: false; readonly issues: readonly ProgressionDecisionValidationIssue[] };

export const progressionDecisionPersistenceFailureCodes = [
  'VALIDATION_FAILED',
  'DATABASE_UNAVAILABLE',
  'DATABASE_WRITE_FAILED',
  'MALFORMED_DATABASE_RESPONSE',
  'IDENTITY_MISMATCH',
] as const;

export type ProgressionDecisionPersistenceFailureCode =
  (typeof progressionDecisionPersistenceFailureCodes)[number];

export interface ProgressionDecisionPersistenceFailure {
  readonly ok: false;
  readonly status: 'failed';
  readonly code: ProgressionDecisionPersistenceFailureCode;
  readonly validationIssues?: readonly ProgressionDecisionValidationIssue[];
  readonly databaseCode?: string;
}

export interface ProgressionDecisionPersistenceSuccess {
  readonly ok: true;
  readonly status: 'persisted';
  readonly decisionId: WorkoutDecisionId;
}

export type ProgressionDecisionPersistenceResult =
  ProgressionDecisionPersistenceSuccess | ProgressionDecisionPersistenceFailure;

export interface ProgressionDecisionTracePersistencePort {
  persist(trace: ProgressionDecisionTrace): Promise<ProgressionDecisionPersistenceResult>;
}

export interface SupabaseProgressionDecisionError {
  readonly code?: string;
  readonly message: string;
}

export interface SupabaseProgressionDecisionReturnedRow {
  readonly id: string;
  readonly user_id: string;
  readonly engine: string;
  readonly decision_type: string;
}

export interface SupabaseProgressionDecisionInsertResult {
  readonly data: SupabaseProgressionDecisionReturnedRow | null;
  readonly error: SupabaseProgressionDecisionError | null;
}

export interface SupabaseProgressionDecisionClient {
  from(table: 'workout_decisions'): {
    insert(row: ProgressionDecisionInsertRow): {
      select(columns: 'id,user_id,engine,decision_type'): {
        single(): PromiseLike<SupabaseProgressionDecisionInsertResult>;
      };
    };
  };
}

export function mapProgressionDecisionTrace(
  trace: ProgressionDecisionTrace,
): ProgressionDecisionMappingResult {
  const issues = validateProgressionDecisionTrace(trace);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const { recommendation } = trace;
  const evidence = normalizeJsonObject(recommendation.evidence)!;
  return {
    ok: true,
    row: {
      user_id: recommendation.subjectId,
      ...(trace.workoutSessionId ? { workout_session_id: trace.workoutSessionId } : {}),
      engine: recommendation.version.engineName,
      engine_version: recommendation.version.engineVersion,
      rule_set_version: recommendation.version.ruleSetVersion,
      decision_type: decisionTypeFor(recommendation.action),
      normalized_input: {
        analysisContractVersion: recommendation.evidence.analysis.contractVersion,
        calculatedAt: recommendation.calculatedAt,
        exerciseId: recommendation.exerciseId,
        previousLoad: normalizeJsonValue(recommendation.previousLoad),
        sourceExposureIds: [...recommendation.evidence.exposureIds],
        sourceSetIds: [...recommendation.evidence.setIds],
        subjectId: recommendation.subjectId,
        targetRepRange: normalizeJsonValue(recommendation.targetRepRange),
        targetRirRange: normalizeJsonValue(recommendation.targetRirRange ?? null),
      },
      decision_output: {
        action: recommendation.action,
        contractVersion: recommendation.contractVersion,
        recommendedLoad: normalizeJsonValue(recommendation.recommendedLoad),
      },
      reason_codes: [...recommendation.reasonCodes],
      decision_trace: {
        contractVersion: recommendation.contractVersion,
        evidence,
        kind: 'progression_recommendation',
      },
      created_at: recommendation.calculatedAt,
    },
  };
}

export function createSupabaseProgressionDecisionTracePersistence(
  client: SupabaseProgressionDecisionClient,
): ProgressionDecisionTracePersistencePort {
  return {
    async persist(trace) {
      const mapped = mapProgressionDecisionTrace(trace);
      if (!mapped.ok) {
        return {
          ok: false,
          status: 'failed',
          code: 'VALIDATION_FAILED',
          validationIssues: mapped.issues,
        };
      }

      let result: SupabaseProgressionDecisionInsertResult;
      try {
        result = await client
          .from('workout_decisions')
          .insert(mapped.row)
          .select('id,user_id,engine,decision_type')
          .single();
      } catch {
        return { ok: false, status: 'failed', code: 'DATABASE_UNAVAILABLE' };
      }

      if (result.error !== null) {
        return {
          ok: false,
          status: 'failed',
          code: 'DATABASE_WRITE_FAILED',
          ...(result.error.code ? { databaseCode: result.error.code } : {}),
        };
      }
      if (
        result.data === null ||
        typeof result.data.id !== 'string' ||
        typeof result.data.user_id !== 'string' ||
        typeof result.data.engine !== 'string' ||
        typeof result.data.decision_type !== 'string' ||
        !isUuid(result.data.id) ||
        !isUuid(result.data.user_id) ||
        !isProgressionDecisionType(result.data.decision_type) ||
        result.data.engine.trim().length === 0
      ) {
        return { ok: false, status: 'failed', code: 'MALFORMED_DATABASE_RESPONSE' };
      }
      if (
        result.data.user_id !== mapped.row.user_id ||
        result.data.engine !== mapped.row.engine ||
        result.data.decision_type !== mapped.row.decision_type
      ) {
        return { ok: false, status: 'failed', code: 'IDENTITY_MISMATCH' };
      }

      return {
        ok: true,
        status: 'persisted',
        decisionId: result.data.id.toLowerCase() as WorkoutDecisionId,
      };
    },
  };
}

export function validateProgressionDecisionTrace(
  trace: ProgressionDecisionTrace,
): readonly ProgressionDecisionValidationIssue[] {
  const { recommendation } = trace;
  const issues: ProgressionDecisionValidationIssue[] = [];
  if (!isUuid(recommendation.subjectId)) {
    issues.push({ code: 'USER_OWNERSHIP_REQUIRED', path: 'recommendation.subjectId' });
  }
  if (!isUuid(recommendation.exerciseId)) {
    issues.push({ code: 'EXERCISE_ID_REQUIRED', path: 'recommendation.exerciseId' });
  }
  if (trace.workoutSessionId !== undefined && !isUuid(trace.workoutSessionId)) {
    issues.push({ code: 'INVALID_WORKOUT_SESSION_ID', path: 'workoutSessionId' });
  }
  if (!isValidTimestamp(recommendation.calculatedAt)) {
    issues.push({ code: 'INVALID_DECISION_TIMESTAMP', path: 'recommendation.calculatedAt' });
  }
  if (
    !parseVersionIdentifier(recommendation.contractVersion, 'contract').ok ||
    !parseVersionIdentifier(recommendation.evidence.analysis.contractVersion, 'contract').ok ||
    !parseVersionIdentifier(recommendation.evidence.analysis.ruleSetContractVersion, 'contract').ok
  ) {
    issues.push({ code: 'INVALID_CONTRACT_VERSION', path: 'recommendation.contractVersion' });
  }
  if (
    recommendation.version.engineName.trim().length === 0 ||
    recommendation.version.engineName.trim().length > 64
  ) {
    issues.push({ code: 'INVALID_ENGINE_NAME', path: 'recommendation.version.engineName' });
  }
  if (!parseVersionIdentifier(recommendation.version.engineVersion, 'engine').ok) {
    issues.push({ code: 'INVALID_ENGINE_VERSION', path: 'recommendation.version.engineVersion' });
  }
  if (!parseVersionIdentifier(recommendation.version.ruleSetVersion, 'rule-set').ok) {
    issues.push({
      code: 'INVALID_RULE_SET_VERSION',
      path: 'recommendation.version.ruleSetVersion',
    });
  }
  if (!isProgressionRecommendationAction(recommendation.action)) {
    issues.push({ code: 'INVALID_RECOMMENDATION_ACTION', path: 'recommendation.action' });
  }
  if (
    recommendation.reasonCodes.length === 0 ||
    recommendation.reasonCodes.some(
      (code) => !(progressionRecommendationReasonCodes as readonly string[]).includes(code),
    )
  ) {
    issues.push({ code: 'INVALID_REASON_CODES', path: 'recommendation.reasonCodes' });
  }
  if (
    recommendation.evidence.exposureIds.length === 0 ||
    recommendation.evidence.exposureIds.some((id) => !isUuid(id)) ||
    recommendation.evidence.setIds.some((id) => !isUuid(id)) ||
    !isJsonObject(recommendation.evidence)
  ) {
    issues.push({ code: 'INVALID_SOURCE_EVIDENCE', path: 'recommendation.evidence' });
  }
  if (
    recommendation.evidence.analysis.subjectId !== recommendation.subjectId ||
    recommendation.evidence.analysis.exerciseId !== recommendation.exerciseId
  ) {
    issues.push({ code: 'IDENTITY_MISMATCH', path: 'recommendation.evidence.analysis' });
  }
  if (
    recommendation.evidence.analysis.version.engineName !== recommendation.version.engineName ||
    recommendation.evidence.analysis.version.engineVersion !==
      recommendation.version.engineVersion ||
    recommendation.evidence.analysis.version.ruleSetVersion !==
      recommendation.version.ruleSetVersion ||
    recommendation.evidence.analysis.calculatedAt !== recommendation.calculatedAt
  ) {
    issues.push({ code: 'VERSION_MISMATCH', path: 'recommendation.evidence.analysis' });
  }
  return issues;
}

function decisionTypeFor(action: ProgressionRecommendationAction): ProgressionDecisionType {
  return `progression_${action}`;
}

function isProgressionRecommendationAction(
  value: unknown,
): value is ProgressionRecommendationAction {
  return (progressionRecommendationActions as readonly unknown[]).includes(value);
}

function isProgressionDecisionType(value: string): value is ProgressionDecisionType {
  return (progressionDecisionTypes as readonly string[]).includes(value);
}

function isValidTimestamp(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function normalizeJsonObject(value: unknown): JsonObject | null {
  const normalized = normalizeJsonValue(value);
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== 'object') {
    return null;
  }
  return normalized as JsonObject;
}

function normalizeJsonValue(value: unknown, ancestors = new Set<unknown>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    return null;
  }
  ancestors.add(value);
  const normalized: JsonValue = Array.isArray(value)
    ? value.map((item) => normalizeJsonValue(item, ancestors))
    : Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalizeJsonValue(item, ancestors)]),
      );
  ancestors.delete(value);
  return normalized;
}

function isJsonObject(value: unknown): value is JsonObject {
  return isJsonValue(value) && value !== null && !Array.isArray(value) && typeof value === 'object';
}

function isJsonValue(value: unknown, ancestors = new Set<unknown>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    return false;
  }
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, ancestors))
    : Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value).every((item) => item !== undefined && isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}
