import type {
  ContractVersion,
  DomainId,
  EngineVersion,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import { describe, expect, it } from 'vitest';
import {
  validateProgressionInput,
  validateProgressionRuleSet,
  type CompletedProgressionSet,
  type ProgressionEngineInput,
  type ProgressionExerciseExposure,
  type ProgressionRuleSet,
} from './index.js';

const subjectId = id('10000000-0000-0000-0000-000000000001', 'user');
const exerciseId = id('20000000-0000-0000-0000-000000000001', 'exercise');
const exposureOneId = id('30000000-0000-0000-0000-000000000001', 'workout-session-exercise');
const exposureTwoId = id('30000000-0000-0000-0000-000000000002', 'workout-session-exercise');

describe('progression input validation', () => {
  it('accepts one valid recent exposure', () => {
    const result = validateProgressionInput(input([exposureOne()]), ruleSet());

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.value.usableExposureIds).toEqual([exposureOneId]);
      expect(result.value.usableCompletedWorkingSets).toHaveLength(1);
    }
  });

  it('accepts multiple exposures in chronological order', () => {
    const result = validateProgressionInput(
      input([exposureOne(), exposureTwo()]),
      ruleSet({ minimumUsableExposureCount: 2 }),
    );

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.value.usableExposureIds).toEqual([exposureOneId, exposureTwoId]);
    }
  });

  it('rejects duplicate exposure IDs', () => {
    const duplicate = { ...exposureTwo(), exposureId: exposureOneId };

    expectFailure(input([exposureOne(), duplicate]), 'DUPLICATE_EXPOSURE_ID');
  });

  it('rejects duplicate set IDs across exposures', () => {
    const duplicate = {
      ...exposureTwo(),
      sets: [{ ...exposureTwo().sets[0]!, setId: exposureOne().sets[0]!.setId }],
    };

    expectFailure(input([exposureOne(), duplicate]), 'DUPLICATE_SET_ID');
  });

  it('rejects exposures that are out of chronological order', () => {
    expectFailure(input([exposureTwo(), exposureOne()]), 'MALFORMED_EXPOSURE_CHRONOLOGY');
  });

  it('keeps warm-up sets distinguishable from usable working sets', () => {
    const warmUp = completedSet(
      '40000000-0000-0000-0000-000000000010',
      1,
      'warm_up',
      '2026-07-10T10:02:00.000Z',
    );
    const working = completedSet(
      '40000000-0000-0000-0000-000000000011',
      2,
      'working',
      '2026-07-10T10:05:00.000Z',
    );
    const result = validateProgressionInput(
      input([{ ...exposureOne(), sets: [warmUp, working] }]),
      ruleSet(),
    );

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.value.usableCompletedWorkingSets).toEqual([working]);
    }
  });

  it('does not treat skipped sets as completed working performance', () => {
    const skipped = {
      setId: id('40000000-0000-0000-0000-000000000012', 'set-log'),
      setNumber: 1,
      classification: 'working',
      status: 'skipped',
      load: null,
      loadUnit: null,
      reps: null,
      rir: null,
      performedAt: null,
    } as const;

    expectFailure(
      input([{ ...exposureOne(), sets: [skipped] }]),
      'NO_USABLE_COMPLETED_WORKING_SETS',
    );
  });

  it('preserves null RIR as unknown', () => {
    const unknownRir: CompletedProgressionSet = {
      ...(exposureOne().sets[0] as CompletedProgressionSet),
      rir: null,
    };
    const result = validateProgressionInput(
      input([{ ...exposureOne(), sets: [unknownRir] }]),
      ruleSet(),
    );

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.value.usableCompletedWorkingSets[0]?.rir).toBeNull();
    }
  });

  it('does not treat a completed set with unknown reps as usable performance', () => {
    const unknownReps: CompletedProgressionSet = {
      ...(exposureOne().sets[0] as CompletedProgressionSet),
      reps: null,
    };

    expectFailure(
      input([{ ...exposureOne(), sets: [unknownReps] }]),
      'NO_USABLE_COMPLETED_WORKING_SETS',
    );
  });

  it('accepts observed RIR zero', () => {
    const zeroRir: CompletedProgressionSet = {
      ...(exposureOne().sets[0] as CompletedProgressionSet),
      rir: 0,
    };
    const result = validateProgressionInput(
      input([{ ...exposureOne(), sets: [zeroRir] }]),
      ruleSet(),
    );

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.value.usableCompletedWorkingSets[0]?.rir).toBe(0);
    }
  });

  it('accepts zero load as observed data', () => {
    const zeroLoad: CompletedProgressionSet = {
      ...(exposureOne().sets[0] as CompletedProgressionSet),
      load: 0,
    };
    const result = validateProgressionInput(
      input([{ ...exposureOne(), sets: [zeroLoad] }]),
      ruleSet(),
    );

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.value.usableCompletedWorkingSets[0]?.load).toBe(0);
    }
  });

  it('rejects negative load', () => {
    const negativeLoad: CompletedProgressionSet = {
      ...(exposureOne().sets[0] as CompletedProgressionSet),
      load: -1,
    };

    expectFailure(input([{ ...exposureOne(), sets: [negativeLoad] }]), 'INVALID_INPUT');
  });

  it('rejects negative reps', () => {
    const negativeReps: CompletedProgressionSet = {
      ...(exposureOne().sets[0] as CompletedProgressionSet),
      reps: -1,
    };

    expectFailure(input([{ ...exposureOne(), sets: [negativeReps] }]), 'INVALID_INPUT');
  });

  it('rejects RIR outside zero through ten', () => {
    const invalidRir: CompletedProgressionSet = {
      ...(exposureOne().sets[0] as CompletedProgressionSet),
      rir: 11,
    };

    expectFailure(input([{ ...exposureOne(), sets: [invalidRir] }]), 'INVALID_INPUT');
  });

  it('rejects an invalid target rep range', () => {
    const invalid = input([exposureOne()]);

    expectFailure(
      {
        ...invalid,
        prescription: {
          ...invalid.prescription,
          targetRepRange: { minimum: 12, maximum: 8 },
        },
      },
      'INVALID_TARGET_REP_RANGE',
    );
  });

  it('rejects an invalid target RIR range', () => {
    const invalid = input([exposureOne()]);

    expectFailure(
      {
        ...invalid,
        prescription: {
          ...invalid.prescription,
          targetRirRange: { minimum: 2, maximum: 11 },
        },
      },
      'INVALID_TARGET_RIR',
    );
  });

  it('rejects mixed load units', () => {
    const pounds = {
      ...exposureTwo(),
      sets: [
        {
          ...(exposureTwo().sets[0] as CompletedProgressionSet),
          loadUnit: 'lb' as const,
        },
      ],
    };

    expectFailure(input([exposureOne(), pounds]), 'INCONSISTENT_LOAD_UNITS');
  });

  it('rejects invalid load increments', () => {
    const invalid = input([exposureOne()]);

    expectFailure(
      {
        ...invalid,
        prescription: {
          ...invalid.prescription,
          availableLoadIncrements: { unit: 'kg', increments: [2.5, 0] },
        },
      },
      'INVALID_LOAD_INCREMENTS',
    );
  });

  it('validates contract, engine, and rule-set versions', () => {
    const invalid = input([exposureOne()]);

    expectFailure(
      {
        ...invalid,
        version: { ...invalid.version, engineVersion: 'bad version' as EngineVersion },
      },
      'INVALID_VERSION_CONTRACT',
    );
    expect(
      validateProgressionRuleSet({ ...ruleSet(), minimumUsableExposureCount: 0 }),
    ).toContainEqual({
      code: 'INVALID_MINIMUM_USABLE_EXPOSURES',
      path: 'minimumUsableExposureCount',
    });
    expect(
      validateProgressionRuleSet({ ...ruleSet(), analysisWindowExposureCount: 0 }),
    ).toContainEqual({
      code: 'INVALID_ANALYSIS_WINDOW',
      path: 'analysisWindowExposureCount',
    });
    expect(
      validateProgressionRuleSet({ ...ruleSet(), plateauRequiredExposureCount: 1 }),
    ).toContainEqual({
      code: 'INVALID_PLATEAU_EXPOSURE_COUNT',
      path: 'plateauRequiredExposureCount',
    });
    expect(
      validateProgressionRuleSet({
        ...ruleSet(),
        substitutionReviewMinimumHighEffortExposureCount: 4,
      }),
    ).toContainEqual({
      code: 'INVALID_SUBSTITUTION_HIGH_EFFORT_COUNT',
      path: 'substitutionReviewMinimumHighEffortExposureCount',
    });
    expect(
      validateProgressionRuleSet({ ...ruleSet(), deloadReviewRequiredExposureCount: 1 }),
    ).toContainEqual({
      code: 'INVALID_DELOAD_REVIEW_EXPOSURE_COUNT',
      path: 'deloadReviewRequiredExposureCount',
    });
    expect(
      validateProgressionRuleSet({
        ...ruleSet(),
        deloadReviewMinimumHighEffortExposureCount: 4,
      }),
    ).toContainEqual({
      code: 'INVALID_DELOAD_HIGH_EFFORT_COUNT',
      path: 'deloadReviewMinimumHighEffortExposureCount',
    });
  });

  it('produces byte-equivalent serializable validation output for identical inputs', () => {
    const first = validateProgressionInput(
      input([exposureOne(), exposureTwo()]),
      ruleSet({ minimumUsableExposureCount: 2 }),
    );
    const second = validateProgressionInput(
      input([exposureOne(), exposureTwo()]),
      ruleSet({ minimumUsableExposureCount: 2 }),
    );

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('returns typed failures rather than throwing expected validation errors', () => {
    const validate = () => validateProgressionInput(input([]), ruleSet());

    expect(validate).not.toThrow();
    expect(validate()).toMatchObject({
      ok: false,
      failure: { status: 'failure', code: 'NO_EXPOSURE_HISTORY' },
    });
  });
});

