/**
 * Individual scoring strategies.
 *
 * Each strategy takes the preprocessed description + context and returns
 * a list of candidate scores: `{ categoryId, parentId, weight, reason }`.
 * The orchestrator aggregates them per category and picks the winner.
 */

import type {
  CategoryCandidate,
  CategoryReason,
  CategorisationContext,
} from './types';
import { preprocess, type ProcessedDescription } from './preprocess';
import { MERCHANT_TOKENS_SORTED } from './merchants';
import { getMerchantTokensSorted } from './dictionary.aggregate';
import { getLearnedRule } from './learnedRules';
import {
  getUserWeightOverride,
  loadUserDictionary,
} from './dictionary.user';
import { PREFIX_RULES } from './prefixes';
import { normaliseText } from './normalize';
import { tokenise } from './normalize';

/**
 * Score contribution from a single strategy. Returned for one candidate
 * category. The orchestrator sums these across strategies.
 */
export interface StrategyScore {
  categoryId: string;
  categoryName: string;
  parentId: string | null;
  weight: number;
  reason: CategoryReason;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Strategy 1: Learned rules (user's past corrections)
 * Highest priority — if the user has categorised this exact description
 * before, we always honour it. Recorded on every explicit user change.
 * ──────────────────────────────────────────────────────────────────────── */
export function learnedStrategy(
  ctx: CategorisationContext,
  pre: ProcessedDescription,
): StrategyScore[] {
  void pre;
  const rule = getLearnedRule(ctx.description);
  if (!rule) return [];

  // Verify the rule's category still exists in the user's current list.
  const cat = ctx.categories.find((c) => c.id === rule.categoryId);
  if (!cat || cat.archived) return [];

  return [
    {
      categoryId: cat.id,
      categoryName: cat.name,
      parentId: cat.parentId ?? null,
      weight: 0.99,
      reason: {
        strategy: 'learned',
        weight: 0.99,
        detail: `Coincideix amb una regla apresa prèviament (${new Date(rule.learnedAt).toLocaleDateString()})`,
      },
    },
  ];
}

/* ──────────────────────────────────────────────────────────────────────────
 * Strategy 2: Exact merchant dictionary match
 * Substring match against normalised tokens, longest token first. Strong
 * signal — but we don't give it 1.0 because the user might still want
 * to override (e.g. a "Mercadona" purchase that's actually a gift).
 *
 * Phase 3: tokens come from `MERCHANT_TOKENS_SORTED` (base + user
 * overrides merged). Per-entry `weight` overrides the default
 * length-based formula. Per-user weight overrides (`dictionary.user.ts`)
 * take precedence over both.
 * ──────────────────────────────────────────────────────────────────────── */
export function merchantStrategy(
  ctx: CategorisationContext,
  pre: ProcessedDescription,
): StrategyScore[] {
  void ctx;
  const results: StrategyScore[] = [];
  const normalisedTokens = pre.tokens;
  const userDict = loadUserDictionary();

  // Phase 3: use the lazy augmented list so user additions/removals are
  // picked up. Falls back to the base-only list on lookup failure.
  let tokens: ReadonlyArray<{
    token: string;
    entry: import('./merchants').MerchantEntry;
    weight: number | undefined;
  }>;
  try {
    tokens = getMerchantTokensSorted();
  } catch {
    tokens = MERCHANT_TOKENS_SORTED.map((t) => ({
      token: t.token,
      entry: t.entry,
      weight: t.entry.weight,
    }));
  }

  for (const { token, entry, weight: entryWeight } of tokens) {
    // Token must appear as a full word in the normalised token list
    // (substring match — so "mercadona centro" still hits "mercadona").
    if (!normalisedTokens.includes(token)) continue;

    // Find the category. Skip if user archived it.
    const cat = ctx.categories.find(
      (c) => c.name === entry.categoryName && !c.archived,
    );
    if (!cat) continue;

    // Weight resolution (in priority order):
    //   1. Per-token user override (`dictionary.user.ts`)
    //   2. Per-entry explicit weight (`merchants.ts`)
    //   3. Default length-based formula with short-token penalty
    const userOverride = getUserWeightOverride(userDict, token);
    let weight: number;
    if (typeof userOverride === 'number') {
      weight = userOverride;
    } else if (typeof entryWeight === 'number') {
      weight = entryWeight;
    } else {
      const lengthBonus = Math.min(1, token.length / 8);
      const lengthPenalty = token.length < 4 ? 0.3 : 1.0;
      weight = (0.55 + 0.37 * lengthBonus) * lengthPenalty;
    }

    results.push({
      categoryId: cat.id,
      categoryName: cat.name,
      parentId: cat.parentId ?? null,
      weight,
      reason: {
        strategy: 'merchant-exact',
        weight,
        detail: `Comerç conegut: "${token}" → ${entry.categoryName}`,
      },
    });

    // One match per token — but multiple tokens for the same category
    // accumulate via the orchestrator's sum.
  }

  return results;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Strategy 3: Fuzzy merchant match
 * For typos like "MERCADONA ESPLUGES" (missing letters). We use a simple
 * Levenshtein-ish similarity on tokens vs the merchant dictionary.
 * ──────────────────────────────────────────────────────────────────────── */
export function fuzzyMerchantStrategy(
  ctx: CategorisationContext,
  pre: ProcessedDescription,
): StrategyScore[] {
  const results: StrategyScore[] = [];

  let candidates: ReadonlyArray<{ token: string; entry: import('./merchants').MerchantEntry }>;
  try {
    candidates = getMerchantTokensSorted();
  } catch {
    candidates = MERCHANT_TOKENS_SORTED;
  }

  for (const token of pre.tokens) {
    if (token.length < 5) continue; // too short to fuzzy-match reliably

    let best: { token: string; entry: typeof MERCHANT_TOKENS_SORTED[number]['entry']; similarity: number } | null = null;

    for (const candidate of candidates) {
      const sim = tokenSimilarity(token, candidate.token);
      if (sim < 0.78) continue; // too far
      if (!best || sim > best.similarity) {
        best = { token: candidate.token, entry: candidate.entry, similarity: sim };
      }
    }

    if (!best) continue;

    const cat = ctx.categories.find(
      (c) => c.name === best.entry.categoryName && !c.archived,
    );
    if (!cat) continue;

    // Weight is high but not as high as exact match.
    const weight = 0.45 + 0.3 * best.similarity;

    results.push({
      categoryId: cat.id,
      categoryName: cat.name,
      parentId: cat.parentId ?? null,
      weight,
      reason: {
        strategy: 'merchant-fuzzy',
        weight,
        detail: `Coincidència aproximada: "${token}" ≈ "${best.token}" (${Math.round(best.similarity * 100)}%)`,
      },
    });
  }

  return results;
}

/**
 * Token similarity using the normalised Levenshtein ratio. Returns 0-1.
 * Cheap (O(a*b)) but fine for our token lengths (usually <20 chars).
 */
function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const al = a.length;
  const bl = b.length;
  if (al === 0 || bl === 0) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(al, bl);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev: number[] = new Array(n + 1);
  const curr: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1,
        curr[j - 1]! + 1,
        prev[j - 1]! + cost,
      );
    }
    for (let j2 = 0; j2 <= n; j2++) prev[j2] = curr[j2]!;
  }
  return prev[n]!;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Strategy 4: Token vs user-category overlap
 * Looks at how many of the description's meaningful tokens appear in
 * each user category's name. Stronger when multiple tokens match
 * (suggests a real category relationship, not noise).
 * ──────────────────────────────────────────────────────────────────────── */
