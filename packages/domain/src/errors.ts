export const domainErrorCodes = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'INVARIANT_VIOLATION',
  'UNSUPPORTED_VERSION',
] as const;

export type DomainErrorCode = (typeof domainErrorCodes)[number];

export interface DomainError<Code extends string = DomainErrorCode> {
  readonly code: Code;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type DomainResult<Value, Code extends string = DomainErrorCode> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: DomainError<Code> };

export function domainError<Code extends string>(
  code: Code,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): DomainError<Code> {
  return details ? { code, message, details } : { code, message };
}

export function success<Value>(value: Value): DomainResult<Value, never> {
  return { ok: true, value };
}

export function failure<Code extends string>(error: DomainError<Code>): DomainResult<never, Code> {
  return { ok: false, error };
}