function input(exposures: readonly ProgressionExerciseExposure[]): ProgressionEngineInput {
  return {
    contractVersion: 'progression-input-v1' as ContractVersion,
    subjectId,
    exerciseId,
    exposures,
    prescription: {
      targetRepRange: { minimum: 8, maximum: 12 },
      targetRirRange: { minimum: 1, maximum: 3 },
      currentPlannedLoad: { value: 50, unit: 'kg' },
      availableLoadIncrements: { unit: 'kg', increments: [1.25, 2.5, 5] },
    },
    version: {
      engineName: 'deterministic-progression-engine',
      engineVersion: 'progression-engine-v1' as EngineVersion,
      ruleSetVersion: 'progression-rules-v1' as RuleSetVersion,
    },
    calculatedAt: '2026-07-14T12:00:00.000Z',
  };
}

function ruleSet(overrides: Partial<ProgressionRuleSet> = {}): ProgressionRuleSet {
  return {
    contractVersion: 'progression-rules-contract-v1' as ContractVersion,
    ruleSetVersion: 'progression-rules-v1' as RuleSetVersion,
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

function exposureOne(): ProgressionExerciseExposure {
  return {
    exposureId: exposureOneId,
    exerciseId,
    status: 'completed',
    occurredAt: '2026-07-10T10:10:00.000Z',
    prescription: {
      plannedWorkingSets: 3,
      targetRepRange: { minimum: 8, maximum: 12 },
      targetRirRange: { minimum: 1, maximum: 3 },
    },
    substitution: null,
    wasDeload: false,
    sets: [
      completedSet(
        '40000000-0000-0000-0000-000000000001',
        1,
        'working',
        '2026-07-10T10:05:00.000Z',
      ),
    ],
  };
}

function exposureTwo(): ProgressionExerciseExposure {
  return {
    exposureId: exposureTwoId,
    exerciseId,
    status: 'completed',
    occurredAt: '2026-07-12T10:10:00.000Z',
    prescription: {
      plannedWorkingSets: 3,
      targetRepRange: { minimum: 8, maximum: 12 },
      targetRirRange: { minimum: 1, maximum: 3 },
    },
    substitution: null,
    wasDeload: false,
    sets: [
      completedSet(
        '40000000-0000-0000-0000-000000000002',
        1,
        'working',
        '2026-07-12T10:05:00.000Z',
      ),
    ],
  };
}

function completedSet(
  setId: string,
  setNumber: number,
  classification: CompletedProgressionSet['classification'],
  performedAt: string,
): CompletedProgressionSet {
  return {
    setId: id(setId, 'set-log'),
    setNumber,
    classification,
    status: 'completed',
    load: 50,
    loadUnit: 'kg',
    reps: 10,
    rir: 2,
    performedAt,
  };
}

function expectFailure(inputValue: ProgressionEngineInput, code: string): void {
  expect(validateProgressionInput(inputValue, ruleSet())).toMatchObject({
    ok: false,
    failure: { status: 'failure', code },
  });
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
