/**
 * Learned categorisation rules — keyed by normalised description.
 *
 * When the user changes the category in the import preview, or re-categorises
 * a transaction from the Moviments view, we record `(description, categoryId)`
 * here. The next time the same description comes through the importer, the
 * learned rule fires before any other heuristic.
 *
 * Storage: localStorage under a versioned key. We persist a `{ description,
 * categoryId, learnedAt }` tuple per row, indexed by the normalised
 * description string so lookups are O(1).
 *
 * Versioning: bumping `STORAGE_KEY_VERSION` invalidates old rules. We do
 * this on schema-breaking changes (e.g. switching from category name to
 * categoryId as the value). Migrations between versions should be added
 * here, not by reading the old key.
 */

const STORAGE_KEY_VERSION = 1;
export const STORAGE_KEY = `finances.autoCategorize.v${STORAGE_KEY_VERSION}`;

export interface LearnedRule {
  /** Normalised description — the same shape produced by `normalise()`. */
  description: string;
  categoryId: string;
  /** ISO timestamp of when the rule was recorded. */
  learnedAt: string;
}

/**
 * Test seam: replaceable in tests so we don't need a real localStorage.
 * Defaults to `globalThis.localStorage` which is `undefined` in Node and
 * the browser's LS in the browser.
 */
let storage: Storage | null =
  typeof globalThis !== 'undefined' && 'localStorage' in globalThis
    ? (globalThis as { localStorage?: Storage }).localStorage ?? null
    : null;

/** Test-only: inject a custom storage backend (e.g. an in-memory map). */
export function __setStorageForTesting(s: Storage | null): void {
  storage = s;
}

function readAll(): Record<string, LearnedRule> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, LearnedRule>;
  } catch {
    // Corrupt JSON — wipe so we don't keep failing on every lookup.
    storage.removeItem(STORAGE_KEY);
    return {};
  }
}

function writeAll(rules: Record<string, LearnedRule>): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Storage full or unavailable — silently degrade. The matcher will
    // simply skip the learned-rule layer.
  }
}

/**
 * Normalise a description to the form used as the rule key. We strip
 * trailing whitespace, fold case, remove diacritics and collapse runs
 * of whitespace so `GoOGLE*YOUTUBE   IRELAND` and `google youtube ireland`
 * hit the same bucket.
 */
export function normaliseForRule(description: string): string {
  return description
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Look up a learned rule for a given description. Returns null if none. */
export function getLearnedRule(description: string): LearnedRule | null {
  const key = normaliseForRule(description);
  if (!key) return null;
  const rules = readAll();
  return rules[key] ?? null;
}

/**
 * Record or replace the category for a description. Called when the
 * user explicitly changes a category in the import preview or the
 * Moviments view.
 */
export function recordLearnedRule(description: string, categoryId: string): void {
  const key = normaliseForRule(description);
  if (!key) return;
  const rules = readAll();
  rules[key] = {
    description: key,
    categoryId,
    learnedAt: new Date().toISOString(),
  };
  writeAll(rules);
}

/** Delete a single learned rule (e.g. user asks to forget a wrong rule). */
export function forgetLearnedRule(description: string): void {
  const key = normaliseForRule(description);
  if (!key) return;
  const rules = readAll();
  delete rules[key];
  writeAll(rules);
}

/** Wipe all learned rules. Used by the upcoming settings view + tests. */
export function clearAllLearnedRules(): void {
  writeAll({});
}

/** Total number of learned rules currently stored. */
export function countLearnedRules(): number {
  return Object.keys(readAll()).length;
}