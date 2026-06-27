/**
 * User-curated dictionary overrides (Phase 3).
 *
 * The base dictionary (`merchants.ts`) ships with the app and is updated
 * with each release. Users can extend or override it via localStorage:
 *
 *   localStorage['finances.autoCategorize.userDict.v1'] = JSON.stringify({
 *     version: 1,
 *     additions: [
 *       { categoryName: 'Compres', tokens: ['mi tienda favorita'] }
 *     ],
 *     weightOverrides: [
 *       { token: 'bar ', weight: 0.4 }   // user doesn't trust BAR- prefix
 *     ],
 *     tokenRemovals: ['bar ']   // remove a token globally
 *   });
 *
 * The orchestrator reads this on every categorisation, so changes take
 * effect immediately without a reload.
 *
 * Schema versioning: bump the localStorage key suffix (`.v1` → `.v2`) when
 * making breaking changes to the shape.
 */

import type { MerchantEntry } from './merchants';

const STORAGE_KEY = 'finances.autoCategorize.userDict.v1';
const VERSION = 1;

/**
 * Test seam: same pattern as `learnedRules.ts`. Defaults to the global
 * `localStorage` in the browser; injectable in tests via
 * `__setUserDictStorageForTesting`.
 */
let storage: Storage | null =
  typeof globalThis !== 'undefined' && 'localStorage' in globalThis
    ? (globalThis as { localStorage?: Storage }).localStorage ?? null
    : null;

/** Test-only: inject a custom storage backend. */
export function __setUserDictStorageForTesting(s: Storage | null): void {
  storage = s;
}

export interface UserDictionary {
  version: number;
  /** Brand-new tokens to add. Each entry behaves like a base entry. */
  additions: MerchantEntry[];
  /** Per-token weight overrides (lower = trust less, higher = trust more). */
  weightOverrides: Array<{ token: string; weight: number }>;
  /** Tokens to remove from the base dictionary. */
  tokenRemovals: string[];
}

const EMPTY: UserDictionary = {
  version: VERSION,
  additions: [],
  weightOverrides: [],
  tokenRemovals: [],
};

/**
 * Load the user dictionary from localStorage. Falls back to an empty dict
 * if localStorage is unavailable (SSR / Node tests) or the stored value
 * is malformed.
 */
function emptyDictionary(): UserDictionary {
  // IMPORTANT: create fresh arrays on every call. Sharing the EMPTY
  // constant's arrays would mean any caller that mutates the result
  // (e.g. `dict.additions.push(...)`) would also mutate EMPTY — and
  // the next `loadUserDictionary()` call would silently inherit those
  // mutations, even after `clearUserDictionary()` wiped localStorage.
  return {
    version: VERSION,
    additions: [],
    weightOverrides: [],
    tokenRemovals: [],
  };
}

export function loadUserDictionary(): UserDictionary {
  if (!storage) return emptyDictionary();
  const raw = storage.getItem(STORAGE_KEY);
  try {
    if (!raw) return emptyDictionary();
    const parsed = JSON.parse(raw) as Partial<UserDictionary>;
    if (parsed.version !== VERSION) {
      // Future: handle migration here.
      return emptyDictionary();
    }
    return {
      version: VERSION,
      additions: Array.isArray(parsed.additions) ? parsed.additions : [],
      weightOverrides: Array.isArray(parsed.weightOverrides)
        ? parsed.weightOverrides
        : [],
      tokenRemovals: Array.isArray(parsed.tokenRemovals) ? parsed.tokenRemovals : [],
    };
  } catch {
    return emptyDictionary();
  }
}

/**
 * Persist the user dictionary. Validates shape before writing.
 */
export function saveUserDictionary(dict: UserDictionary): void {
  if (!storage) return;
  try {
    const safe: UserDictionary = {
      version: VERSION,
      additions: dict.additions ?? [],
      weightOverrides: dict.weightOverrides ?? [],
      tokenRemovals: dict.tokenRemovals ?? [],
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // localStorage may be full or disabled — fail silently. The base dict
    // still works.
  }
}

/**
 * Add a new token mapping. If the token already exists, the new mapping
 * wins (overrides the base dict).
 */
export function addUserToken(
  categoryName: string,
  token: string,
  weight?: number,
): void {
  const dict = loadUserDictionary();
  const norm = token.toLowerCase().trim();
  if (!norm) return;
  // Remove any existing entry for this token first.
  dict.additions = dict.additions.filter(
    (e) => !e.tokens.some((t) => t.toLowerCase() === norm),
  );
  dict.additions.push({
    categoryName,
    tokens: [norm],
    weight,
    updatedAt: new Date().toISOString(),
  });
  // If the token exists in the base, override its weight too.
  if (typeof weight === 'number') {
    const existing = dict.weightOverrides.find(
      (w) => w.token.toLowerCase() === norm,
    );
    if (existing) existing.weight = weight;
    else dict.weightOverrides.push({ token: norm, weight });
  }
  saveUserDictionary(dict);
}

/**
 * Remove a token from any source (base + additions).
 */
export function removeUserToken(token: string): void {
  const dict = loadUserDictionary();
  const norm = token.toLowerCase().trim();
  if (!norm) return;
  dict.additions = dict.additions.filter(
    (e) => !e.tokens.some((t) => t.toLowerCase() === norm),
  );
  if (!dict.tokenRemovals.includes(norm)) dict.tokenRemovals.push(norm);
  saveUserDictionary(dict);
}

/** Wipe all user overrides. */
export function clearUserDictionary(): void {
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
}

/**
 * Apply user overrides to a token weight lookup.
 * Returns the override if present, otherwise `undefined` so the caller
 * can fall back to the default length-based formula.
 */
export function getUserWeightOverride(
  dict: UserDictionary,
  token: string,
): number | undefined {
  return dict.weightOverrides.find(
    (w) => w.token.toLowerCase() === token.toLowerCase(),
  )?.weight;
}

/**
 * Combine the base dictionary with user additions + removals.
 * Returns a flat list of `{ token, categoryName, weight, source }` pairs
 * sorted longest-token-first (the matcher requires this order).
 */
export interface CombinedToken {
  token: string;
  categoryName: string;
  /** Effective weight (user override or computed later). */
  weight: number | undefined;
  /** Where this token came from (debug / UI). */
  source: 'base' | 'user';
}

export function combineDictionary(
  base: readonly MerchantEntry[],
  user: UserDictionary,
): CombinedToken[] {
  const removals = new Set(user.tokenRemovals.map((t) => t.toLowerCase()));

  const baseTokens: CombinedToken[] = [];
  for (const entry of base) {
    for (const token of entry.tokens) {
      const norm = token.toLowerCase();
      if (removals.has(norm)) continue;
      baseTokens.push({
        token: norm,
        categoryName: entry.categoryName,
        weight: entry.weight,
        source: 'base',
      });
    }
  }

  const userTokens: CombinedToken[] = [];
  for (const entry of user.additions) {
    for (const token of entry.tokens) {
      const norm = token.toLowerCase();
      if (removals.has(norm)) continue;
      userTokens.push({
        token: norm,
        categoryName: entry.categoryName,
        weight: entry.weight,
        source: 'user',
      });
    }
  }

  // User additions win over base — drop any base entry that the user added.
  const userTokenNames = new Set(userTokens.map((t) => t.token));
  const filtered = baseTokens.filter((t) => !userTokenNames.has(t.token));

  return [...filtered, ...userTokens].sort(
    (a, b) => b.token.length - a.token.length,
  );
}