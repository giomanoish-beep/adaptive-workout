import {
  isUuid,
  parseVersionIdentifier,
  type ContractVersion,
  type DeterministicEngineVersion,
  type DomainId,
} from '@adaptive-workout/domain';
import type {
  AllocatedMuscleVolumeSummary,
  RejectedWorkoutCandidate,
  SelectedWorkoutExercise,
  UserId,
  WorkoutDecisionId,
  WorkoutDurationDecision,
} from '@adaptive-workout/workout-engine';

export const workoutDecisionPersistenceBoundary = 'server-only' as const;

export type WorkoutSessionId = DomainId<'workout-session'>;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface WorkoutDecisionTraceBatch {
  readonly contractVersion: ContractVersion;
  readonly userId: UserId;
  readonly workoutSessionId?: WorkoutSessionId;
  readonly decidedAt: string;
  readonly version: DeterministicEngineVersion;
  readonly normalizedInput: JsonObject;
  readonly decisionOutput: JsonObject;
  readonly selectedExercises: readonly SelectedWorkoutExercise[];
  readonly exclusions: readonly RejectedWorkoutCandidate[];
  readonly muscleVolumeAllocations: readonly AllocatedMuscleVolumeSummary[];
  readonly durationDecisions: readonly WorkoutDurationDecision[];
}

export const workoutDecisionTypes = [
  'exercise_selected',
  'candidate_excluded',
  'muscle_volume_allocated',
  'duration_reduction',
  'duration_expansion',
] as const;

export type WorkoutDecisionType = (typeof workoutDecisionTypes)[number];

export const workoutDecisionTraceKinds = [
  'selected_exercise',
  'hard_constraint_exclusion',
  'volume_allocation',
  'duration_adjustment',
] as const;

export type WorkoutDecisionTraceKind = (typeof workoutDecisionTraceKinds)[number];

export interface WorkoutDecisionInsertRow {
  readonly user_id: string;
  readonly workout_session_id?: string;
  readonly engine: string;
  readonly engine_version: string;
  readonly rule_set_version: string;
  readonly decision_type: WorkoutDecisionType;
  readonly normalized_input: JsonObject;
  readonly decision_output: JsonObject;
  readonly reason_codes: readonly string[];
  readonly decision_trace: JsonObject;
  readonly created_at: string;
}

export const workoutDecisionBatchValidationCodes = [
  'USER_OWNERSHIP_REQUIRED',
  'INVALID_WORKOUT_SESSION_ID',
  'INVALID_DECISION_TIMESTAMP',
  'INVALID_CONTRACT_VERSION',
  'INVALID_ENGINE_NAME',
  'INVALID_ENGINE_VERSION',
  'INVALID_RULE_SET_VERSION',
  'INVALID_NORMALIZED_INPUT',
  'INVALID_DECISION_OUTPUT',
  'NO_DECISION_EVIDENCE',
  'INVALID_SELECTED_EXERCISE',
  'INVALID_EXCLUSION_EVIDENCE',
  'INVALID_VOLUME_ALLOCATION',
  'INVALID_DURATION_DECISION',
] as const;

export type WorkoutDecisionBatchValidationCode =
  (typeof workoutDecisionBatchValidationCodes)[number];

export interface WorkoutDecisionBatchValidationIssue {
  readonly code: WorkoutDecisionBatchValidationCode;
  readonly path: string;
}

export type WorkoutDecisionMappingResult =
  | { readonly ok: true; readonly rows: readonly WorkoutDecisionInsertRow[] }
  | {
      readonly ok: false;
      readonly issues: readonly WorkoutDecisionBatchValidationIssue[];
    };

export const workoutDecisionPersistenceFailureCodes = [
  'VALIDATION_FAILED',
  'DATABASE_WRITE_FAILED',
  'DATABASE_UNAVAILABLE',
  'PARTIAL_BATCH_RESULT',
  'MALFORMED_DATABASE_RESPONSE',
] as const;

export type WorkoutDecisionPersistenceFailureCode =
  (typeof workoutDecisionPersistenceFailureCodes)[number];

export interface WorkoutDecisionPersistenceFailure {
  readonly ok: false;
  readonly code: WorkoutDecisionPersistenceFailureCode;
  readonly validationIssues?: readonly WorkoutDecisionBatchValidationIssue[];
  readonly databaseCode?: string;
}

