/**
 * Auto-categorisation pipeline.
 *
 * Orchestrates the strategies in `strategies.ts`:
 *   1. Preprocess the description (extract IBANs, strip bank noise, tokenise)
 *   2. Run every strategy, collecting per-category scores
 *   3. Sum scores per candidate, normalise to [0, 1]
 *   4. Apply subcategory-resolution rules (IBAN → child if internal)
 *   5. Pick the top candidate and calibrate confidence
 *
 * Returns the winning category id plus the full candidate ranking so the
 * UI can show *why* the system picked what it picked.
 */

import type {
  Categorisation,
  CategorisationContext,
  CategoryCandidate,
  CategoryReason,
  Confidence,
} from './types';
import { CONFIDENCE_THRESHOLDS } from './types';
import { preprocess } from './preprocess';
import {
  amountStrategy,
  frequencyStrategy,
  fuzzyMerchantStrategy,
  ibanStrategy,
  incomeKeywordStrategy,
  merchantStrategy,
  prefixStrategy,
  tokenStrategy,
  type StrategyScore,
} from './strategies';
import { fallbackStrategy } from './fallback';
import { getLearnedRule } from './learnedRules';
import { isProfiling, markPipelineEnd, markPipelineStart, timeStrategy } from './profile';

interface Accumulator {
  /** Final aggregated score (sum of strategy contributions, capped at 1). */
  score: number;
  /** Reasons aggregated so far. */
  reasons: CategoryReason[];
  /** Display name (from first contributor). */
  categoryName: string;
  /** Parent id (if any). */
  parentId: string | null;
}

/**
 * Run the full pipeline and return the ranked candidates + winner.
 */
export function runPipeline(ctx: CategorisationContext): Categorisation {
  if (isProfiling()) markPipelineStart(ctx.description);
  // 1. Preprocess.
  const pre = preprocess(ctx.description);

  // 2. Run every strategy. Each one returns per-category scores.
  // NOTE: learnedStrategy is applied as a hard override AFTER aggregation
  // (see step 4.5) — not mixed into noisy-OR — so a single explicit user
  // correction can't be drowned by three weaker strategies.
  // Phase 6: each strategy call is timed when profiling is enabled.
  const all: StrategyScore[] = [
    ...timeStrategy('prefix', () => prefixStrategy(ctx, pre)),
    ...timeStrategy('merchant-exact', () => merchantStrategy(ctx, pre)),
    ...timeStrategy('merchant-fuzzy', () => fuzzyMerchantStrategy(ctx, pre)),
    ...timeStrategy('token', () => tokenStrategy(ctx, pre)),
    ...timeStrategy('iban', () => ibanStrategy(ctx, pre)),
    ...timeStrategy('amount', () => amountStrategy(ctx, pre)),
    ...timeStrategy('income-keyword', () => incomeKeywordStrategy(ctx, pre)),
    ...timeStrategy('frequency', () => frequencyStrategy(ctx, pre)),
    ...timeStrategy('fallback', () => fallbackStrategy(ctx, pre)),
  ];

  // 3. Aggregate by categoryId.
  const acc = new Map<string, Accumulator>();
  for (const s of all) {
    const cur = acc.get(s.categoryId) ?? {
      score: 0,
      reasons: [],
      categoryName: s.categoryName,
      parentId: s.parentId,
    };
    // Weighted-sum, capped at 1.0. Two strategies at 0.8 don't yield 1.6,
    // they yield ~0.96 (1 - (1-0.8)^2 = 0.96). This avoids runaway
    // accumulation and keeps the score interpretable.
    cur.score = 1 - (1 - cur.score) * (1 - s.weight);
    cur.reasons.push(s.reason);
    cur.categoryName = s.categoryName;
    cur.parentId = s.parentId;
    acc.set(s.categoryId, cur);
  }

  // 4. Convert to candidates, sort by score desc.
  const candidates: CategoryCandidate[] = Array.from(acc.entries())
    .map(([id, a]) => ({
      id,
      name: a.categoryName,
      parentId: a.parentId,
      score: round3(a.score),
      reasons: a.reasons.sort((x, y) => y.weight - x.weight),
    }))
    .sort((a, b) => b.score - a.score);

  // 4.5. Apply learned-rule override. A learned rule is the user's explicit
  // correction — it must ALWAYS win, even against a noisy-OR aggregation
  // of three other strategies. Without this, a strong merchant match
  // (REPSOL → Transport, score 0.99) drowns a learned rule for a specific
  // description (score 0.95). The user's intent is "remember this",
  // not "suggest this".
  const learned = getLearnedRule(ctx.description);
  if (learned) {
    const cat = ctx.categories.find((c) => c.id === learned.categoryId);
    if (cat && !cat.archived) {
      return {
        categoryId: cat.id,
        confidence: 'high',
        score: 0.99,
        candidates: [
          {
            id: cat.id,
            name: cat.name,
            parentId: cat.parentId,
            score: 0.99,
            reasons: [
              {
                strategy: 'learned',
                weight: 0.99,
                detail: 'Regla apresa — l\'usuari va triar aquesta categoria',
              },
            ],
          },
          ...candidates.slice(0, 2).map((c) => ({
            ...c,
            reasons: [
              ...c.reasons,
              {
                strategy: 'learned' as const,
                weight: 0.0,
                detail: '(superada per regla apresa)',
              },
            ],
          })),
        ],
        reasons: [
          {
            strategy: 'learned',
            weight: 0.99,
            detail: 'Regla apresa — l\'usuari va triar aquesta categoria',
          },
        ],
      };
    }
  }

  // 5. Pick the winner. If no candidate cleared the LOW threshold,
  // return none.
  const top = candidates[0];
  if (!top) {
    return {
      categoryId: null,
      confidence: 'none',
      score: 0,
      candidates: [],
      reasons: [],
    };
  }

  const confidence = scoreToConfidence(top.score);
  const finalId = confidence === 'none' ? null : top.id;

  if (isProfiling()) markPipelineEnd(ctx.description);
  return {
    categoryId: finalId,
    confidence,
    score: top.score,
    candidates: candidates.slice(0, 3),
    reasons: top.reasons,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function scoreToConfidence(score: number): Confidence {
  if (score >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  if (score >= CONFIDENCE_THRESHOLDS.LOW) return 'low';
  return 'none';
}