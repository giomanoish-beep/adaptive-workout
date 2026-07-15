/**
 * Pure, React-free validation for active-workout set logging (WEB_APP-004).
 *
 * Inputs arrive from text fields, so every value is parsed explicitly and
 * invalid input is surfaced rather than silently coerced (task spec). An empty
 * RIR is a valid "unknown" and is never converted to 0.
 *
 * No browser storage, no server calls, no AI (docs/ARCHITECTURE.md).
 */

/** The raw string values a user enters for a set. */
export interface SetEntryInput {
  readonly weight: string;
  readonly reps: string;
  readonly rir: string;
}

export const setEntryValidationCodes = [
  'WEIGHT_REQUIRED',
  'WEIGHT_INVALID',
  'WEIGHT_NEGATIVE',
  'REPS_REQUIRED',
  'REPS_INVALID',
  'REPS_DECIMAL',
  'REPS_NEGATIVE',
  'RIR_INVALID',
  'RIR_OUT_OF_RANGE',
] as const;

export type SetEntryValidationCode = (typeof setEntryValidationCodes)[number];

export interface SetEntryValidationIssue {
  readonly code: SetEntryValidationCode;
  readonly field: 'weight' | 'reps' | 'rir';
  readonly message: string;
}

export interface SetEntryValidationResult {
  readonly issues: readonly SetEntryValidationIssue[];
}

export const emptySetEntryInput: SetEntryInput = { weight: '', reps: '', rir: '' };

/**
 * Parses a trimmed numeric text field. Returns null when the field is empty,
 * NaN when the text is present but not a parseable number. Accepts an optional
 * leading minus so negative values stay distinguishable from non-numeric input
 * (range checks classify negatives separately). Pure.
 */
function parseNumberText(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  // Reject values that Number.parseFloat would leniently accept as partial
  // input (e.g. "12." or ".") so the UI reports them as invalid instead.
  if (!/-?\d+(?:\.\d+)?$/.test(trimmed)) return Number.NaN;
  return Number.parseFloat(trimmed);
}

/**
 * Validates a set entry. Weight accepts non-negative decimals, reps accept
 * non-negative integers, RIR accepts an integer 0–10 or empty (unknown).
 * Returns a deterministic, ordered issue list.
 */
export function validateSetEntry(input: SetEntryInput): SetEntryValidationResult {
  const issues: SetEntryValidationIssue[] = [];

  const weight = parseNumberText(input.weight);
  if (weight === null) {
    issues.push({
      code: 'WEIGHT_REQUIRED',
      field: 'weight',
      message: 'Enter a weight.',
    });
  } else if (Number.isNaN(weight)) {
    issues.push({
      code: 'WEIGHT_INVALID',
      field: 'weight',
      message: 'Weight must be a number.',
    });
  } else if (weight < 0) {
    issues.push({
      code: 'WEIGHT_NEGATIVE',
      field: 'weight',
      message: 'Weight cannot be negative.',
    });
  }

  const reps = parseNumberText(input.reps);
  if (reps === null) {
    issues.push({
      code: 'REPS_REQUIRED',
      field: 'reps',
      message: 'Enter reps.',
    });
  } else if (Number.isNaN(reps)) {
    issues.push({
      code: 'REPS_INVALID',
      field: 'reps',
      message: 'Reps must be a number.',
    });
  } else if (!Number.isInteger(reps)) {
    issues.push({
      code: 'REPS_DECIMAL',
      field: 'reps',
      message: 'Reps must be a whole number.',
    });
  } else if (reps < 0) {
    issues.push({
      code: 'REPS_NEGATIVE',
      field: 'reps',
      message: 'Reps cannot be negative.',
    });
  }

  const rir = parseNumberText(input.rir);
  if (rir !== null) {
    if (Number.isNaN(rir) || !Number.isInteger(rir)) {
      issues.push({
        code: 'RIR_INVALID',
        field: 'rir',
        message: 'RIR must be a whole number.',
      });
    } else if (rir < 0 || rir > 10) {
      issues.push({
        code: 'RIR_OUT_OF_RANGE',
        field: 'rir',
        message: 'RIR must be between 0 and 10.',
      });
    }
  }

  return { issues };
}

export function isSetEntryValid(input: SetEntryInput): boolean {
  return validateSetEntry(input).issues.length === 0;
}

/**
 * A logged set value: weight and reps are numbers (validated), RIR is a number
 * or null (unknown). This is the normalized shape stored in state once a set
 * is completed.
 */
export interface LoggedSetValue {
  readonly weight: number;
  readonly reps: number;
  readonly rir: number | null;
}

/**
 * Normalizes a valid SetEntryInput into a LoggedSetValue. Empty RIR stays null
 * (unknown); it is never coerced to 0. Only call this after validation passes.
 */
export function toLoggedSet(input: SetEntryInput): LoggedSetValue {
  return {
    weight: Number.parseFloat(input.weight.trim()),
    reps: Number.parseInt(input.reps.trim(), 10),
    rir: input.rir.trim().length === 0 ? null : Number.parseInt(input.rir.trim(), 10),
  };
}

/**
 * Whether a set entry can be completed: valid weight and reps (RIR may be
 * unknown). Completion requires valid weight/reps values (task spec).
 */
export function canCompleteSetEntry(input: SetEntryInput): boolean {
  return isSetEntryValid(input);
}
