import type {
  ContractVersion,
  DomainId,
  EngineVersion,
  ExerciseId,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import type {
  ExerciseExposureId,
  PerformedSetId,
  ProgressionRecommendation,
  ProgressionRecommendationAction,
  ProgressionRecommendationReasonCode,
  ProgressionSubjectId,
} from '@adaptive-workout/progression-engine';
import { describe, expect, it } from 'vitest';
import progressionEnginePackage from '../../progression-engine/package.json' with { type: 'json' };
import persistencePackage from '../package.json' with { type: 'json' };
import {
  createSupabaseProgressionDecisionTracePersistence,
  mapProgressionDecisionTrace,
  progressionDecisionPersistenceBoundary,
  type ProgressionDecisionInsertRow,
  type ProgressionDecisionTrace,
  type SupabaseProgressionDecisionClient,
  type SupabaseProgressionDecisionInsertResult,
  type WorkoutSessionId,
} from './index.js';

const userId = id('10000000-0000-0000-0000-000000000001', 'user') as ProgressionSubjectId;
const otherUserId = id('10000000-0000-0000-0000-000000000002', 'user');
const exerciseId = id('20000000-0000-0000-0000-000000000001', 'exercise') as ExerciseId;
const workoutSessionId = id(
  '30000000-0000-0000-0000-000000000001',
  'workout-session',
) as WorkoutSessionId;
const exposureId = id(
  '40000000-0000-0000-0000-000000000001',
  'workout-session-exercise',
) as ExerciseExposureId;
const setId = id('50000000-0000-0000-0000-000000000001', 'set-log') as PerformedSetId;
const decisionId = '60000000-0000-0000-0000-000000000001';

describe('progression decision trace persistence', () => {
  it.each([
    ['increase_load', 'TARGET_REPS_ACHIEVED'],
    ['maintain_load', 'LOAD_MAINTAINED'],
    ['reduce_load', 'LOAD_REDUCTION_APPLIED'],
    ['consider_substitution', 'SUBSTITUTION_REVIEW_SIGNAL'],
    ['review_deload', 'DELOAD_REVIEW_SIGNAL'],
  ] as const)('maps the %s recommendation deterministically', (action, reasonCode) => {
    const trace = traceFor(action, reasonCode);
    const first = mappedRow(trace);
    const second = mappedRow(trace);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      user_id: userId,
      workout_session_id: workoutSessionId,
      engine: trace.recommendation.version.engineName,
      engine_version: trace.recommendation.version.engineVersion,
      rule_set_version: trace.recommendation.version.ruleSetVersion,
      decision_type: `progression_${action}`,
      reason_codes: [reasonCode],
      created_at: trace.recommendation.calculatedAt,
      normalized_input: {
        exerciseId,
        sourceExposureIds: [exposureId],
        sourceSetIds: [setId],
        subjectId: userId,
      },
      decision_output: { action },
      decision_trace: { kind: 'progression_recommendation' },
    });
  });

  it('preserves plateau, substitution-review, and deload evidence without changing state fields', () => {
    const plateau = mappedRow(traceFor('maintain_load', 'PLATEAU_SIGNAL', 'plateau'));
    const substitution = mappedRow(
      traceFor('consider_substitution', 'SUBSTITUTION_REVIEW_SIGNAL', 'plateau'),
    );
    const deload = mappedRow(traceFor('review_deload', 'DELOAD_REVIEW_SIGNAL', 'deload'));

    expect(plateau.decision_trace).toMatchObject({
      evidence: { plateau: { qualifiesAsPlateau: true } },
    });
    expect(substitution.decision_trace).toMatchObject({
      evidence: { plateau: { qualifiesForSubstitutionReview: true } },
    });
    expect(deload.decision_trace).toMatchObject({
      evidence: { deload: { qualifiesForDeloadReview: true } },
    });
    expect([plateau, substitution, deload].every((row) => !('source_watermark' in row))).toBe(true);
  });

  it('preserves null RIR as unknown and zero RIR as observed evidence', () => {
    const unknown = mappedRow(traceFor('maintain_load', 'RIR_UNKNOWN', undefined, null));
    const zero = mappedRow(traceFor('review_deload', 'DELOAD_REVIEW_SIGNAL', 'deload', 0));

    expect(unknown.decision_trace).toMatchObject({
      evidence: { analysis: { exposures: [{ observedRirRange: null }] } },
    });
    expect(zero.decision_trace).toMatchObject({
      evidence: { analysis: { exposures: [{ observedRirRange: { minimum: 0, maximum: 0 } }] } },
    });
  });

  it('preserves source bounds, source IDs, versions, and calculation timestamp', () => {
    const trace = traceFor('maintain_load', 'LOAD_MAINTAINED');
    const row = mappedRow(trace);

    expect(row.normalized_input).toMatchObject({
      analysisContractVersion: trace.recommendation.evidence.analysis.contractVersion,
      calculatedAt: trace.recommendation.calculatedAt,
      sourceExposureIds: [exposureId],
      sourceSetIds: [setId],
    });
    expect(row.decision_trace).toMatchObject({
      evidence: {
        analysis: {
          calculatedAt: trace.recommendation.calculatedAt,
          exposures: [{ occurredAt: '2026-07-12T10:00:00.000Z' }],
        },
      },
    });
  });

  it('requires user ownership and matching source identity before writing', async () => {
    const database = mockClient(successfulResult());
    const invalid = traceFor('maintain_load', 'LOAD_MAINTAINED');
    const result = await createSupabaseProgressionDecisionTracePersistence(database.client).persist(
      {
        ...invalid,
        recommendation: { ...invalid.recommendation, subjectId: '' as ProgressionSubjectId },
      },
    );

    expect(result).toMatchObject({ ok: false, status: 'failed', code: 'VALIDATION_FAILED' });
    expect(database.insertCalls).toBe(0);
  });

  it('persists one immutable trace atomically', async () => {
    const database = mockClient(successfulResult());
    const result = await createSupabaseProgressionDecisionTracePersistence(database.client).persist(
      traceFor('increase_load', 'TARGET_REPS_ACHIEVED'),
    );

    expect(result).toEqual({ ok: true, status: 'persisted', decisionId });
    expect(database.insertCalls).toBe(1);
  });

  it('returns a typed unavailable result when the client throws', async () => {
    const database = mockClient(new Error('offline'));
    const result = await createSupabaseProgressionDecisionTracePersistence(database.client).persist(
      traceFor('maintain_load', 'LOAD_MAINTAINED'),
    );

    expect(result).toEqual({ ok: false, status: 'failed', code: 'DATABASE_UNAVAILABLE' });
  });

  it('returns a typed database write failure', async () => {
    const database = mockClient({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });
    const result = await createSupabaseProgressionDecisionTracePersistence(database.client).persist(
      traceFor('maintain_load', 'LOAD_MAINTAINED'),
    );

    expect(result).toEqual({
      ok: false,
      status: 'failed',
      code: 'DATABASE_WRITE_FAILED',
      databaseCode: '42501',
    });
  });

  it('rejects malformed and identity-mismatched returned rows', async () => {
    const malformed = mockClient({ data: { ...successfulResult().data!, id: 'bad' }, error: null });
    const mismatched = mockClient({
      data: { ...successfulResult().data!, user_id: otherUserId },
      error: null,
    });

    await expect(
      createSupabaseProgressionDecisionTracePersistence(malformed.client).persist(
        traceFor('maintain_load', 'LOAD_MAINTAINED'),
      ),
    ).resolves.toMatchObject({ code: 'MALFORMED_DATABASE_RESPONSE' });
    await expect(
      createSupabaseProgressionDecisionTracePersistence(mismatched.client).persist(
        traceFor('maintain_load', 'LOAD_MAINTAINED'),
      ),
    ).resolves.toMatchObject({ code: 'IDENTITY_MISMATCH' });
  });

  it('does not mutate recommendation evidence while mapping', () => {
    const trace = traceFor('review_deload', 'DELOAD_REVIEW_SIGNAL', 'deload');
    const before = JSON.stringify(trace);
    deepFreeze(trace);

    expect(() => mapProgressionDecisionTrace(trace)).not.toThrow();
    expect(JSON.stringify(trace)).toBe(before);
  });

  it('is server-only and keeps the pure engine free of Supabase dependencies', () => {
    expect(progressionDecisionPersistenceBoundary).toBe('server-only');
    expect(persistencePackage.browser).toBe(false);
    expect(JSON.stringify(persistencePackage)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(progressionEnginePackage.dependencies).not.toHaveProperty('@supabase/supabase-js');
    expect(JSON.stringify(progressionEnginePackage)).not.toContain('supabase');
  });
});