export function tokenStrategy(
  ctx: CategorisationContext,
  pre: ProcessedDescription,
): StrategyScore[] {
  const results: StrategyScore[] = [];
  const descTokens = new Set(pre.tokens);
  if (descTokens.size === 0) return [];

  for (const cat of ctx.categories) {
    if (cat.archived) continue;
    // Tokenise the category name the same way as descriptions.
    const catTokens = new Set(tokenise(cat.name));
    if (catTokens.size === 0) continue;

    // Intersection size.
    let matches = 0;
    for (const t of descTokens) {
      if (catTokens.has(t)) matches += 1;
    }
    if (matches === 0) continue;

    // Confidence = matches / max(descTokens, catTokens).
    // This favours categories where many of the user's tokens appear,
    // not just one accidental match.
    const score = matches / Math.max(descTokens.size, catTokens.size);

    // Minimum threshold: single-token matches in long descriptions are
    // usually noise. Need at least 2 matches OR a 0.6+ ratio.
    if (matches < 2 && score < 0.6) continue;

    const weight = 0.3 + 0.45 * Math.min(1, score);

    results.push({
      categoryId: cat.id,
      categoryName: cat.name,
      parentId: cat.parentId ?? null,
      weight,
      reason: {
        strategy: 'token',
        weight,
        detail: `${matches} token(s) en comú amb "${cat.name}"`,
      },
    });
  }

  return results;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Strategy 5: IBAN detection — for transfers between user's own accounts
 * If the description contains an IBAN that the user has flagged as
 * "internal", we route to the "Entre comptes propis" subcategory under
 * "Transferències internes".
 * ──────────────────────────────────────────────────────────────────────── */
export function ibanStrategy(
  ctx: CategorisationContext,
  pre: ProcessedDescription,
): StrategyScore[] {
  if (pre.ibans.length === 0 || !ctx.internalIbans || ctx.internalIbans.length === 0) {
    return [];
  }

  // Normalise both sides so comparison is whitespace- and case-insensitive.
  const internalSet = new Set(ctx.internalIbans.map((s) => s.replace(/\s+/g, '').toUpperCase()));
  const matchedIbans = pre.ibans.filter((iban) => internalSet.has(iban));
  if (matchedIbans.length === 0) return [];

  const results: StrategyScore[] = [];

  // Subcategory: "Entre comptes propis" (parent: Transferències internes)
  const subCat = ctx.categories.find(
    (c) => c.name === 'Entre comptes propis' && !c.archived,
  );
  if (subCat) {
    results.push({
      categoryId: subCat.id,
      categoryName: subCat.name,
      parentId: subCat.parentId ?? null,
      weight: 0.95,
      reason: {
        strategy: 'iban',
        weight: 0.95,
        detail: `IBAN propi detectat: ${matchedIbans[0]} (transferència entre comptes propis)`,
      },
    });
  }

  // Parent fallback: "Transferències internes" if subcategory not found
  const parentCat = ctx.categories.find(
    (c) => c.name === 'Transferències internes' && !c.archived,
  );
  if (parentCat && !subCat) {
    results.push({
      categoryId: parentCat.id,
      categoryName: parentCat.name,
      parentId: parentCat.parentId ?? null,
      weight: 0.85,
      reason: {
        strategy: 'iban',
        weight: 0.85,
        detail: `Transferència detectada (IBAN: ${matchedIbans[0]}) — categoritza sota "Transferències internes"`,
      },
    });
  }

  return results;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Strategy 6: Amount range heuristics
 * Some categories have typical amount bands. Large recurring amounts
 * (>500€) suggest "Habitatge" (rent/mortgage). Regular small fixed
 * amounts suggest "Subscripcions" if the description is non-merchant.
 * ──────────────────────────────────────────────────────────────────────── */
export function amountStrategy(
  ctx: CategorisationContext,
  pre: ProcessedDescription,
): StrategyScore[] {
  void pre;
  const cents = Math.abs(ctx.amountCents);
  const euros = cents / 100;
  const results: StrategyScore[] = [];

  // Big-ticket recurring → Habitatge (rent, mortgage, community fees).
  if (euros >= 400 && ctx.kind === 'expense' && /hipoteca|lloguer|alquiler|comunitat|comunidad/i.test(normaliseText(ctx.description))) {
    const cat = ctx.categories.find((c) => c.name === 'Habitatge' && !c.archived);
    if (cat) {
      results.push({
        categoryId: cat.id,
        categoryName: cat.name,
        parentId: cat.parentId ?? null,
        weight: 0.6,
        reason: {
          strategy: 'amount',
          weight: 0.6,
          detail: `Import elevat (${euros.toFixed(2)}€) amb terme de lloguer/hipoteca detectat`,
        },
      });
    }
  }

  return results;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Strategy 7: Income keyword detection
 * Only meaningful for `income` rows — payroll, transfer received, refund…
 * Routes to one of: Nòmina, Negoci / freelance, Inversions, Devolucions
 * depending on the keyword.
 * ──────────────────────────────────────────────────────────────────────── */
export function incomeKeywordStrategy(
  ctx: CategorisationContext,
  pre: ProcessedDescription,
): StrategyScore[] {
  if (ctx.kind !== 'income') return [];

  const norm = pre.normalised;
  const results: StrategyScore[] = [];

  // Order matters: more specific first.
  const rules: Array<{ keywords: RegExp[]; categoryName: string; weight: number; detail: string }> = [
    {
      keywords: [/\bn[oó]mina\b/i, /\bsou\b/i, /\bn[oó]mina mensual\b/i, /\bsalari\b/i, /\bpayroll\b/i],
      categoryName: 'Nòmina',
      weight: 0.95,
      detail: 'Paraula clau de nòmina/salari detectada',
    },
    {
      keywords: [/\bfactura emesa\b/i, /\bfacturacio\b/i, /\bfreelance\b/i, /\baut[oó]nom[eo]?\b/i],
      categoryName: 'Negoci / freelance',
      weight: 0.9,
      detail: 'Paraula clau d\'autònom/freelance detectada',
    },
    {
      keywords: [/\bdividend/i, /\binteress/i, /\bfons\b/i, /\binversio/i, /\bcompra accions\b/i],
      categoryName: 'Inversions',
      weight: 0.92,
      detail: 'Paraula clau d\'inversió/dividends detectada',
    },
    {
      keywords: [/\bdevolucio\b/i, /\bdevolucion\b/i, /\breembolso\b/i, /\bretorn\b/i],
      categoryName: 'Devolucions',
      weight: 0.93,
      detail: 'Paraula clau de devolució/reemborsament detectada',
    },
    // Generic income fallback if no specific keyword matches.
    {
      keywords: [/\babono\b/i, /\btransfer.*rebuda/i, /\btransfer.*recibida/i],
      categoryName: 'Nòmina',
      weight: 0.5,
      detail: 'Abonament genèric — suggeriment per defecte',
    },
  ];

  for (const rule of rules) {
    if (!rule.keywords.some((re) => re.test(norm))) continue;
    const cat = ctx.categories.find((c) => c.name === rule.categoryName && !c.archived);
    if (!cat) continue;
    results.push({
      categoryId: cat.id,
      categoryName: cat.name,
      parentId: cat.parentId ?? null,
      weight: rule.weight,
      reason: {
        strategy: 'income-keyword',
        weight: rule.weight,
        detail: rule.detail,
      },
    });
    // Stop at first match — don't suggest multiple income categories.
    break;
  }

  return results;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Strategy 8: Frequency-based
 * If the same description has been seen N+ times recently with the same
 * category, it's likely a recurring subscription → "Subscripcions".
 * Requires the caller to pass `recentSameDescription` in context.
 * ──────────────────────────────────────────────────────────────────────── */
export function frequencyStrategy(
  ctx: CategorisationContext,
  pre: ProcessedDescription,
): StrategyScore[] {
  void pre;
  if (!ctx.recentSameDescription || ctx.recentSameDescription.length < 2) return [];

  // Aggregate by categoryId. If 4+ of the recents for this description
  // went to the same category, suggest it as recurring.
  // Threshold raised from 3→4 per cat Req 4: 5 entries split 3-to-2
  // must emit no score (spec), and 4+ matches is a stronger dominance
  // signal than the previous 3+ threshold.
  const tally: Record<string, number> = {};
  for (const r of ctx.recentSameDescription) {
    tally[r.categoryId] = (tally[r.categoryId] ?? 0) + 1;
  }

  const results: StrategyScore[] = [];
  for (const [categoryId, count] of Object.entries(tally)) {
    if (count < 4) continue;
    const cat = ctx.categories.find((c) => c.id === categoryId && !c.archived);
    if (!cat) continue;
    // High confidence: the user has consistently categorised this as X.
    // If it's not already "Subscripcions", suggest upgrading there too
    // (recurring ≠ subscription, but it's a strong hint).
    results.push({
      categoryId: cat.id,
      categoryName: cat.name,
      parentId: cat.parentId ?? null,
      weight: 0.5 + Math.min(0.3, count * 0.05),
      reason: {
        strategy: 'frequency',
        weight: 0.5 + Math.min(0.3, count * 0.05),
        detail: `Mateixa descripció ${count} vegades amb la mateixa categoria — possible recurrència`,
      },
    });
  }

  return results;
}

/**
 * Prefix strategy.
 *
 * Bank descriptions often start with a predictable token that strongly
 * indicates the category — much more reliably than fuzzy merchant matching.
 * Examples:
 *   "BAR CANARIAS ..."      → Restaurants i oci
 *   "SUPERMERCAT ALIM..."   → Alimentació
 *   "FARMACIA JENE ..."     → Salut
 *
 * This strategy fires AFTER the merchant strategy but BEFORE the IBAN
 * strategy in the pipeline. The reason: a long brand-name match in the
 * merchant dict (e.g. "AUDREY BOUTIQUE" → Compres) might be wrong if the
 * description is actually a café that has been renamed. The prefix rules
 * capture what we KNOW: "BAR-anything" is a bar.
 *
 * Confidence weights are calibrated so that a high-weight prefix rule
 * (~0.85) clears the HIGH threshold on its own, but loses to a very
 * strong learned rule (0.95+).
 */
export function prefixStrategy(
  ctx: CategorisationContext,
  pre: ProcessedDescription,
): StrategyScore[] {
  const results: StrategyScore[] = [];
  const normalised = pre.normalised;

  for (const rule of PREFIX_RULES) {
    let regex: RegExp;
    try {
      regex = new RegExp(rule.pattern, 'i');
    } catch {
      // Skip malformed patterns; better than crashing the whole pipeline.
      continue;
    }
    if (!regex.test(normalised)) continue;

    // Find the category by name (categories may be added by the user,
    // so we match by name not id).
    const cat = ctx.categories.find(
      (c) => c.name === rule.categoryName && c.kind === ctx.kind,
    );
    if (!cat) continue;

    results.push({
      categoryId: cat.id,
      categoryName: cat.name,
      parentId: cat.parentId,
      weight: rule.weight,
      reason: {
        strategy: 'prefix',
        weight: rule.weight,
        detail: rule.detail,
      },
    });
    // Don't break: multiple prefix rules could match and we want them all.
    // But in practice one description matches at most one rule family.
  }

  return results;
}