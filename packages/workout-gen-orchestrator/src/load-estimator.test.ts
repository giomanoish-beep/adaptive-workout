import { describe, expect, it } from 'vitest';
import { estimateInitialLoad, type LoadEstimationInput } from './load-estimator.js';

const baseInput: LoadEstimationInput = {
  familySlug: 'horizontal-press',
  equipmentCategory: 'barbell',
  isUnilateral: false,
  bodyWeightKg: 100,
  experienceLevel: 'intermediate',
};

function estimate(overrides: Partial<LoadEstimationInput> = {}) {
  return estimateInitialLoad({ ...baseInput, ...overrides });
}

describe('estimateInitialLoad', () => {
  it.each([
    ['beginner', 25],
    ['intermediate', 35],
    ['advanced', 47.5],
  ] as const)('applies the %s experience multiplier', (experienceLevel, expected) => {
    expect(estimate({ experienceLevel }).suggestedLoadKg).toBe(expected);
  });

  it('returns a barbell prescription with realistic increments', () => {
    expect(estimate()).toEqual({
      kind: 'external_numeric',
      suggestedLoadKg: 35,
      unit: 'kg',
      label: 'Estimated - confirm after first set',
      incrementKg: 2.5,
    });
  });

  it('returns a dumbbell prescription with 2 kg increments', () => {
    expect(estimate({ equipmentCategory: 'dumbbell' })).toMatchObject({
      kind: 'external_numeric',
      suggestedLoadKg: 6,
      incrementKg: 2,
    });
  });

  it.each(['machine', 'cable'] as const)(
    'returns a non-standardized %s prescription with 5 kg increments',
    (equipmentCategory) => {
      expect(
        estimate({ familySlug: 'leg-press', equipmentCategory, experienceLevel: 'beginner' }),
      ).toEqual({
        kind: 'external_numeric',
        suggestedLoadKg: 25,
        unit: 'kg',
        label: 'Estimated - machine weight not standardized',
        incrementKg: 5,
      });
    },
  );

  it('applies the Smith machine 15% reduction', () => {
    expect(estimate({ equipmentCategory: 'smith', experienceLevel: 'advanced' })).toMatchObject({
      kind: 'external_numeric',
      suggestedLoadKg: 40,
      incrementKg: 2.5,
    });
  });

  it('represents bodyweight without an ambiguous numeric zero', () => {
    expect(estimate({ equipmentCategory: 'bodyweight', bodyWeightKg: null })).toEqual({
      kind: 'bodyweight',
      suggestedLoadKg: null,
      unit: 'kg',
      label: 'Bodyweight',
      incrementKg: 0,
    });
  });

  it('halves coefficient-based load before rounding for unilateral exercises', () => {
    const bilateral = estimate({ bodyWeightKg: 120 });
    const unilateral = estimate({ bodyWeightKg: 120, isUnilateral: true });

    expect(bilateral.suggestedLoadKg).toBe(42.5);
    expect(unilateral.suggestedLoadKg).toBe(22.5);
  });

  it.each(['barbell', 'smith'] as const)(
    'requires calibration for %s exercises when body weight is absent',
    (equipmentCategory) => {
      expect(estimate({ equipmentCategory, bodyWeightKg: null })).toEqual({
        kind: 'calibration_required',
        suggestedLoadKg: null,
        unit: 'kg',
        label: 'Calibration needed - enter your body weight in settings',
        incrementKg: 2.5,
      });
    },
  );

  it('does not silently estimate from a 75 kg fallback', () => {
    const absent = estimate({ bodyWeightKg: undefined });
    const explicit75Kg = estimate({ bodyWeightKg: 75 });

    expect(absent.suggestedLoadKg).toBeNull();
    expect(absent.kind).toBe('calibration_required');
    expect(explicit75Kg).toMatchObject({ kind: 'external_numeric', suggestedLoadKg: 27.5 });
  });

  it('uses conservative defaults for unknown exercise families', () => {
    expect(estimate({ familySlug: 'unknown-family' })).toMatchObject({
      kind: 'external_numeric',
      suggestedLoadKg: 20,
      incrementKg: 2.5,
    });
  });

  it('requires calibration for unknown equipment', () => {
    expect(estimate({ equipmentCategory: 'mystery-device' })).toEqual({
      kind: 'calibration_required',
      suggestedLoadKg: null,
      unit: 'kg',
      label: 'Calibration needed',
      incrementKg: 0,
    });
  });

  it('enforces minimum bounds at the low end and remains finite at the high end', () => {
    expect(estimate({ bodyWeightKg: 1 }).suggestedLoadKg).toBe(20);
    expect(
      estimate({ equipmentCategory: 'dumbbell', familySlug: 'rear-delt-fly' }).suggestedLoadKg,
    ).toBe(2);
    expect(
      estimate({ equipmentCategory: 'machine', familySlug: 'back-extension' }).suggestedLoadKg,
    ).toBe(5);

    const high = estimate({ bodyWeightKg: 500, experienceLevel: 'advanced' }).suggestedLoadKg;
    expect(high).toBe(240);
    expect(Number.isFinite(high)).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1])(
    'rejects invalid body weight %s without producing NaN or a negative load',
    (bodyWeightKg) => {
      const result = estimate({ bodyWeightKg });
      expect(result.kind).toBe('calibration_required');
      expect(result.suggestedLoadKg).toBeNull();
    },
  );
});
