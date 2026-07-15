import { describe, expect, it } from 'vitest';
import {
  canCompleteSetEntry,
  isSetEntryValid,
  toLoggedSet,
  validateSetEntry,
} from './active-workout-validation';

describe('weight validation', () => {
  it('accepts a non-negative decimal weight', () => {
    expect(isSetEntryValid({ weight: '22.5', reps: '8', rir: '2' })).toBe(true);
  });

  it('rejects a negative weight', () => {
    const result = validateSetEntry({ weight: '-5', reps: '8', rir: '2' });
    expect(result.issues.some((i) => i.code === 'WEIGHT_NEGATIVE')).toBe(true);
  });

  it('rejects non-numeric weight instead of coercing', () => {
    const result = validateSetEntry({ weight: 'abc', reps: '8', rir: '2' });
    expect(result.issues.some((i) => i.code === 'WEIGHT_INVALID')).toBe(true);
  });

  it('flags a missing weight as required', () => {
    const result = validateSetEntry({ weight: '', reps: '8', rir: '2' });
    expect(result.issues.some((i) => i.code === 'WEIGHT_REQUIRED')).toBe(true);
  });
});

describe('reps validation', () => {
  it('accepts non-negative integer reps', () => {
    expect(isSetEntryValid({ weight: '20', reps: '10', rir: '2' })).toBe(true);
  });

  it('rejects negative reps', () => {
    const result = validateSetEntry({ weight: '20', reps: '-1', rir: '2' });
    expect(result.issues.some((i) => i.code === 'REPS_NEGATIVE')).toBe(true);
  });

  it('rejects decimal reps', () => {
    const result = validateSetEntry({ weight: '20', reps: '8.5', rir: '2' });
    expect(result.issues.some((i) => i.code === 'REPS_DECIMAL')).toBe(true);
  });
});

describe('RIR validation', () => {
  it('treats empty RIR as valid unknown', () => {
    const result = validateSetEntry({ weight: '20', reps: '8', rir: '' });
    expect(result.issues).toEqual([]);
    expect(canCompleteSetEntry({ weight: '20', reps: '8', rir: '' })).toBe(true);
  });

  it('keeps RIR 0 as 0 (not coerced to unknown)', () => {
    expect(isSetEntryValid({ weight: '20', reps: '8', rir: '0' })).toBe(true);
    expect(toLoggedSet({ weight: '20', reps: '8', rir: '0' }).rir).toBe(0);
  });

  it('rejects RIR below 0', () => {
    const result = validateSetEntry({ weight: '20', reps: '8', rir: '-1' });
    expect(result.issues.some((i) => i.code === 'RIR_OUT_OF_RANGE')).toBe(true);
  });

  it('rejects RIR above 10', () => {
    const result = validateSetEntry({ weight: '20', reps: '8', rir: '11' });
    expect(result.issues.some((i) => i.code === 'RIR_OUT_OF_RANGE')).toBe(true);
  });

  it('rejects decimal RIR', () => {
    const result = validateSetEntry({ weight: '20', reps: '8', rir: '2.5' });
    expect(result.issues.some((i) => i.code === 'RIR_INVALID')).toBe(true);
  });
});

describe('completion and normalization', () => {
  it('requires valid weight and reps to complete', () => {
    expect(canCompleteSetEntry({ weight: '', reps: '8', rir: '' })).toBe(false);
    expect(canCompleteSetEntry({ weight: '20', reps: '', rir: '' })).toBe(false);
  });

  it('normalizes empty RIR to null (unknown)', () => {
    const logged = toLoggedSet({ weight: '20.5', reps: '8', rir: '' });
    expect(logged).toEqual({ weight: 20.5, reps: 8, rir: null });
  });

  it('preserves decimal weight and integer reps', () => {
    const logged = toLoggedSet({ weight: '22.5', reps: '12', rir: '3' });
    expect(logged).toEqual({ weight: 22.5, reps: 12, rir: 3 });
  });

  it('is deterministic for identical inputs', () => {
    const input = { weight: '20', reps: '8', rir: '2' };
    expect(validateSetEntry(input)).toEqual(validateSetEntry(input));
  });
});
