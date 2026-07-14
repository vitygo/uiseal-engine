import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAllSources, getSourceById, detectSources } from './registry.js';

describe('sources registry', () => {
  it('getAllSources() includes code-scan', () => {
    const sources = getAllSources();
    expect(sources.some((s) => s.id === 'code-scan')).toBe(true);
  });

  it('getSourceById() finds a registered source by id', () => {
    expect(getSourceById('code-scan')?.id).toBe('code-scan');
  });

  it('getSourceById() returns undefined for an unknown id', () => {
    expect(getSourceById('does-not-exist')).toBeUndefined();
  });

  it('detectSources() always includes code-scan as a fallback', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-registry-'));
    try {
      const detected = await detectSources(tmpDir);
      expect(detected.some((d) => d.source.id === 'code-scan')).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detectSources() sorts results by confidence descending', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-registry-'));
    try {
      const detected = await detectSources(tmpDir);
      for (let i = 1; i < detected.length; i++) {
        expect(detected[i - 1]!.result.confidence).toBeGreaterThanOrEqual(
          detected[i]!.result.confidence,
        );
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
