/**
 * Pure email normalization and validation for the sign-in form (WEB_APP-001).
 * React-free and deterministic; the same input always yields the same result.
 *
 * The browser only ever sends a normalized email to Supabase Auth; no server
 * secrets or workout/fitness data are involved (docs/ARCHITECTURE.md).
 */

export const emailValidationCodes = ['EMPTY', 'INVALID'] as const;
export type EmailValidationCode = (typeof emailValidationCodes)[number];

export interface EmailValidationResult {
  readonly ok: boolean;
  readonly code: EmailValidationCode | null;
  readonly normalized: string;
}

/**
 * Normalizes an email by trimming surrounding whitespace and lowercasing the
 * result. Returns the normalized value alongside validation status so callers
 * can display it in the success state without re-normalizing.
 *
 * Validation is intentionally pragmatic: a non-empty string with a single "@"
 * and at least one dot in the domain. This guards obvious typos before calling
 * Supabase; it is not an RFC 5322 implementation and never claims to be.
 */
export function normalizeEmail(input: string): EmailValidationResult {
  const normalized = input.trim().toLowerCase();
  if (normalized.length === 0) {
    return { ok: false, code: 'EMPTY', normalized };
  }
  if (!looksLikeEmail(normalized)) {
    return { ok: false, code: 'INVALID', normalized };
  }
  return { ok: true, code: null, normalized };
}

export function isValidEmail(input: string): boolean {
  return normalizeEmail(input).ok;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function looksLikeEmail(value: string): boolean {
  const atIndex = value.indexOf('@');
  const lastAtIndex = value.lastIndexOf('@');
  // Exactly one "@", something on both sides, and a dotted domain.
  return (
    atIndex > 0 &&
    atIndex === lastAtIndex &&
    atIndex < value.length - 1 &&
    emailPattern.test(value)
  );
}
