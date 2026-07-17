import { type ObservabilityMetadataValue } from './contracts.js';

/**
 * Controlled error code interface. Errors that implement this
 * can supply a stable code without exposing arbitrary properties.
 */
export interface HasErrorCode {
  readonly code?: string;
}

/**
 * Serializes an unknown error into a safe, plain metadata object.
 *
 * - Standard Error: includes `name` and `message`.
 * - Stack trace: only included when `includeStack` is explicitly `true`.
 * - Error code: included when the error has an explicit `code` property
 *   (string or number).
 * - Arbitrary enumerable properties, request headers, response bodies, and
 *   other sensitive data are **never** serialized.
 *
 * Thrown non-Error values (strings, numbers) are normalized to a `message`.
 */
export function serializeError(
  error: unknown,
  options: { readonly includeStack?: boolean } = {},
): Record<string, ObservabilityMetadataValue> {
  const result: Record<string, ObservabilityMetadataValue> = {};

  if (error instanceof Error) {
    result.name = error.name;
    result.message = error.message;

    if (options.includeStack === true && typeof error.stack === 'string') {
      result.stack = error.stack;
    }

    // Only extract `code` if it's explicitly a string or number.
    const code = (error as HasErrorCode).code;
    if (typeof code === 'string' || typeof code === 'number') {
      result.code = code;
    }
  } else if (typeof error === 'string') {
    result.name = 'Error';
    result.message = error;
  } else if (typeof error === 'number' || typeof error === 'boolean') {
    result.name = 'Error';
    result.message = String(error);
  } else {
    result.name = 'UnknownError';
    result.message = 'An unknown error occurred.';
  }

  return result;
}
