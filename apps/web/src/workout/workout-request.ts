/**
 * Pure, React-free workout request model for the Workout tab request form
 * (WEB_APP-003). This is UI and flow state only — actual server-side workout
 * generation is wired in a later integration task. The browser never invokes
 * the workout engine, Supabase, or AI (docs/ARCHITECTURE.md).
 *
 * Muscle, duration, and equipment options are the fixed UI selectors defined by
 * the task. They are presentational labels and stable IDs, not engine catalog
 * IDs; the server maps them to authoritative data when generation is wired.
 */

/** Muscle options shown as selectable chips on the request screen. */
export interface WorkoutRequestMuscleOption {
  readonly id: string;
  readonly label: string;
}

export const workoutRequestMuscleOptions: readonly WorkoutRequestMuscleOption[] = [
  { id: 'chest', label: 'Chest' },
  { id: 'back', label: 'Back' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'quads', label: 'Quads' },
  { id: 'hamstrings', label: 'Hamstrings' },
  { id: 'glutes', label: 'Glutes' },
  { id: 'calves', label: 'Calves' },
  { id: 'core', label: 'Core' },
];

/** Preset duration options, in minutes. */
export const workoutRequestDurationOptions = [30, 45, 60, 75, 90, 120] as const;
export type WorkoutRequestDurationOption = (typeof workoutRequestDurationOptions)[number];

/**
 * Whether the duration was chosen from a preset or entered as a custom value.
 * This is UI/flow state only; {@link WorkoutRequestDraft.durationMinutes}
 * always holds the resolved, authoritative duration used by the request.
 */
export type WorkoutRequestDurationMode = 'preset' | 'custom';

/** Inclusive bounds for a custom duration, in minutes. */
export const CUSTOM_DURATION_MIN = 15;
export const CUSTOM_DURATION_MAX = 240;

/** Equipment context options that frame available gear without listing items. */
export interface WorkoutRequestEquipmentOption {
  readonly id: string;
  readonly label: string;
}

export const workoutRequestEquipmentOptions: readonly WorkoutRequestEquipmentOption[] = [
  { id: 'full-gym', label: 'Full gym' },
  { id: 'dumbbells-only', label: 'Dumbbells only' },
  { id: 'cables-only', label: 'Cables only' },
];

export type WorkoutRequestMuscleId = string;
export type WorkoutRequestEquipmentId = string;

/**
 * The user-facing request draft. Muscles are a multi-select list of muscle
 * option IDs; equipment is a single equipment-context option ID (or null until
 * selected).
 *
 * Duration is modelled with a mode plus a resolved value:
 * - {@link durationMode} records whether the value came from a preset or a
 *   custom entry. It is UI/flow state, not request data.
 * - {@link customDurationInput} preserves the user's raw text so the value is
 *   retained in React state when switching away from Custom and restored on
 *   return. It is intentionally string-typed: an empty box and a half-typed
 *   number are both invalid, and coercing either would hide real state.
 * - {@link durationMinutes} is the single authoritative duration used by the
 *   request. For a preset it is the selected preset; for Custom it is the
 *   parsed integer minutes when the input is a valid integer within bounds,
 *   otherwise null. Switching from Custom to a preset keeps the custom input
 *   in state but makes the preset authoritative for the request.
 */
export interface WorkoutRequestDraft {
  readonly muscleIds: readonly WorkoutRequestMuscleId[];
  readonly durationMode: WorkoutRequestDurationMode;
  readonly customDurationInput: string;
  readonly durationMinutes: number | null;
  readonly equipmentId: WorkoutRequestEquipmentId | null;
}

export const initialWorkoutRequestDraft: WorkoutRequestDraft = {
  muscleIds: [],
  durationMode: 'preset',
  customDurationInput: '',
  durationMinutes: null,
  equipmentId: null,
};

export const workoutRequestValidationCodes = [
  'NO_TARGET_MUSCLES',
  'INVALID_DURATION',
  'NO_EQUIPMENT_CONTEXT',
] as const;

export type WorkoutRequestValidationCode = (typeof workoutRequestValidationCodes)[number];

