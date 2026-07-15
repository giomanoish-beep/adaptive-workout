import { describe, expect, it } from 'vitest';
import { isValidEmail, normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('normalizes a valid email by trimming and lowercasing', () => {
    const result = normalizeEmail('  Athlete@Example.COM  ');
    expect(result.ok).toBe(true);
    expect(result.code).toBeNull();
    expect(result.normalized).toBe('athlete@example.com');
  });

  it('rejects an empty email after trimming', () => {
    const result = normalizeEmail('   ');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('EMPTY');
    expect(result.normalized).toBe('');
  });

  it('rejects an invalid email without an @', () => {
    const result = normalizeEmail('not-an-email');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID');
  });

  it('rejects an email with multiple @ symbols', () => {
    const result = normalizeEmail('a@b@example.com');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID');
  });

  it('rejects an email without a dotted domain', () => {
    const result = normalizeEmail('athlete@example');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID');
  });

  it('is deterministic for identical inputs', () => {
    expect(normalizeEmail('  A@B.IO  ')).toEqual(normalizeEmail('  A@B.IO  '));
  });
});

describe('isValidEmail', () => {
  it('returns true for a valid normalized email', () => {
    expect(isValidEmail('athlete@example.com')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });
});