export interface WorkoutDecisionPersistenceSuccess {
  readonly ok: true;
  readonly decisionIds: readonly WorkoutDecisionId[];
  readonly persistedCount: number;
}

export type WorkoutDecisionPersistenceResult =
  WorkoutDecisionPersistenceSuccess | WorkoutDecisionPersistenceFailure;

export interface WorkoutDecisionTracePersistencePort {
  persist(batch: WorkoutDecisionTraceBatch): Promise<WorkoutDecisionPersistenceResult>;
}

export interface SupabaseWorkoutDecisionError {
  readonly code?: string;
  readonly message: string;
}

export interface SupabaseWorkoutDecisionInsertResult {
  readonly data: readonly { readonly id: string }[] | null;
  readonly error: SupabaseWorkoutDecisionError | null;
}

export interface SupabaseWorkoutDecisionClient {
  from(table: 'workout_decisions'): {
    insert(rows: readonly WorkoutDecisionInsertRow[]): {
      select(columns: 'id'): PromiseLike<SupabaseWorkoutDecisionInsertResult>;
    };
  };
}

export function mapWorkoutDecisionTraceBatch(
  batch: WorkoutDecisionTraceBatch,
): WorkoutDecisionMappingResult {
  const issues = validateWorkoutDecisionTraceBatch(batch);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const evidence = [
    ...mapSelectedExercises(batch.selectedExercises),
    ...mapExclusions(batch.exclusions),
    ...mapVolumeAllocations(batch.muscleVolumeAllocations),
    ...mapDurationDecisions(batch.durationDecisions),
  ];
  const normalizedInput: JsonObject = {
    contractVersion: batch.contractVersion,
    decidedAt: batch.decidedAt,
    source: batch.normalizedInput,
  };

  return {
    ok: true,
    rows: evidence.map((item, index) => ({
      user_id: batch.userId,
      ...(batch.workoutSessionId ? { workout_session_id: batch.workoutSessionId } : {}),
      engine: batch.version.engineName,
      engine_version: batch.version.engineVersion,
      rule_set_version: batch.version.ruleSetVersion,
      decision_type: item.decisionType,
      normalized_input: normalizedInput,
      decision_output: batch.decisionOutput,
      reason_codes: item.reasonCodes,
      decision_trace: {
        contractVersion: batch.contractVersion,
        sequence: index + 1,
        kind: item.kind,
        evidence: item.evidence,
      },
      created_at: batch.decidedAt,
    })),
  };
}

export function createSupabaseWorkoutDecisionTracePersistence(
  client: SupabaseWorkoutDecisionClient,
): WorkoutDecisionTracePersistencePort {
  return {
    async persist(batch) {
      const mapped = mapWorkoutDecisionTraceBatch(batch);
      if (!mapped.ok) {
        return {
          ok: false,
          code: 'VALIDATION_FAILED',
          validationIssues: mapped.issues,
        };
      }

      let result: SupabaseWorkoutDecisionInsertResult;
      try {
        result = await client.from('workout_decisions').insert(mapped.rows).select('id');
      } catch {
        return { ok: false, code: 'DATABASE_UNAVAILABLE' };
      }

      if (result.error !== null) {
        return {
          ok: false,
          code: 'DATABASE_WRITE_FAILED',
          ...(result.error.code ? { databaseCode: result.error.code } : {}),
        };
      }
      if (result.data === null || result.data.length !== mapped.rows.length) {
        return { ok: false, code: 'PARTIAL_BATCH_RESULT' };
      }
      if (result.data.some(({ id }) => !isUuid(id))) {
        return { ok: false, code: 'MALFORMED_DATABASE_RESPONSE' };
      }

      return {
        ok: true,
        decisionIds: result.data.map(({ id }) => id.toLowerCase() as WorkoutDecisionId),
        persistedCount: result.data.length,
      };
    },
  };
}

