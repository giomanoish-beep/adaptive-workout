import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('pain safety package', () => {
  it('is available to the workspace', () => {
    expect(packageName).toBe('@adaptive-workout/pain-safety');
  });
});
