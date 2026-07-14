import { describe, expect, it } from 'vitest';
import { domainError, failure, parseDomainId, parseVersionIdentifier, success } from './index';

describe('domain identifiers', () => {
  it('parses and normalizes UUID identifiers', () => {
    const result = parseDomainId('A0EBC999-9C0B-4EF8-BB6D-6BB9BD380A11', 'exercise');

    expect(result).toEqual({
      ok: true,
      value: 'a0ebc999-9c0b-4ef8-bb6d-6bb9bd380a11',
    });
  });

  it('returns a typed validation error for invalid identifiers', () => {
    const result = parseDomainId('not-a-uuid', 'exercise');

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid exercise ID.',
        details: { entityName: 'exercise', requirement: 'UUID' },
      },
    });
  });
});

describe('domain errors', () => {
  it('uses serializable discriminated results', () => {
    expect(success({ count: 1 })).toEqual({ ok: true, value: { count: 1 } });
    expect(failure(domainError('CONFLICT', 'State changed.'))).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: 'State changed.' },
    });
  });
});

describe('domain versions', () => {
  it('accepts stable version identifiers', () => {
    expect(parseVersionIdentifier('workout-v1.2', 'engine')).toEqual({
      ok: true,
      value: 'workout-v1.2',
    });
  });

  it('rejects ambiguous version identifiers', () => {
    const result = parseVersionIdentifier(' workout v1 ', 'engine');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });
});