function traceFor(
  action: ProgressionRecommendationAction,
  reasonCode: ProgressionRecommendationReasonCode,
  extraEvidence?: 'plateau' | 'deload',
  rir: number | null = 2,
): ProgressionDecisionTrace {
  const version = {
    engineName: 'deterministic-progression-engine',
    engineVersion: 'progression-engine-v1' as EngineVersion,
    ruleSetVersion: 'progression-rules-v3' as RuleSetVersion,
  };
  const observedRirRange = rir === null ? null : { minimum: rir, maximum: rir };
  const analysis = {
    status: 'success' as const,
    contractVersion: 'progression-evidence-v1' as ContractVersion,
    subjectId: userId,
    exerciseId,
    windowExposureCount: 1,
    excludedOlderExposureIds: [],
    exposures: [
      {
        exposureId,
        occurredAt: '2026-07-12T10:00:00.000Z',
        usableSetIds: [setId],
        usableWorkingSetCount: 1,
        ignoredWorkingSetCount: 0,
        representativeLoad: { value: 32, unit: 'kg' as const },
        observedRepRange: { minimum: 9, maximum: 9 },
        totalObservedReps: 9,
        observedRirRange,
        knownRirSetCount: rir === null ? 0 : 1,
        allSetsAtOrAboveTargetMaximum: false,
        allSetsWithinTargetRange: true,
        allSetsBelowTargetMinimum: false,
        rirTargetPosition: rir === null ? ('unknown' as const) : ('at_target' as const),
        rirBelowReductionThreshold: rir === 0,
        wasDeload: false,
        wasSubstitution: false,
      },
    ],
    performanceTrend: { direction: 'stable' as const, exposureCount: 1 },
    loadTrend: 'stable' as const,
    rirTrend: rir === null ? ('unknown' as const) : ('stable' as const),
    topRangeExposureCount: 0,
    belowRangeExposureCount: 0,
    deloadExposureIds: [],
    version,
    ruleSetContractVersion: 'progression-rules-contract-v3' as ContractVersion,
    calculatedAt: '2026-07-14T12:00:00.000Z',
  };
  const recommendation: ProgressionRecommendation = {
    status: 'success',
    contractVersion: 'progression-recommendation-v1' as ContractVersion,
    subjectId: userId,
    exerciseId,
    action,
    previousLoad: { value: 32, unit: 'kg' },
    recommendedLoad: action === 'increase_load' ? { value: 34, unit: 'kg' } : null,
    targetRepRange: { minimum: 8, maximum: 12 },
    targetRirRange: { minimum: 1, maximum: 3 },
    reasonCodes: [reasonCode],
    evidence: {
      exposureIds: [exposureId],
      setIds: [setId],
      observedRepRange: { minimum: 9, maximum: 9 },
      ...(observedRirRange ? { observedRirRange } : {}),
      trend: analysis.performanceTrend,
      ...(extraEvidence === 'plateau'
        ? {
            plateau: {
              plateauExposureIds: [exposureId],
              substitutionReviewExposureIds: [exposureId],
              deloadExposureIds: [],
              stableLoad: true,
              stableSetCount: true,
              stagnantReps: true,
              recentProgression: false,
              knownHighEffortExposureCount: 1,
              unknownRirExposureCount: 0,
              qualifiesAsPlateau: true,
              qualifiesForSubstitutionReview: action === 'consider_substitution',
            },
          }
        : {}),
      ...(extraEvidence === 'deload'
        ? {
            deload: {
              reviewExposureIds: [exposureId],
              priorDeloadExposureIds: [],
              performanceTrend: analysis.performanceTrend,
              knownHighEffortExposureCount: rir === null ? 0 : 1,
              unknownRirExposureCount: rir === null ? 1 : 0,
              degradationSignal: false,
              highEffortSignal: true,
              suppressedByRecentDeload: false,
              qualifiesForDeloadReview: true,
            },
          }
        : {}),
      analysis,
    },
    version,
    calculatedAt: analysis.calculatedAt,
  };
  return { recommendation, workoutSessionId };
}

