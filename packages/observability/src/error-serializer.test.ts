import { describe, expect, it } from 'vitest';
import { serializeError } from './error-serializer.js';

describe('serializeError', () => {
  it('preserves standard Error name and message', () => {
    const error = new Error('something went wrong');
    const result = serializeError(error);
    expect(result).toEqual({ name: 'Error', message: 'something went wrong' });
  });

  it('omits stack by default', () => {
    const error = new Error('test');
    const result = serializeError(error);
    expect(result.stack).toBeUndefined();
  });

  it('includes stack when explicitly enabled', () => {
    const error = new Error('test');
    const result = serializeError(error, { includeStack: true });
    expect(result.stack).toBeDefined();
    expect(typeof result.stack).toBe('string');
  });

  it('preserves error code when explicit', () => {
    const error = Object.assign(new Error('auth failed'), { code: 'AUTH_EXPIRED' });
    const result = serializeError(error);
    expect(result).toEqual({
      name: 'Error',
      message: 'auth failed',
      code: 'AUTH_EXPIRED',
    });
  });

  it('does not leak sensitive custom properties', () => {
    const error = Object.assign(new Error('failure'), {
      apiKey: 'sk-secret',
      headers: { authorization: 'Bearer abc' },
      body: 'response',
    });
    const result = serializeError(error);
    // Only name and message should appear.
    expect(result.apiKey).toBeUndefined();
    expect(result.headers).toBeUndefined();
    expect(result.body).toBeUndefined();
    expect(result).toEqual({ name: 'Error', message: 'failure' });
  });

  it('handles unknown thrown strings safely', () => {
    const result = serializeError('just a string');
    expect(result).toEqual({ name: 'Error', message: 'just a string' });
  });

  it('handles thrown numbers', () => {
    const result = serializeError(42);
    expect(result).toEqual({ name: 'Error', message: '42' });
  });

  it('handles unknown thrown objects', () => {
    const result = serializeError({ foo: 'bar' });
    expect(result).toEqual({ name: 'UnknownError', message: 'An unknown error occurred.' });
  });

  it('handles null thrown', () => {
    const result = serializeError(null);
    expect(result).toEqual({ name: 'UnknownError', message: 'An unknown error occurred.' });
  });

  it('handles undefined thrown', () => {
    const result = serializeError(undefined);
    expect(result).toEqual({ name: 'UnknownError', message: 'An unknown error occurred.' });
  });
});
