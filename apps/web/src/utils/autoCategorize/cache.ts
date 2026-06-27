/**
 * Categorisation cache (Phase 5).
 *
 * Wraps `autoCategorize` with a per-call memoisation keyed by the
 * (description, amountCents, kind, internalIbans) tuple. Categories
 * passed in can change between calls, but the cache is keyed on the
 * description + amount so different category lists don't invalidate
 * previously computed scores.
 *
 * Why: a 100-row CSV import calls `autoCategorize` 100 times. Many
 * rows have identical descriptions (a subscription charged monthly).
 * Caching cuts repeated work to a hash lookup. The cache is in-memory
 * (Map) and lives for the page session.
 *
 * The cache is intentionally NOT persisted — categories change, the
 * dictionary evolves, and stale results would mislead the user.
 */

import { autoCategorize, type Categorisation } from '../autoCategorize';

interface CacheKey {
  desc: string;
  amount: number;
  kind: 'income' | 'expense' | 'transfer';
  ibansHash: number;
  catIdsHash: number;
}

const cache = new Map<string, Categorisation>();

/**
 * Compute a stable hash of an array of strings (used to invalidate the
 * cache when the category list or IBAN list changes). Uses djb2 — fast
 * and good-enough distribution for cache keying.
 */
function hashStrings(arr: readonly string[] | undefined): number {
  if (!arr || arr.length === 0) return 0;
  let hash = 5381;
  for (const s of arr) {
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
    }
    hash = ((hash << 5) + hash + 124) | 0; // separator
  }
  return hash;
}

function makeKey(k: CacheKey): string {
  return `${k.desc}|${k.amount}|${k.kind}|${k.ibansHash}|${k.catIdsHash}`;
}

/**
 * Cached auto-categorisation. Pass the same context that you'd pass to
 * `autoCategorize`. Returns the same `Categorisation` object (synchronous).
 */
export function autoCategorizeCached(
  ctx: Parameters<typeof autoCategorize>[0],
): Categorisation {
  const key = makeKey({
    desc: ctx.description.trim(),
    amount: ctx.amountCents,
    kind: ctx.kind,
    ibansHash: hashStrings(ctx.internalIbans),
    catIdsHash: hashStrings((ctx.categories ?? []).map((c: { id: string }) => c.id)),
  });
  const hit = cache.get(key);
  if (hit) return hit;
  const result = autoCategorize(ctx);
  cache.set(key, result);
  return result;
}

/** Wipe the cache. Called when the dictionary is mutated or for tests. */
export function clearCategorisationCache(): void {
  cache.clear();
}

/** Number of cached entries. Useful for diagnostics. */
export function categorisationCacheSize(): number {
  return cache.size;
}