export function validateWorkoutDecisionTraceBatch(
  batch: WorkoutDecisionTraceBatch,
): readonly WorkoutDecisionBatchValidationIssue[] {
  const issues: WorkoutDecisionBatchValidationIssue[] = [];
  if (!isUuid(batch.userId)) {
    issues.push({ code: 'USER_OWNERSHIP_REQUIRED', path: 'userId' });
  }
  if (batch.workoutSessionId !== undefined && !isUuid(batch.workoutSessionId)) {
    issues.push({ code: 'INVALID_WORKOUT_SESSION_ID', path: 'workoutSessionId' });
  }
  if (!isValidTimestamp(batch.decidedAt)) {
    issues.push({ code: 'INVALID_DECISION_TIMESTAMP', path: 'decidedAt' });
  }
  if (!parseVersionIdentifier(batch.contractVersion, 'contract').ok) {
    issues.push({ code: 'INVALID_CONTRACT_VERSION', path: 'contractVersion' });
  }
  if (batch.version.engineName.trim().length === 0 || batch.version.engineName.trim().length > 64) {
    issues.push({ code: 'INVALID_ENGINE_NAME', path: 'version.engineName' });
  }
  if (!parseVersionIdentifier(batch.version.engineVersion, 'engine').ok) {
    issues.push({ code: 'INVALID_ENGINE_VERSION', path: 'version.engineVersion' });
  }
  if (!parseVersionIdentifier(batch.version.ruleSetVersion, 'rule-set').ok) {
    issues.push({ code: 'INVALID_RULE_SET_VERSION', path: 'version.ruleSetVersion' });
  }
  if (!isJsonObject(batch.normalizedInput)) {
    issues.push({ code: 'INVALID_NORMALIZED_INPUT', path: 'normalizedInput' });
  }
  if (!isJsonObject(batch.decisionOutput)) {
    issues.push({ code: 'INVALID_DECISION_OUTPUT', path: 'decisionOutput' });
  }
  if (decisionCount(batch) === 0) {
    issues.push({ code: 'NO_DECISION_EVIDENCE', path: 'decisionEvidence' });
  }
  batch.selectedExercises.forEach((selected, index) => {
    if (
      !isUuid(selected.exerciseId) ||
      !isUuid(selected.exerciseFamilyId) ||
      !Number.isInteger(selected.position) ||
      selected.position <= 0 ||
      !Number.isInteger(selected.plannedWorkingSets) ||
      selected.plannedWorkingSets <= 0 ||
      selected.reasonCodes.length === 0
    ) {
      issues.push({ code: 'INVALID_SELECTED_EXERCISE', path: `selectedExercises[${index}]` });
    }
  });
  batch.exclusions.forEach((excluded, index) => {
    if (!isUuid(excluded.candidate.exerciseId) || excluded.reasons.length === 0) {
      issues.push({ code: 'INVALID_EXCLUSION_EVIDENCE', path: `exclusions[${index}]` });
    }
  });
  batch.muscleVolumeAllocations.forEach((volume, index) => {
    if (
      !isUuid(volume.muscleId) ||
      !isNonNegativeFinite(volume.targetWorkingSets) ||
      !isNonNegativeFinite(volume.minimumWorkingSets) ||
      !isNonNegativeFinite(volume.maximumWorkingSets) ||
      !isNonNegativeFinite(volume.weightedWorkingSetContribution) ||
      volume.minimumWorkingSets > volume.targetWorkingSets ||
      volume.targetWorkingSets > volume.maximumWorkingSets
    ) {
      issues.push({
        code: 'INVALID_VOLUME_ALLOCATION',
        path: `muscleVolumeAllocations[${index}]`,
      });
    }
  });
  batch.durationDecisions.forEach((decision, index) => {
    if (
      !isUuid(decision.exerciseId) ||
      !Number.isInteger(decision.previousWorkingSets) ||
      decision.previousWorkingSets < 0 ||
      !Number.isInteger(decision.resultingWorkingSets) ||
      decision.resultingWorkingSets < 0 ||
      (decision.recipientExerciseId !== undefined && !isUuid(decision.recipientExerciseId))
    ) {
      issues.push({ code: 'INVALID_DURATION_DECISION', path: `durationDecisions[${index}]` });
    }
  });
  return issues;
}

interface MappedDecisionEvidence {
  readonly decisionType: WorkoutDecisionType;
  readonly kind: WorkoutDecisionTraceKind;
  readonly reasonCodes: readonly string[];
  readonly evidence: JsonObject;
}

