import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('ai package', () => {
  it('is available to the workspace', () => {
    expect(packageName).toBe('@adaptive-workout/ai');
  });
});
