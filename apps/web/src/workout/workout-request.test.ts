import { describe, expect, it } from 'vitest';
import {
  initialWorkoutRequestDraft,
  isWorkoutRequestValid,
  setWorkoutRequestCustomDuration,
  setWorkoutRequestCustomDurationInput,
  setWorkoutRequestDuration,
  setWorkoutRequestEquipment,
  setWorkoutRequestPresetDuration,
  toggleWorkoutRequestMuscle,
  validateWorkoutRequest,
  workoutRequestDurationOptions,
  workoutRequestEquipmentOptions,
  workoutRequestMuscleOptions,
} from './workout-request';

function validDraft() {
  return {
    ...initialWorkoutRequestDraft,
    muscleIds: ['chest'],
    durationMinutes: 45 as (typeof workoutRequestDurationOptions)[number],
    equipmentId: 'full-gym',
  };
}

function expectValidDuration(
  mode: 'preset' | 'custom',
  durationMinutes: number,
  muscleIds: readonly string[] = ['chest'],
  equipmentId = 'full-gym',
) {
  const draft = {
    ...initialWorkoutRequestDraft,
    muscleIds,
    durationMode: mode,
    durationMinutes,
    equipmentId,
  };
  expect(isWorkoutRequestValid(draft)).toBe(true);
  expect(
    validateWorkoutRequest(draft).issues.some((i) => i.code === 'INVALID_DURATION'),
  ).toBe(false);
}

describe('workout request options', () => {
  it('exposes the documented muscle options', () => {
    expect(workoutRequestMuscleOptions.map((o) => o.id)).toEqual([
      'chest',
      'back',
      'shoulders',
      'biceps',
      'triceps',
      'quads',
      'hamstrings',
      'glutes',
      'calves',
      'core',
    ]);
  });

  it('exposes the documented duration options, including 90 and 120', () => {
    expect(workoutRequestDurationOptions).toEqual([30, 45, 60, 75, 90, 120]);
  });

  it('exposes the documented equipment options', () => {
    expect(workoutRequestEquipmentOptions.map((o) => o.id)).toEqual([
      'full-gym',
      'dumbbells-only',
      'cables-only',
    ]);
  });
});

describe('validateWorkoutRequest', () => {
  it('is invalid when no target muscle is selected', () => {
    const result = validateWorkoutRequest({
      ...initialWorkoutRequestDraft,
      durationMinutes: 45,
      equipmentId: 'full-gym',
    });
    expect(result.issues.some((i) => i.code === 'NO_TARGET_MUSCLES')).toBe(true);
    expect(isWorkoutRequestValid(initialWorkoutRequestDraft)).toBe(false);
  });

  it('is valid with at least one muscle, a duration, and equipment', () => {
    const draft = validDraft();
    expect(isWorkoutRequestValid(draft)).toBe(true);
    expect(validateWorkoutRequest(draft).issues).toEqual([]);
  });

  it('is invalid without a duration', () => {
    const result = validateWorkoutRequest({
      ...initialWorkoutRequestDraft,
      muscleIds: ['chest'],
      equipmentId: 'full-gym',
    });
    expect(result.issues.some((i) => i.code === 'INVALID_DURATION')).toBe(true);
  });

  it('rejects a duration outside the offered options', () => {
    const result = validateWorkoutRequest({
      ...initialWorkoutRequestDraft,
      muscleIds: ['chest'],
      durationMinutes: 20,
      equipmentId: 'full-gym',
    });
    expect(result.issues.some((i) => i.code === 'INVALID_DURATION')).toBe(true);
  });

  it('is invalid without an equipment context', () => {
    const result = validateWorkoutRequest({
      ...initialWorkoutRequestDraft,
      muscleIds: ['chest'],
      durationMinutes: 45,
    });
    expect(result.issues.some((i) => i.code === 'NO_EQUIPMENT_CONTEXT')).toBe(true);
  });

  it('is deterministic for identical inputs', () => {
    const draft = validDraft();
    expect(validateWorkoutRequest(draft)).toEqual(validateWorkoutRequest(draft));
  });
});

describe('duration presets', () => {
  it('accepts the 90 minute preset', () => {
    expectValidDuration('preset', 90);
  });

  it('accepts the 120 minute preset', () => {
    expectValidDuration('preset', 120);
  });

  it('keeps existing preset durations valid', () => {
    for (const duration of workoutRequestDurationOptions) {
      expectValidDuration('preset', duration);
    }
  });
});

