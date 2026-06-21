import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { validateLicense, getRulesForPlan } from './index.js';
import { allRules } from '../rules/index.js';

// ── helpers ──────────────────────────────────────────────────────────────────

// A valid-format token matching the uiseal_<48hex> pattern (auth-generated)
const VALID_TOKEN = 'uiseal_' + 'a'.repeat(48);
// A second distinct valid token for "wrong token in cache" tests
const OTHER_VALID_TOKEN = 'uiseal_' + 'b'.repeat(48);

const CACHE_SIGNING_KEY = 'uiseal-cache-v1';

function signPayload(payload: object): string {
  return createHmac('sha256', CACHE_SIGNING_KEY).update(JSON.stringify(payload)).digest('hex');
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-lic-'));
}

function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Write a correctly signed cache file. */
function writeSignedCache(dir: string, payload: object): void {
  const signature = signPayload(payload);
  fs.writeFileSync(
    path.join(dir, '.uiseal-license-cache.json'),
    JSON.stringify({ payload, signature }),
  );
}

/** Write a raw (unsigned / tampered) cache file — used to test invalid-cache paths. */
function writeRawCache(dir: string, data: object): void {
  fs.writeFileSync(path.join(dir, '.uiseal-license-cache.json'), JSON.stringify(data));
}

function freshCacheDate(): string {
  return new Date().toISOString();
}

function staleCacheDate(): string {
  return new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
}

function futureDate(): string {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function pastDate(): string {
  return new Date(Date.now() - 1000).toISOString();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── validateLicense ───────────────────────────────────────────────────────────

describe('validateLicense', () => {
  // Test 8: no token → free, no network call
  it('returns free state immediately when token is null', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const state = await validateLicense(null, 'http://api.test', '/tmp');

    expect(state.plan).toBe('free');
    expect(state.valid).toBe(false);
    expect(state.source).toBe('none');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns free state immediately when token is empty string', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const state = await validateLicense('', 'http://api.test', '/tmp');

    expect(state.plan).toBe('free');
    expect(state.source).toBe('none');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Test 9: valid cache < 24h → returns cache, no network call
  it('returns cached state without network when cache is fresh', async () => {
    const dir = tmpDir();
    try {
      writeSignedCache(dir, { token: VALID_TOKEN, plan: 'team', valid: true, trialEndsAt: null, cachedAt: freshCacheDate() });

      const fetchSpy = vi.spyOn(global, 'fetch');
      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(state.plan).toBe('team');
      expect(state.valid).toBe(true);
      expect(state.source).toBe('cache');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      rmDir(dir);
    }
  });

  // Test 10: stale cache + network success → updates cache, returns new state
  it('updates cache and returns new state when stale cache and network succeeds', async () => {
    const dir = tmpDir();
    try {
      writeSignedCache(dir, { token: VALID_TOKEN, plan: 'trial', valid: true, trialEndsAt: null, cachedAt: staleCacheDate() });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true, plan: 'business' }),
      }));

      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(state.plan).toBe('business');
      expect(state.source).toBe('online');

      // Cache file should reflect the new plan (new format: { payload, signature })
      const cached = JSON.parse(fs.readFileSync(path.join(dir, '.uiseal-license-cache.json'), 'utf8'));
      expect(cached.payload.plan).toBe('business');
    } finally {
      rmDir(dir);
    }
  });

  // Test 11: stale cache + network timeout → stale cache, source 'offline'
  it('returns stale cache with source "offline" when network times out', async () => {
    const dir = tmpDir();
    try {
      writeSignedCache(dir, { token: VALID_TOKEN, plan: 'team', valid: true, trialEndsAt: null, cachedAt: staleCacheDate() });

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(state.plan).toBe('team');
      expect(state.valid).toBe(true);
      expect(state.source).toBe('offline');
    } finally {
      rmDir(dir);
    }
  });

  // Test 12: no cache + network timeout → free, source 'offline'
  it('returns free state with source "offline" when no cache and network fails', async () => {
    const dir = tmpDir();
    try {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(state.plan).toBe('free');
      expect(state.valid).toBe(false);
      expect(state.source).toBe('offline');
    } finally {
      rmDir(dir);
    }
  });

  // Test 13: trial with future trialEndsAt → valid team access
  it('grants access for trial with future trialEndsAt', async () => {
    const dir = tmpDir();
    try {
      writeSignedCache(dir, { token: VALID_TOKEN, plan: 'trial', valid: true, trialEndsAt: futureDate(), cachedAt: freshCacheDate() });

      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(state.plan).toBe('trial');
      expect(state.valid).toBe(true);
    } finally {
      rmDir(dir);
    }
  });

  // Test 14: trial with past trialEndsAt → free plan locally
  it('returns free plan when trial is expired', async () => {
    const dir = tmpDir();
    try {
      writeSignedCache(dir, { token: VALID_TOKEN, plan: 'trial', valid: true, trialEndsAt: pastDate(), cachedAt: freshCacheDate() });

      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(state.plan).toBe('free');
      expect(state.valid).toBe(false);
    } finally {
      rmDir(dir);
    }
  });

  it('returns free when online validation returns an expired trial', async () => {
    const dir = tmpDir();
    try {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true, plan: 'trial', trialEndsAt: pastDate() }),
      }));

      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(state.plan).toBe('free');
    } finally {
      rmDir(dir);
    }
  });

  it('ignores a cached entry for a different token', async () => {
    const dir = tmpDir();
    try {
      writeSignedCache(dir, { token: OTHER_VALID_TOKEN, plan: 'enterprise', valid: true, trialEndsAt: null, cachedAt: freshCacheDate() });

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(state.source).toBe('offline');
      expect(state.plan).toBe('free');
    } finally {
      rmDir(dir);
    }
  });

  it('never throws — always returns a LicenseState', async () => {
    const state = await validateLicense('bad-token', 'http://definitely-unreachable.invalid', os.tmpdir());
    expect(state).toHaveProperty('plan');
    expect(state).toHaveProperty('source');
  });
});

