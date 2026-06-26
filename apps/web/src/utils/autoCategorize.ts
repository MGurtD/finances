import type { Category } from '@finances/contracts';
import { MERCHANT_DICTIONARY, MERCHANT_TOKENS_SORTED } from './autoCategorize/merchants.js';
import { STOPWORD_SET } from './autoCategorize/stopwords.js';
import { getLearnedRule, normaliseForRule } from './autoCategorize/learnedRules.js';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface Categorisation {
  /** Category id matched, or null when no heuristic produced a confident answer. */
  categoryId: string | null;
  /**
   * Confidence the user should assign to the match.
   *  - `high`:   learned rule or exact merchant dictionary hit
   *  - `medium`: token substring against the user's own category names
   *  - `low`:    description-keyword heuristic for income rows
   *  - `none`:   nothing matched
   */
  confidence: Confidence;
}

/**
 * Normalise a string for matching: lowercase, strip diacritics, collapse
 * whitespace. The same shape is used across all matcher layers so
 * capitalisation, accents and stray spaces never break a hit.
 */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip a string down to its word tokens, dropping stopwords + short noise. */
function tokenize(s: string): string[] {
  return s
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORD_SET.has(t));
}

// ─── Layer 1: learned rules ────────────────────────────────────────────
// Checked first because if the user has already categorised this exact
// description, we should never override them with a generic guess.
function matchLearned(description: string): Categorisation | null {
  const rule = getLearnedRule(description);
  if (!rule) return null;
  return { categoryId: rule.categoryId, confidence: 'high' };
}

// ─── Layer 2: merchant dictionary ─────────────────────────────────────
// Look for the most distinctive known merchant token in the description.
// Tokens are sorted longest-first so `starbucks` beats `bar ` when both
// appear (e.g. `STARBUCKS COFFEE BAR AEROPORT`).
function matchMerchant(
  normDesc: string,
  categories: Category[],
): Categorisation | null {
  for (const token of MERCHANT_TOKENS_SORTED) {
    if (!normDesc.includes(token)) continue;
    const targetCategoryName = MERCHANT_DICTIONARY[token];
    if (!targetCategoryName) continue;
    const match = categories.find(
      (c) => normalise(c.name) === normalise(targetCategoryName),
    );
    if (match) return { categoryId: match.id, confidence: 'high' };
    // The user has no matching category in their list — fall through to the
    // substring layer which can match against whatever category names they
    // do have.
  }
  return null;
}

// ─── Layer 3: token-based substring against the user's categories ──────
// For each token in the description (after stopword filtering), look for it
// inside a user's category name. Longest match wins. We use tokens rather
// than the raw substring so location suffixes and bank codes don't
// shadow the meaningful word.
function matchCategoryToken(
  description: string,
  categories: Category[],
): Categorisation | null {
  const tokens = tokenize(description);
  if (tokens.length === 0) return null;

  let best: { id: string; len: number } | null = null;
  for (const c of categories) {
    if (c.archived) continue;
    const catNorm = normalise(c.name);
    if (catNorm.length < 3) continue;
    if (tokens.some((t) => catNorm.includes(t))) {
      if (!best || catNorm.length > best.len) {
        best = { id: c.id, len: catNorm.length };
      }
    }
  }
  return best ? { categoryId: best.id, confidence: 'medium' } : null;
}

// ─── Layer 4: income-keyword heuristic ────────────────────────────────
// Only meaningful for income rows. Falls back to null for expenses — the
// absence of an income keyword doesn't tell us anything useful about a
// supermarket purchase.
const INCOME_KEYWORDS: readonly RegExp[] = [
  /\bn[oó]mina\b/i,
  /\bsou\b/i,
  /\btransfer(encia|\.)\s+rebuda/i,
  /\btransf(erencia|\.)\s+recibida/i,
  /\babono\b/i,
  /\bdevoluci(o|ó)n\b/i,
  /\breembolso\b/i,
  /\bintereses?\b/i,
  /\bdiv(idendos?|idend)\b/i,
  /\bprestaci(o|ó)n\b/i,
  /\bhiru(renda|ndi)?\b/i,
];

function matchIncomeKeyword(
  description: string,
  incomeCategoryId: string | null,
): Categorisation | null {
  if (!incomeCategoryId) return null;
  if (!INCOME_KEYWORDS.some((re) => re.test(description))) return null;
  return { categoryId: incomeCategoryId, confidence: 'low' };
}

/**
 * Run all four layers in order; first non-null wins.
 *
 * @param description  Raw bank description (e.g. `CHARTER EDUARD TOLDRA ESPLUGUES DE 34610`).
 * @param categories   The user's current category list (archived ones are skipped).
 * @param kind         Optional transaction kind — when provided, enables the
 *                     income-keyword layer for `income` rows.
 */
export function autoCategorize(
  description: string,
  categories: Category[],
  kind?: 'income' | 'expense' | 'transfer',
): Categorisation {
  const trimmed = description.trim();
  if (!trimmed) return { categoryId: null, confidence: 'none' };

  // Layer 1 — learned rules (highest priority)
  const learned = matchLearned(trimmed);
  if (learned && learned.categoryId) {
    // Verify the category still exists in the user's list (otherwise stale rule).
    const stillExists = categories.some((c) => c.id === learned.categoryId);
    if (stillExists) return learned;
    // Stale rule — fall through to fresh matching.
  }

  const normDesc = normalise(trimmed);

  // Layer 2 — merchant dictionary
  const merchant = matchMerchant(normDesc, categories);
  if (merchant) return merchant;

  // Layer 3 — user-category token match
  const catToken = matchCategoryToken(trimmed, categories);
  if (catToken) return catToken;

  // Layer 4 — income keyword (only when kind === 'income')
  if (kind === 'income') {
    const incomeCat = categories.find(
      (c) => !c.archived && normalise(c.name).includes('nomina'),
    );
    const kw = matchIncomeKeyword(trimmed, incomeCat?.id ?? null);
    if (kw) return kw;
  }

  return { categoryId: null, confidence: 'none' };
}

/**
 * Backwards-compatible wrapper — returns just the categoryId, or null.
 * Use this in places that haven't been updated to consume the confidence
 * field yet.
 */
export function autoCategorizeId(
  description: string,
  categories: Category[],
  kind?: 'income' | 'expense' | 'transfer',
): string | null {
  return autoCategorize(description, categories, kind).categoryId;
}

/** Re-export for test convenience. */
export { normaliseForRule };