function mappedRow(trace: ProgressionDecisionTrace): ProgressionDecisionInsertRow {
  const mapped = mapProgressionDecisionTrace(trace);
  if (!mapped.ok) {
    throw new Error(`Unexpected invalid trace: ${JSON.stringify(mapped.issues)}`);
  }
  return mapped.row;
}

function successfulResult(): SupabaseProgressionDecisionInsertResult {
  return {
    data: {
      id: decisionId,
      user_id: userId,
      engine: 'deterministic-progression-engine',
      decision_type: 'progression_increase_load',
    },
    error: null,
  };
}

function mockClient(result: SupabaseProgressionDecisionInsertResult | Error): {
  readonly client: SupabaseProgressionDecisionClient;
  readonly insertCalls: number;
} {
  const state = { insertCalls: 0 };
  return {
    get insertCalls() {
      return state.insertCalls;
    },
    client: {
      from(table) {
        expect(table).toBe('workout_decisions');
        return {
          insert(row) {
            state.insertCalls += 1;
            return {
              select(columns) {
                expect(columns).toBe('id,user_id,engine,decision_type');
                return {
                  single() {
                    if (result instanceof Error) {
                      return Promise.reject(result);
                    }
                    if (result.data !== null && result.error === null) {
                      return Promise.resolve({
                        data: {
                          ...result.data,
                          engine: row.engine,
                          decision_type: row.decision_type,
                        },
                        error: null,
                      });
                    }
                    return Promise.resolve(result);
                  },
                };
              },
            };
          },
        };
      },
    },
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

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return;
  }
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
}