export interface WorkoutRequestValidationIssue {
  readonly code: WorkoutRequestValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface WorkoutRequestValidationResult {
  readonly issues: readonly WorkoutRequestValidationIssue[];
}

/**
 * Validates a request draft. Pure and deterministic: the same draft always
 * yields the same issues in the same order. Mirrors the task's inline
 * validation rules — at least one target muscle, a duration, and an equipment
 * context. Returns concise messages suitable for inline display (no alerts).
 *
 * Duration is mode-aware: a preset value must be one of the offered presets,
 * while a custom value must be an integer within
 * [{@link CUSTOM_DURATION_MIN}, {@link CUSTOM_DURATION_MAX}]. Invalid custom
 * input resolves to a null {@link WorkoutRequestDraft.durationMinutes}, so an
 * empty, decimal, or out-of-range entry is rejected without silent coercion.
 */
export function validateWorkoutRequest(
  draft: WorkoutRequestDraft,
): WorkoutRequestValidationResult {
  const issues: WorkoutRequestValidationIssue[] = [];

  if (draft.muscleIds.length === 0) {
    issues.push({
      code: 'NO_TARGET_MUSCLES',
      path: 'muscleIds',
      message: 'Select at least one target muscle.',
    });
  }

  if (!isWorkoutRequestDurationValid(draft)) {
    issues.push({
      code: 'INVALID_DURATION',
      path: 'durationMinutes',
      message:
        draft.durationMode === 'custom'
          ? 'Enter minutes between 15 and 240.'
          : 'Choose a duration.',
    });
  }

  if (
    draft.equipmentId === null ||
    !workoutRequestEquipmentOptions.some((option) => option.id === draft.equipmentId)
  ) {
    issues.push({
      code: 'NO_EQUIPMENT_CONTEXT',
      path: 'equipmentId',
      message: 'Choose your equipment context.',
    });
  }

  return { issues };
}

/**
 * True when the draft's resolved duration satisfies its mode. Preset mode
 * requires a preset value; custom mode requires a non-null integer within the
 * custom bounds. Pure so it can be reused by the form and tests.
 */
export function isWorkoutRequestDurationValid(draft: WorkoutRequestDraft): boolean {
  if (draft.durationMode === 'custom') {
    return isCustomDurationValid(draft.durationMinutes);
  }
  return (
    draft.durationMinutes !== null &&
    (workoutRequestDurationOptions as readonly number[]).includes(draft.durationMinutes)
  );
}

export function isWorkoutRequestValid(draft: WorkoutRequestDraft): boolean {
  return validateWorkoutRequest(draft).issues.length === 0;
}

/**
 * Parses custom input text into integer minutes, or null when it is empty,
 * non-integer, or outside the custom bounds. Pure and coercion-free: "12.5",
 * "", and "300" all resolve to null rather than a rounded/clamped value.
 */
function resolveCustomDurationMinutes(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  // Reject decimals, signs, and anything other than a bare integer.
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number.parseInt(trimmed, 10);
  if (!isCustomDurationValid(minutes)) return null;
  return minutes;
}

function isCustomDurationValid(minutes: number | null): boolean {
  return (
    minutes !== null &&
    Number.isInteger(minutes) &&
    minutes >= CUSTOM_DURATION_MIN &&
    minutes <= CUSTOM_DURATION_MAX
  );
}

/**
 * Returns the first issue for a path, or undefined. Used by the form to render
 * a single concise inline message per field.
 */
export function firstWorkoutRequestIssue(
  result: WorkoutRequestValidationResult,
  path: string,
): WorkoutRequestValidationIssue | undefined {
  return result.issues.find((issue) => issue.path === path);
}

/**
 * Pure, immutable draft transitions. Each returns a new draft so React state
 * stays predictable and the request values are easy to preserve when returning
 * to edit.
 */
export function toggleWorkoutRequestMuscle(
  draft: WorkoutRequestDraft,
  muscleId: WorkoutRequestMuscleId,
): WorkoutRequestDraft {
  const exists = draft.muscleIds.includes(muscleId);
  if (exists) {
    return {
      ...draft,
      muscleIds: draft.muscleIds.filter((id) => id !== muscleId),
    };
  }
  return { ...draft, muscleIds: [...draft.muscleIds, muscleId] };
}

export function setWorkoutRequestDuration(
  draft: WorkoutRequestDraft,
  durationMinutes: WorkoutRequestDurationOption,
): WorkoutRequestDraft {
  return { ...draft, durationMode: 'preset', durationMinutes };
}

/**
 * Selects preset mode, making the preset authoritative. The user's previous
 * custom input is intentionally preserved in {@link WorkoutRequestDraft.customDurationInput}
 * so switching back to Custom restores it.
 */
export function setWorkoutRequestPresetDuration(
  draft: WorkoutRequestDraft,
  durationMinutes: WorkoutRequestDurationOption,
): WorkoutRequestDraft {
  return {
    ...draft,
    durationMode: 'preset',
    durationMinutes,
  };
}

/**
 * Switches to custom mode. Keeps the existing custom input (so a return from a
 * preset restores the previous value) and resolves {@link WorkoutRequestDraft.durationMinutes}
 * from it; an empty/invalid input resolves to null and is rejected by
 * validation without coercion.
 */
export function setWorkoutRequestCustomDuration(draft: WorkoutRequestDraft): WorkoutRequestDraft {
  return {
    ...draft,
    durationMode: 'custom',
    durationMinutes: resolveCustomDurationMinutes(draft.customDurationInput),
  };
}

/**
 * Updates the custom input text. Resolves {@link WorkoutRequestDraft.durationMinutes}
 * from the text when in custom mode; in preset mode the preset stays
 * authoritative and the input is only recorded for a later switch back. Never
 * coerces: empty, decimal, or out-of-range text resolves to null.
 */
export function setWorkoutRequestCustomDurationInput(
  draft: WorkoutRequestDraft,
  input: string,
): WorkoutRequestDraft {
  const minutes = resolveCustomDurationMinutes(input);
  return {
    ...draft,
    customDurationInput: input,
    durationMinutes: draft.durationMode === 'custom' ? minutes : draft.durationMinutes,
  };
}

export function setWorkoutRequestEquipment(
  draft: WorkoutRequestDraft,
  equipmentId: WorkoutRequestEquipmentId,
): WorkoutRequestDraft {
  return { ...draft, equipmentId };
}
