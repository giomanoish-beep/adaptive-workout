const REDACTED = '[REDACTED]' as const;
const MAX_DEPTH_MARKER = '[MAX_DEPTH]' as const;
const DEFAULT_MAX_DEPTH = 20;

const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'servicerolekey',
  'service_role_key',
  'password',
  'secret',
  'cookie',
  'set-cookie',
]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

/**
 * Recursively redacts values whose keys match case-insensitive sensitive key
 * patterns. Returns a new value — never mutates the input.
 *
 * - Sensitive values are replaced with `[REDACTED]`.
 * - Non-sensitive primitives (null, boolean, number, string) are preserved.
 * - Arrays and plain objects are recursed into.
 * - Maximum depth is bounded; beyond it, deeper content is replaced with
 *   `[MAX_DEPTH]`.
 */
export function redactSensitiveValues(
  value: unknown,
  maxDepth = DEFAULT_MAX_DEPTH,
): unknown {
  return redactImpl(value, 0, maxDepth);
}

function redactImpl(value: unknown, depth: number, maxDepth: number): unknown {
  if (depth > maxDepth) {
    return MAX_DEPTH_MARKER;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactImpl(item, depth + 1, maxDepth));
  }

  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      if (isSensitiveKey(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = redactImpl(record[key], depth + 1, maxDepth);
      }
    }
    return result;
  }

  // Unknown types (functions, class instances, etc.): return a safe representation.
  return REDACTED;
}