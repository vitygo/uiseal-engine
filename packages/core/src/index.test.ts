import { describe, expect, it } from 'vitest';
import { version } from './index';

describe('core', () => {
  it('exports a version string', () => {
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });
});
