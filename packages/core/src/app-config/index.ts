import fs from 'node:fs';
import path from 'node:path';

export interface AppConfigState {
  betaMode: boolean;
  bannerText: string | null;
  bannerType: 'info' | 'warning' | 'success' | null;
  bannerActive: boolean;
  cachedAt: Date;
  source: 'online' | 'cache' | 'offline';
}

interface AppConfigResponse {
  betaMode?: boolean;
  bannerText?: string | null;
  bannerType?: 'info' | 'warning' | 'success' | null;
  bannerActive?: boolean;
}

interface CacheFile {
  betaMode: boolean;
  bannerText: string | null;
  bannerType: 'info' | 'warning' | 'success' | null;
  bannerActive: boolean;
  cachedAt: string;
}

const CACHE_FILENAME = '.uiseal-appconfig-cache.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 3000;

function safeDefault(source: AppConfigState['source']): AppConfigState {
  return { betaMode: false, bannerText: null, bannerType: null, bannerActive: false, cachedAt: new Date(), source };
}

function readCache(projectRoot: string): CacheFile | null {
  try {
    const raw = fs.readFileSync(path.join(projectRoot, CACHE_FILENAME), 'utf8');
    return JSON.parse(raw) as CacheFile;
  } catch {
    return null;
  }
}

function writeCache(projectRoot: string, state: AppConfigState): void {
  try {
    const target = path.join(projectRoot, CACHE_FILENAME);
    const tmp = `${target}.tmp`;
    const data: CacheFile = {
      betaMode: state.betaMode,
      bannerText: state.bannerText,
      bannerType: state.bannerType,
      bannerActive: state.bannerActive,
      cachedAt: state.cachedAt.toISOString(),
    };
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, target);
  } catch {
    // Non-fatal — cache write failure never blocks the scan
  }
}

function stateFromCache(cache: CacheFile, source: AppConfigState['source']): AppConfigState {
  return {
    betaMode: cache.betaMode,
    bannerText: cache.bannerText,
    bannerType: cache.bannerType,
    bannerActive: cache.bannerActive,
    cachedAt: new Date(cache.cachedAt),
    source,
  };
}

async function getWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { method: 'GET', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAppConfig(
  apiUrl: string,
  projectRoot: string,
): Promise<AppConfigState> {
  const cache = readCache(projectRoot);

  if (cache) {
    const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
    if (ageMs < CACHE_TTL_MS) {
      return stateFromCache(cache, 'cache');
    }
  }

  try {
    const response = await getWithTimeout(`${apiUrl}/public/app-config`, NETWORK_TIMEOUT_MS);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as AppConfigResponse;
    const state: AppConfigState = {
      betaMode: data.betaMode ?? false,
      bannerText: data.bannerText ?? null,
      bannerType: data.bannerType ?? null,
      bannerActive: data.bannerActive ?? false,
      cachedAt: new Date(),
      source: 'online',
    };
    writeCache(projectRoot, state);
    return state;
  } catch {
    if (cache) return stateFromCache(cache, 'offline');
    return safeDefault('offline');
  }
}
