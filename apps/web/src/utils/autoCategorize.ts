/**
 * Public API for auto-categorisation.
 *
 * Returns a `Categorisation` with the winning category id, calibrated
 * confidence, and a ranked list of candidates with reasons. The UI can
 * show "why" a category was picked and let the user confirm or override.
 *
 * Backwards compatible: the old `autoCategorizeId()` helper still works.
 */

import type { Categorisation, CategorisationContext } from './autoCategorize/types';
import type { Category, TransactionKind } from '@/api/types';
import { runPipeline } from './autoCategorize/pipeline';

/**
 * Run the full auto-categorisation pipeline.
 *
 * @param ctx  Description, amount, kind, available categories, optional
 *             IBAN list of the user's own accounts + recent history.
 */
export function autoCategorize(ctx: CategorisationContext): Categorisation {
  // Filter archived categories out of the candidate list — no point
  // matching them. The pipeline does this too, but doing it once here
  // keeps each strategy focused.
  const active = ctx.categories.filter((c) => !c.archived);
  return runPipeline({ ...ctx, categories: active });
}

/**
 * Backwards-compatible wrapper that returns just the category id.
 *
 * @deprecated Use `autoCategorize()` directly so you get confidence +
 *             candidates + reasons for the UI.
 */
export function autoCategorizeId(
  description: string,
  categories: Category[],
  kind?: TransactionKind,
  internalIbans?: string[],
): string | null {
  const result = autoCategorize({
    description,
    amountCents: 0,
    kind: kind ?? 'expense',
    categories,
    internalIbans,
  });
  return result.categoryId;
}

export { normalise } from './autoCategorize/preprocess';
export { preprocess } from './autoCategorize/preprocess';
export type {
  Categorisation,
  CategorisationContext,
  CategoryCandidate,
  CategoryReason,
  Confidence,
} from './autoCategorize/types';