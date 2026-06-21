import fs from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import type { Rule } from '../rules/types.js';
import { allRules } from '../rules/index.js';

export type Plan = 'free' | 'trial' | 'team' | 'business' | 'enterprise';

export interface LicenseState {
  valid: boolean;
  plan: Plan;
  token: string | null;
  trialEndsAt: Date | null;
  cachedAt: Date;
  source: 'online' | 'cache' | 'offline' | 'none';
}

export interface ValidateResponse {
  valid: boolean;
  plan: Plan;
  trialEndsAt?: string;
}

interface CachePayload {
  token: string;
  plan: Plan;
  valid: boolean;
  trialEndsAt: string | null;
  cachedAt: string;
}

interface CacheFile {
  payload: CachePayload;
  signature: string;
}

const CACHE_FILENAME = '.uiseal-license-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 3000;
// Embedded constant — stops casual text-editing, not a determined reverse engineer
const CACHE_SIGNING_KEY = 'uiseal-cache-v1';
// Matches both auth-generated (uiseal_<48hex>) and rotated (<64hex>) tokens
const TOKEN_PATTERN = /^(?:uiseal_[0-9a-f]{48}|[0-9a-f]{64})$/;

// Rules available on the free plan
const FREE_RULE_IDS = new Set([
  // design
  'no-hardcoded-color',
  'no-arbitrary-spacing',
  'no-arbitrary-font-size',
  'no-unauthorized-font-family',
  'no-arbitrary-radius',
  'enforce-contrast',
  // quality exception
  'no-inline-styles',
]);

function makeFreeState(source: LicenseState['source']): LicenseState {
  return { valid: false, plan: 'free', token: null, trialEndsAt: null, cachedAt: new Date(), source };
}

function isTrialExpired(trialEndsAt: Date | null): boolean {
  return trialEndsAt !== null && trialEndsAt < new Date();
}

function signPayload(payload: CachePayload): string {
  return createHmac('sha256', CACHE_SIGNING_KEY).update(JSON.stringify(payload)).digest('hex');
}

function cacheFromState(token: string, state: LicenseState): CacheFile {
  const payload: CachePayload = {
    token,
    plan: state.plan,
    valid: state.valid,
    trialEndsAt: state.trialEndsAt ? state.trialEndsAt.toISOString() : null,
    cachedAt: state.cachedAt.toISOString(),
  };
  return { payload, signature: signPayload(payload) };
}

function stateFromCache(cache: CachePayload, source: LicenseState['source']): LicenseState {
  return {
    valid: cache.valid,
    plan: cache.plan,
    token: cache.token,
    trialEndsAt: cache.trialEndsAt ? new Date(cache.trialEndsAt) : null,
    cachedAt: new Date(cache.cachedAt),
    source,
  };
}

function readCache(projectRoot: string, token: string): CachePayload | null {
  try {
    const raw = fs.readFileSync(path.join(projectRoot, CACHE_FILENAME), 'utf8');
    const data = JSON.parse(raw) as CacheFile;
    if (!data.payload || !data.signature) return null;
    if (data.signature !== signPayload(data.payload)) return null;
    return data.payload.token === token ? data.payload : null;
  } catch {
    return null;
  }
}

function writeCache(projectRoot: string, token: string, state: LicenseState): void {
  try {
    const target = path.join(projectRoot, CACHE_FILENAME);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cacheFromState(token, state), null, 2), 'utf8');
    fs.renameSync(tmp, target);
  } catch {
    // Non-fatal — cache write failure never blocks the scan
  }
}

async function fetchWithTimeout(url: string, body: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function validateLicense(
  token: string | null,
  apiUrl: string,
  projectRoot: string,
): Promise<LicenseState> {
  // a. No token → free immediately, no network
  if (!token) return makeFreeState('none');

  // b. Token format check — garbage/guessed tokens skip network entirely
  if (!TOKEN_PATTERN.test(token)) return makeFreeState('none');

  // c. Read cache
  const cache = readCache(projectRoot, token);

  // d. Fresh cache (< 24 h)
  if (cache) {
    const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
    if (ageMs < CACHE_TTL_MS) {
      const state = stateFromCache(cache, 'cache');
      if (state.plan === 'trial' && isTrialExpired(state.trialEndsAt)) return makeFreeState('cache');
      return state;
    }
  }

  // e. Network validation
  try {
    const response = await fetchWithTimeout(
      `${apiUrl}/auth/validate-token`,
      JSON.stringify({ token }),
      NETWORK_TIMEOUT_MS,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as ValidateResponse;
    const trialEndsAt = data.trialEndsAt ? new Date(data.trialEndsAt) : null;

    // e. Trial expired check for freshly-validated state
    if (data.valid && data.plan === 'trial' && isTrialExpired(trialEndsAt)) {
      const expired = makeFreeState('online');
      writeCache(projectRoot, token, expired);
      return expired;
    }

    const state: LicenseState = {
      valid: data.valid,
      plan: data.valid ? data.plan : 'free',
      token,
      trialEndsAt,
      cachedAt: new Date(),
      source: 'online',
    };
    writeCache(projectRoot, token, state);
    return state;
  } catch {
    // Network error / timeout → stale cache or free
    if (cache) {
      const stale = stateFromCache(cache, 'offline');
      if (stale.plan === 'trial' && isTrialExpired(stale.trialEndsAt)) return makeFreeState('offline');
      return stale;
    }
    return makeFreeState('offline');
  }
}

export function getRulesForPlan(
  plan: Plan,
  _configRules: Record<string, 'off' | 'warn' | 'error'>,
): Rule[] {
  if (plan === 'free') {
    return allRules.filter((r) => FREE_RULE_IDS.has(r.id));
  }
  return allRules;
}
