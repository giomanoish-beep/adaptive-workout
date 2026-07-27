import { describe, expect, it } from 'vitest';
import { prefillSetEntry } from './prefill-set-entry';

describe('active workout load prefill', () => {
  it('prefills an available external numeric suggestion', () => {
    expect(
      prefillSetEntry({
        setNumber: 1,
        targetReps: { minimum: 8, maximum: 10 },
        targetRir: 2,
        suggestedLoadKg: 22.5,
        loadKind: 'external_numeric',
        loadLabel: 'Estimated',
      }),
    ).toEqual({ weight: '22.5', reps: '', rir: '' });
  });

  it.each(['bodyweight', 'calibration_required'] as const)(
    'leaves weight empty for %s prescriptions',
    (loadKind) => {
      expect(
        prefillSetEntry({
          setNumber: 1,
          targetReps: { minimum: 8, maximum: 10 },
          targetRir: 2,
          suggestedLoadKg: null,
          loadKind,
          loadLabel: 'No numeric load',
        }).weight,
      ).toBe('');
    },
  );
});