function mapSelectedExercises(
  selectedExercises: readonly SelectedWorkoutExercise[],
): readonly MappedDecisionEvidence[] {
  return [...selectedExercises]
    .sort(
      (left, right) =>
        left.position - right.position || left.exerciseId.localeCompare(right.exerciseId),
    )
    .map((selected) => ({
      decisionType: 'exercise_selected',
      kind: 'selected_exercise',
      reasonCodes: [...selected.reasonCodes],
      evidence: {
        exerciseId: selected.exerciseId,
        exerciseFamilyId: selected.exerciseFamilyId,
        position: selected.position,
        plannedWorkingSets: selected.plannedWorkingSets,
        scoreRank: selected.scoreRank,
        score: selected.score,
      },
    }));
}

function mapExclusions(
  exclusions: readonly RejectedWorkoutCandidate[],
): readonly MappedDecisionEvidence[] {
  return [...exclusions]
    .sort((left, right) => left.candidate.exerciseId.localeCompare(right.candidate.exerciseId))
    .map((excluded) => {
      const reasons = [...excluded.reasons].sort(
        (left, right) =>
          left.code.localeCompare(right.code) ||
          (left.constraintId ?? '').localeCompare(right.constraintId ?? ''),
      );
      return {
        decisionType: 'candidate_excluded',
        kind: 'hard_constraint_exclusion',
        reasonCodes: reasons.map(({ code }) => code),
        evidence: {
          exerciseId: excluded.candidate.exerciseId,
          exerciseFamilyId: excluded.candidate.exerciseFamilyId,
          reasons: reasons.map((reason) => ({
            code: reason.code,
            ...(reason.constraintId ? { constraintId: reason.constraintId } : {}),
            ...(reason.relatedEquipmentIds
              ? { relatedEquipmentIds: [...reason.relatedEquipmentIds].sort() }
              : {}),
            ...(reason.relatedMuscleIds
              ? { relatedMuscleIds: [...reason.relatedMuscleIds].sort() }
              : {}),
            ...(reason.invalidityCodes
              ? { invalidityCodes: [...reason.invalidityCodes].sort() }
              : {}),
          })),
        },
      };
    });
}

function mapVolumeAllocations(
  allocations: readonly AllocatedMuscleVolumeSummary[],
): readonly MappedDecisionEvidence[] {
  return [...allocations]
    .sort((left, right) => left.muscleId.localeCompare(right.muscleId))
    .map((allocation) => ({
      decisionType: 'muscle_volume_allocated',
      kind: 'volume_allocation',
      reasonCodes: ['MUSCLE_VOLUME_ALLOCATED'],
      evidence: {
        muscleId: allocation.muscleId,
        targetWorkingSets: allocation.targetWorkingSets,
        minimumWorkingSets: allocation.minimumWorkingSets,
        maximumWorkingSets: allocation.maximumWorkingSets,
        weightedWorkingSetContribution: allocation.weightedWorkingSetContribution,
      },
    }));
}

function mapDurationDecisions(
  decisions: readonly WorkoutDurationDecision[],
): readonly MappedDecisionEvidence[] {
  return [...decisions]
    .sort(
      (left, right) =>
        left.code.localeCompare(right.code) ||
        left.exerciseId.localeCompare(right.exerciseId) ||
        left.previousWorkingSets - right.previousWorkingSets ||
        left.resultingWorkingSets - right.resultingWorkingSets,
    )
    .map((decision) => ({
      decisionType: isDurationExpansion(decision) ? 'duration_expansion' : 'duration_reduction',
      kind: 'duration_adjustment',
      reasonCodes: [decision.code],
      evidence: {
        exerciseId: decision.exerciseId,
        previousWorkingSets: decision.previousWorkingSets,
        resultingWorkingSets: decision.resultingWorkingSets,
        ...(decision.recipientExerciseId
          ? { recipientExerciseId: decision.recipientExerciseId }
          : {}),
      },
    }));
}

function isDurationExpansion(decision: WorkoutDurationDecision): boolean {
  return (
    decision.code === 'ADDED_WORKING_SET_FOR_DURATION_BUDGET' ||
    decision.code === 'ADDED_EXERCISE_FOR_DURATION_BUDGET'
  );
}

function decisionCount(batch: WorkoutDecisionTraceBatch): number {
  return (
    batch.selectedExercises.length +
    batch.exclusions.length +
    batch.muscleVolumeAllocations.length +
    batch.durationDecisions.length
  );
}

function isValidTimestamp(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isJsonObject(value: unknown): value is JsonObject {
  return isJsonValue(value) && !Array.isArray(value) && value !== null && typeof value === 'object';
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
      Object.values(value).every((item) => isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}