// ── HMAC cache signing ────────────────────────────────────────────────────────

describe('HMAC cache signing', () => {
  it('accepts a correctly signed cache without a network call', async () => {
    const dir = tmpDir();
    try {
      writeSignedCache(dir, { token: VALID_TOKEN, plan: 'business', valid: true, trialEndsAt: null, cachedAt: freshCacheDate() });

      const fetchSpy = vi.spyOn(global, 'fetch');
      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(state.plan).toBe('business');
      expect(state.source).toBe('cache');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      rmDir(dir);
    }
  });

  it('treats a tampered payload (plan changed, signature not recomputed) as invalid and falls through to network', async () => {
    const dir = tmpDir();
    try {
      // Build a valid signature for the original payload, then swap plan in the file
      const originalPayload = { token: VALID_TOKEN, plan: 'team', valid: true, trialEndsAt: null, cachedAt: freshCacheDate() };
      const originalSignature = signPayload(originalPayload);
      const tamperedPayload = { ...originalPayload, plan: 'enterprise' };
      fs.writeFileSync(
        path.join(dir, '.uiseal-license-cache.json'),
        JSON.stringify({ payload: tamperedPayload, signature: originalSignature }),
      );

      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(state.source).toBe('offline');
      expect(state.plan).toBe('free');
    } finally {
      rmDir(dir);
    }
  });

  it('treats a cache with no signature field (old format / hand-crafted) as invalid and falls through to network', async () => {
    const dir = tmpDir();
    try {
      // Old flat format — no wrapping payload/signature structure
      writeRawCache(dir, { token: VALID_TOKEN, plan: 'enterprise', valid: true, trialEndsAt: null, cachedAt: freshCacheDate() });

      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(state.source).toBe('offline');
    } finally {
      rmDir(dir);
    }
  });

  it('treats a cache where signature field is present but wrong as invalid', async () => {
    const dir = tmpDir();
    try {
      const payload = { token: VALID_TOKEN, plan: 'enterprise', valid: true, trialEndsAt: null, cachedAt: freshCacheDate() };
      writeRawCache(dir, { payload, signature: 'deadbeef' });

      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(state.plan).toBe('free');
    } finally {
      rmDir(dir);
    }
  });
});

