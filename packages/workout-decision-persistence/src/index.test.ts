import type {
  ContractVersion,
  DomainId,
  EngineVersion,
  EquipmentId,
  ExerciseFamilyId,
  ExerciseId,
  MuscleId,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import type { UserId, WorkoutExerciseCandidate } from '@adaptive-workout/workout-engine';
import { describe, expect, it } from 'vitest';
import persistencePackage from '../package.json' with { type: 'json' };
import workoutEnginePackage from '../../workout-engine/package.json' with { type: 'json' };
import {
  createSupabaseWorkoutDecisionTracePersistence,
  mapWorkoutDecisionTraceBatch,
  workoutDecisionPersistenceBoundary,
  type SupabaseWorkoutDecisionClient,
  type SupabaseWorkoutDecisionInsertResult,
  type WorkoutDecisionInsertRow,
  type WorkoutDecisionTraceBatch,
  type WorkoutSessionId,
} from './index.js';

const userId = id('10000000-0000-0000-0000-000000000001', 'user') as UserId;
const workoutSessionId = id(
  '10000000-0000-0000-0000-000000000002',
  'workout-session',
) as WorkoutSessionId;
const selectedExerciseId = id('20000000-0000-0000-0000-000000000001', 'exercise') as ExerciseId;
const excludedExerciseId = id('20000000-0000-0000-0000-000000000002', 'exercise') as ExerciseId;
const exerciseFamilyId = id(
  '30000000-0000-0000-0000-000000000001',
  'exercise-family',
) as ExerciseFamilyId;
const muscleId = id('40000000-0000-0000-0000-000000000001', 'muscle') as MuscleId;
const equipmentId = id('50000000-0000-0000-0000-000000000001', 'equipment') as EquipmentId;

describe('workout decision trace persistence', () => {
  it('maps selected-exercise evidence', () => {
    const row = rowFor(baseBatch(), 'exercise_selected');

    expect(row.reason_codes).toEqual(['TARGET_VOLUME_COVERAGE', 'HIGH_RANKED_CANDIDATE']);
    expect(row.decision_trace).toMatchObject({
      kind: 'selected_exercise',
      evidence: {
        exerciseId: selectedExerciseId,
        position: 1,
        plannedWorkingSets: 4,
        scoreRank: 1,
      },
    });
  });

  it('maps hard-constraint exclusion evidence', () => {
    const row = rowFor(baseBatch(), 'candidate_excluded');

    expect(row.reason_codes).toEqual(['EXPLICITLY_UNAVAILABLE_EQUIPMENT']);
    expect(row.decision_trace).toMatchObject({
      kind: 'hard_constraint_exclusion',
      evidence: {
        exerciseId: excludedExerciseId,
        reasons: [
          {
            code: 'EXPLICITLY_UNAVAILABLE_EQUIPMENT',
            constraintId: 'unavailable-cable',
            relatedEquipmentIds: [equipmentId],
          },
        ],
      },
    });
  });

  it('maps muscle-volume allocation evidence', () => {
    const row = rowFor(baseBatch(), 'muscle_volume_allocated');

    expect(row.reason_codes).toEqual(['MUSCLE_VOLUME_ALLOCATED']);
    expect(row.decision_trace).toMatchObject({
      kind: 'volume_allocation',
      evidence: {
        muscleId,
        targetWorkingSets: 4,
        weightedWorkingSetContribution: 4,
      },
    });
  });

  it('maps duration reduction evidence', () => {
    const row = rowFor(baseBatch(), 'duration_reduction');

    expect(row.reason_codes).toEqual(['REDUCED_OPTIONAL_VOLUME']);
    expect(row.decision_trace).toMatchObject({
      kind: 'duration_adjustment',
      evidence: {
        exerciseId: selectedExerciseId,
        previousWorkingSets: 5,
        resultingWorkingSets: 4,
      },
    });
  });

  it('maps duration expansion evidence', () => {
    const row = rowFor(baseBatch(), 'duration_expansion');

    expect(row.reason_codes).toEqual(['ADDED_WORKING_SET_FOR_DURATION_BUDGET']);
    expect(row.decision_trace).toMatchObject({
      kind: 'duration_adjustment',
      evidence: {
        exerciseId: selectedExerciseId,
        previousWorkingSets: 3,
        resultingWorkingSets: 4,
      },
    });
  });

  it('preserves all version fields and the decision timestamp exactly', () => {
    const batch = baseBatch();
    const rows = mappedRows(batch);

    rows.forEach((row) => {
      expect(row).toMatchObject({
        engine: batch.version.engineName,
        engine_version: batch.version.engineVersion,
        rule_set_version: batch.version.ruleSetVersion,
        created_at: batch.decidedAt,
        normalized_input: {
          contractVersion: batch.contractVersion,
          decidedAt: batch.decidedAt,
        },
        decision_trace: { contractVersion: batch.contractVersion },
      });
    });
  });

  it('requires valid user ownership before writing', async () => {
    const database = mockClient(successfulInsertResult(5));
    const persistence = createSupabaseWorkoutDecisionTracePersistence(database.client);
    const result = await persistence.persist({
      ...baseBatch(),
      userId: '' as UserId,
    });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(database.insertCalls).toBe(0);
  });

  it('preserves optional workout-session linkage', () => {
    expect(
      mappedRows(baseBatch()).every((row) => row.workout_session_id === workoutSessionId),
    ).toBe(true);
    expect(
      mappedRows({ ...baseBatch(), workoutSessionId: undefined }).every(
        (row) => row.workout_session_id === undefined,
      ),
    ).toBe(true);
  });

  it('writes a deterministic decision order in one atomic batch', async () => {
    const original = baseBatch();
    const reversed: WorkoutDecisionTraceBatch = {
      ...original,
      selectedExercises: [...original.selectedExercises].reverse(),
      exclusions: [...original.exclusions].reverse(),
      muscleVolumeAllocations: [...original.muscleVolumeAllocations].reverse(),
      durationDecisions: [...original.durationDecisions].reverse(),
    };
    expect(mappedRows(reversed)).toEqual(mappedRows(original));

    const database = mockClient(successfulInsertResult(5));
    const result = await createSupabaseWorkoutDecisionTracePersistence(database.client).persist(
      original,
    );

    expect(result).toMatchObject({ ok: true, persistedCount: 5 });
    expect(database.insertCalls).toBe(1);
    expect(database.rows.map(({ decision_type }) => decision_type)).toEqual([
      'exercise_selected',
      'candidate_excluded',
      'muscle_volume_allocated',
      'duration_expansion',
      'duration_reduction',
    ]);
  });

  it('rejects malformed evidence before database write', async () => {
    const database = mockClient(successfulInsertResult(5));
    const persistence = createSupabaseWorkoutDecisionTracePersistence(database.client);
    const selected = baseBatch().selectedExercises[0]!;
    const result = await persistence.persist({
      ...baseBatch(),
      selectedExercises: [{ ...selected, plannedWorkingSets: 0 }],
    });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(database.insertCalls).toBe(0);
  });

  it('returns a typed database failure', async () => {
    const database = mockClient({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });
    const result = await createSupabaseWorkoutDecisionTracePersistence(database.client).persist(
      baseBatch(),
    );

    expect(result).toEqual({ ok: false, code: 'DATABASE_WRITE_FAILED', databaseCode: '42501' });
  });

  it('does not report false success for an incomplete batch result', async () => {
    const database = mockClient(successfulInsertResult(4));
    const result = await createSupabaseWorkoutDecisionTracePersistence(database.client).persist(
      baseBatch(),
    );

    expect(result).toEqual({ ok: false, code: 'PARTIAL_BATCH_RESULT' });
  });

  it('is explicitly server-only and has no browser secret configuration', () => {
    expect(workoutDecisionPersistenceBoundary).toBe('server-only');
    expect(persistencePackage.browser).toBe(false);
    expect(JSON.stringify(persistencePackage)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('keeps the pure workout-engine package free of Supabase dependencies', () => {
    expect(workoutEnginePackage.dependencies).not.toHaveProperty('@supabase/supabase-js');
    expect(JSON.stringify(workoutEnginePackage)).not.toContain('supabase');
  });
});

function baseBatch(): WorkoutDecisionTraceBatch {
  return {
    contractVersion: version('workout-decision-trace-v1') as ContractVersion,
    userId,
    workoutSessionId,
    decidedAt: '2026-07-14T14:00:00.000Z',
    version: {
      engineName: 'deterministic-workout-engine',
      engineVersion: version('workout-engine-v1') as EngineVersion,
      ruleSetVersion: version('workout-rules-v1') as RuleSetVersion,
    },
    normalizedInput: {
      targetMuscleIds: [muscleId],
      availableDurationMinutes: 45,
    },
    decisionOutput: {
      exerciseIds: [selectedExerciseId],
      estimatedDurationMinutes: 42,
    },
    selectedExercises: [
      {
        position: 1,
        exerciseId: selectedExerciseId,
        exerciseFamilyId,
        plannedWorkingSets: 4,
        scoreRank: 1,
        score: 87,
        reasonCodes: ['TARGET_VOLUME_COVERAGE', 'HIGH_RANKED_CANDIDATE'],
      },
    ],
    exclusions: [
      {
        candidate: candidate(excludedExerciseId),
        reasons: [
          {
            code: 'EXPLICITLY_UNAVAILABLE_EQUIPMENT',
            constraintId: 'unavailable-cable',
            relatedEquipmentIds: [equipmentId],
          },
        ],
      },
    ],
    muscleVolumeAllocations: [
      {
        muscleId,
        targetWorkingSets: 4,
        minimumWorkingSets: 3,
        maximumWorkingSets: 8,
        weightedWorkingSetContribution: 4,
      },
    ],
    durationDecisions: [
      {
        code: 'REDUCED_OPTIONAL_VOLUME',
        exerciseId: selectedExerciseId,
        previousWorkingSets: 5,
        resultingWorkingSets: 4,
      },
      {
        code: 'ADDED_WORKING_SET_FOR_DURATION_BUDGET',
        exerciseId: selectedExerciseId,
        previousWorkingSets: 3,
        resultingWorkingSets: 4,
      },
    ],
  };
}

function candidate(exerciseId: ExerciseId): WorkoutExerciseCandidate {
  return {
    exerciseId,
    exerciseFamilyId,
    isActive: true,
    muscleContributions: [{ muscleId, role: 'primary', contribution: 1 }],
    equipment: [{ equipmentId, requirement: 'required' }],
  };
}

function mappedRows(batch: WorkoutDecisionTraceBatch): readonly WorkoutDecisionInsertRow[] {
  const mapped = mapWorkoutDecisionTraceBatch(batch);
  if (!mapped.ok) {
    throw new Error(`Unexpected invalid fixture: ${JSON.stringify(mapped.issues)}`);
  }
  return mapped.rows;
}

function rowFor(
  batch: WorkoutDecisionTraceBatch,
  decisionType: WorkoutDecisionInsertRow['decision_type'],
): WorkoutDecisionInsertRow {
  const row = mappedRows(batch).find(({ decision_type }) => decision_type === decisionType);
  if (row === undefined) {
    throw new Error(`Missing ${decisionType} row.`);
  }
  return row;
}

function mockClient(result: SupabaseWorkoutDecisionInsertResult): {
  readonly client: SupabaseWorkoutDecisionClient;
  insertCalls: number;
  rows: readonly WorkoutDecisionInsertRow[];
} {
  const state = {
    insertCalls: 0,
    rows: [] as readonly WorkoutDecisionInsertRow[],
  };
  return {
    get insertCalls() {
      return state.insertCalls;
    },
    get rows() {
      return state.rows;
    },
    client: {
      from(table) {
        expect(table).toBe('workout_decisions');
        return {
          insert(rows) {
            state.insertCalls += 1;
            state.rows = rows;
            return {
              select(columns) {
                expect(columns).toBe('id');
                return Promise.resolve(result);
              },
            };
          },
        };
      },
    },
  };
}

function successfulInsertResult(count: number): SupabaseWorkoutDecisionInsertResult {
  return {
    data: Array.from({ length: count }, (_, index) => ({
      id: `90000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
    })),
    error: null,
  };
}

function id<EntityName extends string>(
  value: string,
  entityName: EntityName,
): DomainId<EntityName> {
  if (entityName.length === 0) {
    throw new Error('Fixture entity name is required.');
  }
  return value as DomainId<EntityName>;
}

function version(value: string): string {
  return value;
}