describe('custom duration', () => {
  const customDraft = (input: string) => ({
    ...initialWorkoutRequestDraft,
    muscleIds: ['chest'],
    durationMode: 'custom' as const,
    customDurationInput: input,
    durationMinutes: null as number | null,
    equipmentId: 'full-gym',
  });

  it('accepts a custom 105 minute value', () => {
    expectValidDuration('custom', 105);
  });

  it('accepts the 15 minute custom minimum', () => {
    expectValidDuration('custom', 15);
  });

  it('accepts the 240 minute custom maximum', () => {
    expectValidDuration('custom', 240);
  });

  it('is invalid when the custom input is empty', () => {
    const result = validateWorkoutRequest(customDraft(''));
    expect(result.issues.some((i) => i.code === 'INVALID_DURATION')).toBe(true);
  });

  it('rejects a decimal custom value', () => {
    const result = validateWorkoutRequest(customDraft('12.5'));
    expect(result.issues.some((i) => i.code === 'INVALID_DURATION')).toBe(true);
  });

  it('rejects a custom value below 15', () => {
    const result = validateWorkoutRequest(customDraft('14'));
    expect(result.issues.some((i) => i.code === 'INVALID_DURATION')).toBe(true);
  });

  it('rejects a custom value above 240', () => {
    const result = validateWorkoutRequest(customDraft('241'));
    expect(result.issues.some((i) => i.code === 'INVALID_DURATION')).toBe(true);
  });
});

describe('duration mode switching', () => {
  it('uses the preset after switching custom to preset', () => {
    let draft = setWorkoutRequestCustomDurationInput(
      { ...initialWorkoutRequestDraft, muscleIds: ['chest'], equipmentId: 'full-gym' },
      '105',
    );
    draft = setWorkoutRequestCustomDuration(draft);
    expect(draft.durationMode).toBe('custom');
    expect(draft.durationMinutes).toBe(105);

    draft = setWorkoutRequestPresetDuration(draft, 60);
    expect(draft.durationMode).toBe('preset');
    expect(draft.durationMinutes).toBe(60);
    // custom input preserved for a switch back
    expect(draft.customDurationInput).toBe('105');
  });

  it('restores the previous custom value after switching back from a preset', () => {
    let draft = setWorkoutRequestCustomDurationInput(
      { ...initialWorkoutRequestDraft, muscleIds: ['chest'], equipmentId: 'full-gym' },
      '90',
    );
    draft = setWorkoutRequestCustomDuration(draft);
    expect(draft.durationMinutes).toBe(90);

    draft = setWorkoutRequestPresetDuration(draft, 45);
    expect(draft.durationMode).toBe('preset');
    expect(draft.durationMinutes).toBe(45);

    draft = setWorkoutRequestCustomDuration(draft);
    expect(draft.durationMode).toBe('custom');
    expect(draft.customDurationInput).toBe('90');
    expect(draft.durationMinutes).toBe(90);
  });
});

describe('draft transitions', () => {
  it('toggles a muscle on and off without duplicates', () => {
    let draft = initialWorkoutRequestDraft;
    draft = toggleWorkoutRequestMuscle(draft, 'chest');
    expect(draft.muscleIds).toEqual(['chest']);
    // re-adding is a no-op path: toggling again removes it
    draft = toggleWorkoutRequestMuscle(draft, 'chest');
    expect(draft.muscleIds).toEqual([]);
  });

  it('supports multi-muscle selection', () => {
    let draft = initialWorkoutRequestDraft;
    draft = toggleWorkoutRequestMuscle(draft, 'chest');
    draft = toggleWorkoutRequestMuscle(draft, 'back');
    draft = toggleWorkoutRequestMuscle(draft, 'shoulders');
    expect(draft.muscleIds).toEqual(['chest', 'back', 'shoulders']);
  });

  it('sets duration and equipment immutably', () => {
    let draft = initialWorkoutRequestDraft;
    draft = setWorkoutRequestDuration(draft, 60);
    draft = setWorkoutRequestEquipment(draft, 'dumbbells-only');
    expect(draft.durationMode).toBe('preset');
    expect(draft.durationMinutes).toBe(60);
    expect(draft.equipmentId).toBe('dumbbells-only');
    expect(initialWorkoutRequestDraft.durationMinutes).toBeNull();
  });
});
