import type {
  ContractVersion,
  DomainId,
  EngineVersion,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import { describe, expect, it } from 'vitest';
import {
  analyzeProgressionEvidence,
  recommendProgression,
  type CompletedProgressionSet,
  type ProgressionEngineInput,
  type ProgressionExerciseExposure,
  type ProgressionPerformedSet,
  type ProgressionRuleSet,
  type UnusableProgressionSet,
} from './index.js';

const subjectId = id('10000000-0000-0000-0000-000000000001', 'user');
const exerciseId = id('20000000-0000-0000-0000-000000000001', 'exercise');

describe('progression evidence analysis and core recommendations', () => {
  it('identifies three improving exposures', () => {
    const analysis = analyze([
      exposure(1, 32, 8, 2),
      exposure(2, 32, 9, 2),
      exposure(3, 32, 10, 2),
    ]);

    expect(analysis.performanceTrend).toEqual({ direction: 'improving', exposureCount: 3 });
  });

  it('identifies three stable exposures', () => {
    const analysis = analyze([exposure(1, 32, 9, 2), exposure(2, 32, 9, 2), exposure(3, 32, 9, 2)]);

    expect(analysis.performanceTrend).toEqual({ direction: 'stable', exposureCount: 3 });
    expect(
      recommend(inputFor([exposure(1, 32, 9, 2), exposure(2, 32, 9, 2), exposure(3, 32, 9, 2)]))
        .action,
    ).toBe('maintain_load');
  });

  it('identifies three declining exposures', () => {
    const analysis = analyze([
      exposure(1, 32, 10, 2),
      exposure(2, 32, 9, 2),
      exposure(3, 32, 8, 2),
    ]);

    expect(analysis.performanceTrend).toEqual({ direction: 'declining', exposureCount: 3 });
  });

  it('recognizes increasing reps at constant load', () => {
    const analysis = analyze([
      exposure(1, 32, 8, 2),
      exposure(2, 32, 9, 2),
      exposure(3, 32, 10, 2),
    ]);

    expect(analysis.loadTrend).toBe('stable');
    expect(analysis.performanceTrend.direction).toBe('improving');
  });

  it('recognizes increasing load with maintained reps', () => {
    const analysis = analyze([exposure(1, 30, 8, 2), exposure(2, 32, 8, 2), exposure(3, 34, 8, 2)]);

    expect(analysis.loadTrend).toBe('increasing');
    expect(analysis.performanceTrend.direction).toBe('improving');
  });

  it('increases load after repeated top-of-range performance', () => {
    const result = recommend(inputFor([exposure(1, 32, 12, 2), exposure(2, 32, 12, 2)]));

    expect(result).toMatchObject({
      action: 'increase_load',
      previousLoad: { value: 32, unit: 'kg' },
      recommendedLoad: { value: 34, unit: 'kg' },
      reasonCodes: ['TARGET_REPS_ACHIEVED', 'TARGET_RIR_ACHIEVED', 'LOAD_INCREMENT_APPLIED'],
    });
  });

  it('reduces load after repeated below-range performance', () => {
    const result = recommend(inputFor([exposure(1, 32, 6, 2), exposure(2, 32, 7, 2)]));

    expect(result).toMatchObject({
      action: 'reduce_load',
      recommendedLoad: { value: 30, unit: 'kg' },
      reasonCodes: ['BELOW_TARGET_REPS', 'LOAD_REDUCTION_APPLIED'],
    });
  });

  it('reduces load after repeated materially below-target RIR', () => {
    const result = recommend(inputFor([exposure(1, 32, 9, 0), exposure(2, 32, 9, 0)]));

    expect(result).toMatchObject({
      action: 'reduce_load',
      recommendedLoad: { value: 30, unit: 'kg' },
      reasonCodes: ['RIR_BELOW_TARGET', 'LOAD_REDUCTION_APPLIED'],
    });
  });

  it('classifies known RIR above target', () => {
    expect(analyze([exposure(1, 32, 9, 4)]).exposures[0]?.rirTargetPosition).toBe('above_target');
  });

  it('classifies known RIR at target', () => {
    expect(analyze([exposure(1, 32, 9, 2)]).exposures[0]?.rirTargetPosition).toBe('at_target');
  });

  it('classifies known RIR below target', () => {
    const summary = analyze([exposure(1, 32, 9, 0)]).exposures[0];

    expect(summary?.rirTargetPosition).toBe('below_target');
    expect(summary?.rirBelowReductionThreshold).toBe(true);
  });

  it('keeps unknown RIR unknown instead of converting it to zero', () => {
    const summary = analyze([exposure(1, 32, 9, null)]).exposures[0];

    expect(summary).toMatchObject({
      observedRirRange: null,
      knownRirSetCount: 0,
      rirTargetPosition: 'unknown',
      rirBelowReductionThreshold: false,
    });
  });

  it('preserves mixed known and unknown RIR evidence', () => {
    const mixed = exposureWithSets(1, [
      completedSet(1, 1, 32, 9, 2),
      completedSet(1, 2, 32, 9, null),
    ]);
    const summary = analyze([mixed]).exposures[0];

    expect(summary).toMatchObject({
      usableWorkingSetCount: 2,
      knownRirSetCount: 1,
      observedRirRange: { minimum: 2, maximum: 2 },
    });
  });

  it('excludes warm-up sets from performance evidence', () => {
    const withWarmUp = exposureWithSets(1, [
      { ...completedSet(1, 1, 20, 20, 5), classification: 'warm_up' },
      completedSet(1, 2, 32, 9, 2),
    ]);
    const summary = analyze([withWarmUp]).exposures[0];

    expect(summary).toMatchObject({ usableWorkingSetCount: 1, totalObservedReps: 9 });
  });

  it('excludes skipped sets from performance evidence', () => {
    const withSkipped = exposureWithSets(1, [skippedSet(1, 1), completedSet(1, 2, 32, 9, 2)]);
    const summary = analyze([withSkipped]).exposures[0];

    expect(summary).toMatchObject({ usableWorkingSetCount: 1, ignoredWorkingSetCount: 1 });
  });

  it('excludes incomplete sets from performance evidence', () => {
    const withIncomplete = exposureWithSets(1, [
      { ...skippedSet(1, 1), status: 'incomplete' },
      completedSet(1, 2, 32, 9, 2),
    ]);
    const summary = analyze([withIncomplete]).exposures[0];

    expect(summary).toMatchObject({ usableWorkingSetCount: 1, ignoredWorkingSetCount: 1 });
  });

  it('keeps deload-marked exposures identifiable and out of current trend', () => {
    const deload = { ...exposure(2, 20, 5, 2), wasDeload: true };
    const analysis = analyze([exposure(1, 32, 8, 2), deload, exposure(3, 32, 9, 2)]);

    expect(analysis.deloadExposureIds).toEqual([deload.exposureId]);
    expect(analysis.performanceTrend).toEqual({ direction: 'improving', exposureCount: 2 });
  });

  it('excludes oldest exposures outside the configured analysis window', () => {
    const old = exposure(1, 32, 20, 2);
    const analysis = analyze(
      [old, exposure(2, 32, 8, 2), exposure(3, 32, 9, 2), exposure(4, 32, 10, 2)],
      rules({ analysisWindowExposureCount: 3 }),
    );

    expect(analysis.excludedOlderExposureIds).toEqual([old.exposureId]);
    expect(analysis.performanceTrend.direction).toBe('improving');
    expect(analysis.exposures[0]?.observedRepRange).toEqual({ minimum: 8, maximum: 8 });
  });

  it('returns deterministic byte-equivalent analysis', () => {
    const input = inputFor([exposure(1, 32, 8, 2), exposure(2, 32, 9, 2), exposure(3, 32, 10, 2)]);

    expect(JSON.stringify(analyzeProgressionEvidence(input, rules()))).toBe(
      JSON.stringify(analyzeProgressionEvidence(input, rules())),
    );
  });

  it('does not mutate exposure or set inputs', () => {
    const input = inputFor([exposure(1, 32, 8, 2), exposure(2, 32, 9, 2)]);
    const before = JSON.stringify(input);
    deepFreeze(input);

    expect(() => analyzeProgressionEvidence(input, rules())).not.toThrow();
    expect(JSON.stringify(input)).toBe(before);
  });

  it('propagates existing typed validation failures', () => {
    const first = exposure(1, 32, 8, 2);
    const duplicate = { ...exposure(2, 32, 9, 2), exposureId: first.exposureId };

    expect(analyzeProgressionEvidence(inputFor([first, duplicate]), rules())).toMatchObject({
      status: 'failure',
      code: 'DUPLICATE_EXPOSURE_ID',
    });
  });

  it('shows worsening effort when reps stay equal and RIR falls from three to zero', () => {
    const analysis = analyze([exposure(1, 32, 9, 3), exposure(2, 32, 9, 1), exposure(3, 32, 9, 0)]);

    expect(analysis.performanceTrend.direction).toBe('stable');
    expect(analysis.rirTrend).toBe('decreasing');
  });
});

describe('plateau and substitution review signals', () => {
  it('does not infer a plateau from one stable exposure', () => {
    const result = recommend(inputFor([exposure(1, 32, 9, 2)]));

    expect(result.action).toBe('maintain_load');
    expect(result.evidence.plateau).toMatchObject({
      qualifiesAsPlateau: false,
      qualifiesForSubstitutionReview: false,
    });
  });

  it('adds a plateau signal after repeated unchanged performance', () => {
    const result = recommend(
      inputFor([exposure(1, 32, 9, 2), exposure(2, 32, 9, 2), exposure(3, 32, 9, 2)]),
    );

    expect(result).toMatchObject({
      action: 'maintain_load',
      reasonCodes: ['PLATEAU_SIGNAL', 'WITHIN_TARGET_REP_RANGE', 'LOAD_MAINTAINED'],
      evidence: {
        plateau: {
          stableLoad: true,
          stableSetCount: true,
          stagnantReps: true,
          recentProgression: false,
          qualifiesAsPlateau: true,
          qualifiesForSubstitutionReview: false,
        },
      },
    });
  });

  it('prevents a false plateau when recent load progression is present', () => {
    const result = recommend(
      inputFor([exposure(1, 30, 9, 2), exposure(2, 32, 9, 2), exposure(3, 32, 9, 2)]),
    );

    expect(result.evidence.plateau).toMatchObject({
      recentProgression: true,
      qualifiesAsPlateau: false,
    });
    expect(result.reasonCodes).not.toContain('PLATEAU_SIGNAL');
  });

  it('escalates a persistent high-effort plateau to substitution review', () => {
    const exposures = [1, 2, 3, 4, 5].map((index) => exposure(index, 32, 9, 1));
    const result = recommend(
      inputFor(exposures),
      rules({
        analysisWindowExposureCount: 5,
        substitutionReviewRequiredExposureCount: 5,
        substitutionReviewMinimumHighEffortExposureCount: 3,
      }),
    );

    expect(result).toMatchObject({
      action: 'consider_substitution',
      recommendedLoad: null,
      reasonCodes: [
        'PLATEAU_SIGNAL',
        'SUBSTITUTION_REVIEW_SIGNAL',
        'WITHIN_TARGET_REP_RANGE',
        'LOAD_MAINTAINED',
      ],
      evidence: {
        plateau: {
          knownHighEffortExposureCount: 5,
          qualifiesAsPlateau: true,
          qualifiesForSubstitutionReview: true,
        },
      },
    });
    expect(result.evidence.exposureIds).toEqual(exposures.map(({ exposureId }) => exposureId));
  });

  it('does not treat unknown RIR as high-effort substitution evidence', () => {
    const result = recommend(
      inputFor([1, 2, 3, 4, 5].map((index) => exposure(index, 32, 9, null))),
      rules({
        analysisWindowExposureCount: 5,
        substitutionReviewRequiredExposureCount: 5,
        substitutionReviewMinimumHighEffortExposureCount: 1,
      }),
    );

    expect(result.action).toBe('maintain_load');
    expect(result.evidence.plateau).toMatchObject({
      knownHighEffortExposureCount: 0,
      unknownRirExposureCount: 5,
      qualifiesAsPlateau: true,
      qualifiesForSubstitutionReview: false,
    });
  });

  it('keeps deload context visible and blocks a plateau signal', () => {
    const deload = { ...exposure(2, 24, 6, 3), wasDeload: true };
    const result = recommend(inputFor([exposure(1, 32, 9, 2), deload, exposure(3, 32, 9, 2)]));

    expect(result.evidence.plateau).toMatchObject({
      deloadExposureIds: [deload.exposureId],
      qualifiesAsPlateau: false,
    });
    expect(result.action).toBe('maintain_load');
  });

  it('preserves increase and reduction precedence', () => {
    expect(recommend(inputFor([exposure(1, 32, 12, 2), exposure(2, 32, 12, 2)])).action).toBe(
      'increase_load',
    );
    expect(recommend(inputFor([exposure(1, 32, 6, 1), exposure(2, 32, 6, 1)])).action).toBe(
      'reduce_load',
    );
  });

  it('returns deterministic output without mutating inputs', () => {
    const input = inputFor([1, 2, 3].map((index) => exposure(index, 32, 9, 2)));
    const before = JSON.stringify(input);
    deepFreeze(input);

    const first = recommendProgression(input, rules());
    const second = recommendProgression(input, rules());

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('configurable deload review signals', () => {
  it('requests deload review after sustained performance decline', () => {
    const result = recommend(
      inputFor([exposure(1, 32, 10, 2), exposure(2, 32, 9, 2), exposure(3, 32, 8, 2)]),
    );

    expect(result).toMatchObject({
      action: 'review_deload',
      recommendedLoad: null,
      reasonCodes: ['PERFORMANCE_DECLINING', 'DELOAD_REVIEW_SIGNAL'],
      evidence: {
        deload: {
          performanceTrend: { direction: 'declining', exposureCount: 3 },
          degradationSignal: true,
          highEffortSignal: false,
          qualifiesForDeloadReview: true,
        },
      },
    });
  });

  it('requests broader review after repeated materially low RIR', () => {
    const result = recommend(
      inputFor([exposure(1, 32, 9, 0), exposure(2, 32, 9, 0), exposure(3, 32, 9, 0)]),
    );

    expect(result).toMatchObject({
      action: 'review_deload',
      reasonCodes: ['REPEATED_HIGH_EFFORT', 'DELOAD_REVIEW_SIGNAL'],
      evidence: {
        observedRirRange: { minimum: 0, maximum: 0 },
        deload: {
          knownHighEffortExposureCount: 3,
          unknownRirExposureCount: 0,
          highEffortSignal: true,
        },
      },
    });
  });

  it('does not treat unknown RIR as high-effort evidence', () => {
    const result = recommend(
      inputFor([exposure(1, 32, 9, null), exposure(2, 32, 9, null), exposure(3, 32, 9, null)]),
    );

    expect(result.action).toBe('maintain_load');
    expect(result.evidence.deload).toMatchObject({
      knownHighEffortExposureCount: 0,
      unknownRirExposureCount: 3,
      highEffortSignal: false,
      qualifiesForDeloadReview: false,
    });
  });

  it('requires a complete configured review window', () => {
    const ruleSet = rules({
      analysisWindowExposureCount: 4,
      deloadReviewRequiredExposureCount: 4,
      deloadReviewMinimumHighEffortExposureCount: 4,
    });
    const three = recommend(
      inputFor([exposure(1, 32, 10, 2), exposure(2, 32, 9, 2), exposure(3, 32, 8, 2)]),
      ruleSet,
    );
    const four = recommend(
      inputFor([
        exposure(1, 32, 11, 2),
        exposure(2, 32, 10, 2),
        exposure(3, 32, 9, 2),
        exposure(4, 32, 8, 2),
      ]),
      ruleSet,
    );

    expect(three.action).toBe('maintain_load');
    expect(four.action).toBe('review_deload');
  });

  it('suppresses another review when the recent window includes a deload', () => {
    const priorDeload = { ...exposure(2, 24, 8, 0), wasDeload: true };
    const result = recommend(inputFor([exposure(1, 32, 9, 0), priorDeload, exposure(3, 32, 9, 0)]));

    expect(result.action).not.toBe('review_deload');
    expect(result.evidence.deload).toMatchObject({
      priorDeloadExposureIds: [priorDeload.exposureId],
      suppressedByRecentDeload: true,
      qualifiesForDeloadReview: false,
    });
  });

  it('does not trigger from improving performance', () => {
    const result = recommend(
      inputFor([exposure(1, 32, 8, 2), exposure(2, 32, 9, 2), exposure(3, 32, 10, 2)]),
    );

    expect(result.action).toBe('maintain_load');
    expect(result.evidence.deload).toMatchObject({
      degradationSignal: false,
      highEffortSignal: false,
    });
  });

  it('returns deterministic deload evidence without mutating raw history', () => {
    const input = inputFor([exposure(1, 32, 10, 2), exposure(2, 32, 9, 2), exposure(3, 32, 8, 2)]);
    const before = JSON.stringify(input);
    deepFreeze(input);

    const first = recommendProgression(input, rules());
    const second = recommendProgression(input, rules());

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(input)).toBe(before);
  });
});

function analyze(exposures: readonly ProgressionExerciseExposure[], ruleSet = rules()) {
  const result = analyzeProgressionEvidence(inputFor(exposures), ruleSet);
  if (result.status === 'failure') {
    throw new Error(`Unexpected analysis failure: ${JSON.stringify(result)}`);
  }
  return result;
}

function recommend(input: ProgressionEngineInput, ruleSet = rules()) {
  const result = recommendProgression(input, ruleSet);
  if (result.status === 'failure') {
    throw new Error(`Unexpected recommendation failure: ${JSON.stringify(result)}`);
  }
  return result;
}

function inputFor(exposures: readonly ProgressionExerciseExposure[]): ProgressionEngineInput {
  return {
    contractVersion: 'progression-input-v1' as ContractVersion,
    subjectId,
    exerciseId,
    exposures,
    prescription: {
      targetRepRange: { minimum: 8, maximum: 12 },
      targetRirRange: { minimum: 1, maximum: 3 },
      currentPlannedLoad: { value: 32, unit: 'kg' },
      availableLoadIncrements: { unit: 'kg', increments: [2, 4] },
    },
    version: {
      engineName: 'deterministic-progression-engine',
      engineVersion: 'progression-engine-v1' as EngineVersion,
      ruleSetVersion: 'progression-rules-v2' as RuleSetVersion,
    },
    calculatedAt: '2026-07-14T12:00:00.000Z',
  };
}

function rules(overrides: Partial<ProgressionRuleSet> = {}): ProgressionRuleSet {
  return {
    contractVersion: 'progression-rules-contract-v2' as ContractVersion,
    ruleSetVersion: 'progression-rules-v2' as RuleSetVersion,
    minimumUsableExposureCount: 1,
    maximumExposureHistory: 10,
    analysisWindowExposureCount: 3,
    increaseRequiredExposureCount: 2,
    reductionRequiredExposureCount: 2,
    minimumKnownRirSetsPerExposureForIncrease: 1,
    rirReductionMargin: 1,
    maximumLoadReductionFraction: 0.15,
    plateauRequiredExposureCount: 3,
    plateauMaximumRepChange: 0,
    substitutionReviewRequiredExposureCount: 3,
    substitutionReviewMinimumHighEffortExposureCount: 1,
    deloadReviewRequiredExposureCount: 3,
    deloadReviewMinimumHighEffortExposureCount: 3,
    ...overrides,
  };
}

function exposure(
  index: number,
  load: number,
  reps: number,
  rir: number | null,
): ProgressionExerciseExposure {
  return exposureWithSets(index, [completedSet(index, 1, load, reps, rir)]);
}

function exposureWithSets(
  index: number,
  sets: readonly ProgressionPerformedSet[],
): ProgressionExerciseExposure {
  return {
    exposureId: id(uuid('3', index), 'workout-session-exercise'),
    exerciseId,
    status: 'completed',
    occurredAt: `2026-07-${String(index + 1).padStart(2, '0')}T10:10:00.000Z`,
    prescription: {
      plannedWorkingSets: Math.max(
        1,
        sets.filter(({ classification }) => classification === 'working').length,
      ),
      targetRepRange: { minimum: 8, maximum: 12 },
      targetRirRange: { minimum: 1, maximum: 3 },
    },
    substitution: null,
    wasDeload: false,
    sets,
  };
}

function completedSet(
  exposureIndex: number,
  setNumber: number,
  load: number,
  reps: number,
  rir: number | null,
): CompletedProgressionSet {
  return {
    setId: id(uuid('4', exposureIndex * 10 + setNumber), 'set-log'),
    setNumber,
    classification: 'working',
    status: 'completed',
    load,
    loadUnit: 'kg',
    reps,
    rir,
    performedAt: `2026-07-${String(exposureIndex + 1).padStart(2, '0')}T10:0${setNumber}:00.000Z`,
  };
}

function skippedSet(exposureIndex: number, setNumber: number): UnusableProgressionSet {
  return {
    setId: id(uuid('4', exposureIndex * 10 + setNumber), 'set-log'),
    setNumber,
    classification: 'working',
    status: 'skipped',
    load: null,
    loadUnit: null,
    reps: null,
    rir: null,
    performedAt: null,
  };
}

function uuid(prefix: string, sequence: number): string {
  return `${prefix}0000000-0000-0000-0000-${String(sequence).padStart(12, '0')}`;
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