// ── Token format check ────────────────────────────────────────────────────────

describe('token format check', () => {
  it('returns free immediately for a token that does not match the expected format — no network call', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const state = await validateLicense('not-a-valid-token', 'http://api.test', '/tmp');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.plan).toBe('free');
    expect(state.source).toBe('none');
  });

  it('returns free immediately for a too-short token', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const state = await validateLicense('abc123', 'http://api.test', '/tmp');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.plan).toBe('free');
  });

  it('returns free immediately for a token with uppercase hex (not the generated format)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const state = await validateLicense('A'.repeat(64), 'http://api.test', '/tmp');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.plan).toBe('free');
  });

  it('accepts a valid uiseal_<48hex> auth-format token and proceeds to network', async () => {
    const dir = tmpDir();
    try {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true, plan: 'team' }),
      }));

      const state = await validateLicense(VALID_TOKEN, 'http://api.test', dir);

      expect(state.plan).toBe('team');
      expect(state.source).toBe('online');
    } finally {
      rmDir(dir);
    }
  });

  it('accepts a valid <64hex> rotated token and proceeds to network', async () => {
    const dir = tmpDir();
    try {
      const rotatedToken = 'a'.repeat(64);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true, plan: 'business' }),
      }));

      const state = await validateLicense(rotatedToken, 'http://api.test', dir);

      expect(state.plan).toBe('business');
      expect(state.source).toBe('online');
    } finally {
      rmDir(dir);
    }
  });
});

// ── getRulesForPlan ───────────────────────────────────────────────────────────

describe('getRulesForPlan', () => {
  const FREE_DESIGN_IDS = [
    'no-hardcoded-color',
    'no-arbitrary-spacing',
    'no-arbitrary-font-size',
    'no-unauthorized-font-family',
    'no-arbitrary-radius',
    'enforce-contrast',
  ];

  const TEAM_ONLY_IDS = [
    // a11y
    'no-img-without-alt',
    'no-div-button',
    'no-empty-button',
    'no-missing-form-label',
    'no-positive-tabindex',
    'no-autofocus',
    // security
    'no-xss-dangerous',
    'no-env-in-client',
    'no-console-sensitive',
    'no-hardcoded-credentials',
    // quality (except no-inline-styles)
    'no-todo-without-ticket',
    'no-magic-numbers',
    'no-oversized-component',
    'no-console-log',
  ];

  // Test 15: free plan → only design + no-inline-styles
  it('returns only design rules and no-inline-styles for free plan', () => {
    const rules = getRulesForPlan('free', {});
    const ids = rules.map((r) => r.id);

    for (const id of FREE_DESIGN_IDS) {
      expect(ids, `expected free rule: ${id}`).toContain(id);
    }
    expect(ids).toContain('no-inline-styles');

    for (const id of TEAM_ONLY_IDS) {
      expect(ids, `expected NOT to contain team-only rule: ${id}`).not.toContain(id);
    }
  });

  // Test 16: team plan → all rules
  it('returns all rules for team plan', () => {
    const rules = getRulesForPlan('team', {});
    expect(rules).toHaveLength(allRules.length);
  });

  it('returns all rules for business plan', () => {
    const rules = getRulesForPlan('business', {});
    expect(rules).toHaveLength(allRules.length);
  });

  it('returns all rules for enterprise plan', () => {
    const rules = getRulesForPlan('enterprise', {});
    expect(rules).toHaveLength(allRules.length);
  });

  it('returns all rules for trial plan (non-expired handled by validateLicense)', () => {
    const rules = getRulesForPlan('trial', {});
    expect(rules).toHaveLength(allRules.length);
  });

  it('free plan returns 7 rules (6 design + no-inline-styles)', () => {
    const rules = getRulesForPlan('free', {});
    expect(rules).toHaveLength(7);
  });
});
