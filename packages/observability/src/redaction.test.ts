import { describe, expect, it } from 'vitest';
import { redactSensitiveValues } from './redaction.js';

describe('redactSensitiveValues', () => {
  it('redacts apiKey', () => {
    const input = { apiKey: 'sk-secret-123' };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ apiKey: '[REDACTED]' });
  });

  it('redacts API_KEY case-insensitively', () => {
    const input = { API_KEY: 'secret-abc' };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ API_KEY: '[REDACTED]' });
  });

  it('redacts authorization', () => {
    const input = { authorization: 'Bearer token123' };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ authorization: '[REDACTED]' });
  });

  it('redacts token', () => {
    const input = { token: 'jwt-token-value' };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ token: '[REDACTED]' });
  });

  it('redacts access token variants', () => {
    const input = { accessToken: 'acc-123', access_token: 'acc-456' };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ accessToken: '[REDACTED]', access_token: '[REDACTED]' });
  });

  it('redacts refresh token variants', () => {
    const input = { refreshToken: 'ref-123', refresh_token: 'ref-456' };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ refreshToken: '[REDACTED]', refresh_token: '[REDACTED]' });
  });

  it('redacts service-role key variants', () => {
    const input = { serviceRoleKey: 'srk-123', service_role_key: 'srk-456' };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ serviceRoleKey: '[REDACTED]', service_role_key: '[REDACTED]' });
  });

  it('redacts password', () => {
    const input = { password: 'hunter2' };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ password: '[REDACTED]' });
  });

  it('redacts secret', () => {
    const input = { secret: 'keep-it-safe' };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ secret: '[REDACTED]' });
  });

  it('redacts cookie and set-cookie', () => {
    const input = { cookie: 'session=abc', 'set-cookie': 'session=def' };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ cookie: '[REDACTED]', 'set-cookie': '[REDACTED]' });
  });

  it('nested sensitive key is redacted', () => {
    const input = {
      safe: 'visible',
      nested: { apiKey: 'secret-nested' },
    };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({
      safe: 'visible',
      nested: { apiKey: '[REDACTED]' },
    });
  });

  it('sensitive key inside array object is redacted', () => {
    const input = {
      items: [{ name: 'item1', token: 'tok1' }, { name: 'item2', token: 'tok2' }],
    };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({
      items: [
        { name: 'item1', token: '[REDACTED]' },
        { name: 'item2', token: '[REDACTED]' },
      ],
    });
  });

  it('non-sensitive values are preserved', () => {
    const input = {
      name: 'test',
      count: 42,
      enabled: true,
      tags: ['a', 'b', 'c'],
    };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({
      name: 'test',
      count: 42,
      enabled: true,
      tags: ['a', 'b', 'c'],
    });
  });

  it('null is preserved', () => {
    const input = { value: null, nested: { alsoNull: null } };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ value: null, nested: { alsoNull: null } });
  });

  it('zero is preserved', () => {
    const input = { zero: 0, count: 0 };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ zero: 0, count: 0 });
  });

  it('false is preserved', () => {
    const input = { flag: false, enabled: false };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({ flag: false, enabled: false });
  });

  it('source object is not mutated', () => {
    const input = { apiKey: 'secret', name: 'unchanged' };
    const copyBefore = structuredClone(input);
    redactSensitiveValues(input);
    expect(input).toEqual(copyBefore);
  });

  it('maximum depth is bounded', () => {
    // Create a deeply nested object that exceeds default max depth (20)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let deep: any = { leaf: 'bottom' };
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      deep = { nested: deep };
    }

    // With a low max depth, inner content becomes [MAX_DEPTH]
    const result = redactSensitiveValues(deep, 5);
    // Traverse down to verify the marker appears
    let current: unknown = result;
    let foundMarker = false;
    for (let i = 0; i < 30 && typeof current === 'object' && current !== null; i++) {
      const obj = current as Record<string, unknown>;
      if (obj.nested === '[MAX_DEPTH]') {
        foundMarker = true;
        break;
      }
      current = obj.nested;
    }
    expect(foundMarker).toBe(true);
  });

  it('mixed key casing is handled', () => {
    const input = { ApiKey: 's1', aPiKeY: 's2', Authorization: 's3', TOKEN: 's4' };
    const result = redactSensitiveValues(input);
    expect(result).toEqual({
      ApiKey: '[REDACTED]',
      aPiKeY: '[REDACTED]',
      Authorization: '[REDACTED]',
      TOKEN: '[REDACTED]',
    });
  });
});