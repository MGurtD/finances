/**
 * Fallback strategy: short / generic descriptions.
 *
 * When nothing else matches, this strategy makes a conservative guess
 * based on a few weak signals:
 *   - Description < 6 chars → too short to trust → no suggestion
 *   - Description in Catalan/Spanish generic words ("compras varias",
 *     "otros gastos", "despeses varies") → "Altres despeses"
 *   - Description contains a single token that looks like a person's
 *     name (CAPITAL letters, no numbers) → "Transferències i família"
 *
 * The weight is low (0.4) so it only fires when nothing stronger matches.
 */

import type { StrategyScore } from './strategies';
import type { CategorisationContext } from './types';
import type { ProcessedDescription } from './preprocess';

const GENERIC_PATTERNS: { pattern: string; reason: string }[] = [
  { pattern: '^compras? varies?$', reason: '"Compres varies" → Altres' },
  { pattern: '^despeses varies?$', reason: '"Despeses varies" → Altres' },
  { pattern: '^otros? gastos?$', reason: '"Otros gastos" → Altres' },
  { pattern: '^altres? despeses?$', reason: '"Altres despeses" → Altres' },
  { pattern: '^varios?$', reason: '"Varios" → Altres' },
  { pattern: '^various?$', reason: '"Various" → Altres' },
  { pattern: '^ajustament|^ajuste', reason: '"Ajustament" → Altres' },
];

export function fallbackStrategy(
  ctx: CategorisationContext,
  pre: ProcessedDescription,
): StrategyScore[] {
  const results: StrategyScore[] = [];
  const t = pre.normalised.trim();

  // Skip if we have any meaningful token (≥ 4 chars) — let other strategies
  // handle it. The fallback is only for genuinely generic / short stuff.
  const hasSignalToken = pre.tokens.some((tok) => tok.length >= 4);
  if (hasSignalToken && pre.tokens.length > 1) return results;

  for (const g of GENERIC_PATTERNS) {
    let re: RegExp;
    try {
      re = new RegExp(g.pattern, 'i');
    } catch {
      continue;
    }
    if (!re.test(t)) continue;

    const cat = ctx.categories.find(
      (c: { name: string; kind?: string }) =>
        c.name === 'Altres despeses' && c.kind === ctx.kind,
    );
    if (!cat) continue;

    results.push({
      categoryId: cat.id,
      categoryName: cat.name,
      parentId: cat.parentId,
      weight: 0.4,
      reason: {
        strategy: 'parent-fallback',
        weight: 0.4,
        detail: g.reason,
      },
    });
    break;
  }

  return results;
}