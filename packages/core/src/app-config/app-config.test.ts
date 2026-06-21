import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fetchAppConfig } from './index.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-appconfig-'));
}

function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeCache(dir: string, data: object): void {
  fs.writeFileSync(path.join(dir, '.uiseal-appconfig-cache.json'), JSON.stringify(data));
}

function freshCacheDate(): string {
  return new Date().toISOString();
}

function staleCacheDate(): string {
  return new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchAppConfig', () => {
  it('returns safe offline default when no cache and network fails', async () => {
    const dir = tmpDir();
    try {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const state = await fetchAppConfig('http://api.test', dir);

      expect(state.betaMode).toBe(false);
      expect(state.bannerActive).toBe(false);
      expect(state.bannerText).toBeNull();
      expect(state.bannerType).toBeNull();
      expect(state.source).toBe('offline');
    } finally {
      rmDir(dir);
    }
  });

  it('returns fresh cache without network call when cache is < 24h old', async () => {
    const dir = tmpDir();
    try {
      writeCache(dir, {
        betaMode: true,
        bannerText: 'Hello world',
        bannerType: 'info',
        bannerActive: true,
        cachedAt: freshCacheDate(),
      });
      const fetchSpy = vi.spyOn(global, 'fetch');
      const state = await fetchAppConfig('http://api.test', dir);

      expect(state.betaMode).toBe(true);
      expect(state.bannerText).toBe('Hello world');
      expect(state.bannerActive).toBe(true);
      expect(state.source).toBe('cache');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      rmDir(dir);
    }
  });

  it('fetches from network and writes cache when stale cache exists', async () => {
    const dir = tmpDir();
    try {
      writeCache(dir, {
        betaMode: false,
        bannerText: null,
        bannerType: null,
        bannerActive: false,
        cachedAt: staleCacheDate(),
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ betaMode: true, bannerText: 'New banner', bannerType: 'warning', bannerActive: true }),
      }));

      const state = await fetchAppConfig('http://api.test', dir);

      expect(state.betaMode).toBe(true);
      expect(state.bannerText).toBe('New banner');
      expect(state.bannerType).toBe('warning');
      expect(state.source).toBe('online');

      const cached = JSON.parse(fs.readFileSync(path.join(dir, '.uiseal-appconfig-cache.json'), 'utf8'));
      expect(cached.betaMode).toBe(true);
      expect(cached.bannerText).toBe('New banner');
    } finally {
      rmDir(dir);
    }
  });

  it('returns stale cache with source "offline" when network fails and stale cache exists', async () => {
    const dir = tmpDir();
    try {
      writeCache(dir, {
        betaMode: true,
        bannerText: 'Stale banner',
        bannerType: 'info',
        bannerActive: true,
        cachedAt: staleCacheDate(),
      });
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

      const state = await fetchAppConfig('http://api.test', dir);

      expect(state.betaMode).toBe(true);
      expect(state.bannerText).toBe('Stale banner');
      expect(state.source).toBe('offline');
    } finally {
      rmDir(dir);
    }
  });

  it('handles non-ok HTTP response by falling back to offline default', async () => {
    const dir = tmpDir();
    try {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

      const state = await fetchAppConfig('http://api.test', dir);

      expect(state.betaMode).toBe(false);
      expect(state.bannerActive).toBe(false);
      expect(state.source).toBe('offline');
    } finally {
      rmDir(dir);
    }
  });

  it('uses missing fields as safe defaults when response omits them', async () => {
    const dir = tmpDir();
    try {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }));

      const state = await fetchAppConfig('http://api.test', dir);

      expect(state.betaMode).toBe(false);
      expect(state.bannerText).toBeNull();
      expect(state.bannerType).toBeNull();
      expect(state.bannerActive).toBe(false);
      expect(state.source).toBe('online');
    } finally {
      rmDir(dir);
    }
  });

  it('never throws — always returns an AppConfigState', async () => {
    const state = await fetchAppConfig('http://definitely-unreachable.invalid', os.tmpdir());
    expect(state).toHaveProperty('betaMode');
    expect(state).toHaveProperty('bannerActive');
    expect(state).toHaveProperty('source');
  });
});
