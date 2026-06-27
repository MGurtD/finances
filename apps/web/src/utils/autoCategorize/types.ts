/**
 * Shared types for the auto-categorisation pipeline.
 *
 * The pipeline emits a ranked list of category candidates with reasoning,
 * not just a single winner. The UI can show the top 3 with explanations
 * so the user understands *why* a category was picked (and corrects with
 * confidence when the system is wrong).
 */

/** A reason why a candidate category scored what it did. */
export interface CategoryReason {
  /** Which strategy emitted this reason (for debugging / UI badges). */
  strategy:
    | 'learned'
    | 'merchant-exact'
    | 'merchant-fuzzy'
    | 'token'
    | 'iban'
    | 'amount'
    | 'frequency'
    | 'income-keyword'
    | 'parent-fallback'
    | 'prefix';
  /** Score contribution in [0, 1]. */
  weight: number;
  /** Human-readable explanation (e.g. "matched 'Mercadona' merchant token"). */
  detail: string;
}

/** A ranked candidate category. */
export interface CategoryCandidate {
  id: string;
  name: string;
  parentId: string | null;
  /** Final aggregated score in [0, 1]. */
  score: number;
  /** Why this score. Sorted by weight desc. */
  reasons: CategoryReason[];
}

/** Confidence level, derived from the top candidate's score. */
export type Confidence = 'high' | 'medium' | 'low' | 'none';

/** Final categorisation result returned to the caller. */
export interface Categorisation {
  /** Winning category id, or null if no candidate cleared the threshold. */
  categoryId: string | null;
  /** Calibrated confidence. */
  confidence: Confidence;
  /** Winning category's score (0 if no candidate). */
  score: number;
  /** Top 3 candidates, ranked. Useful for the UI to show alternatives. */
  candidates: CategoryCandidate[];
  /** All reasons aggregated from the winning candidate (for debug / explain). */
  reasons: CategoryReason[];
}

/** Input context for the pipeline. */
export interface CategorisationContext {
  description: string;
  amountCents: number;
  kind: 'income' | 'expense' | 'transfer';
  categories: Array<{ id: string; name: string; parentId: string | null; kind?: 'income' | 'expense' | 'transfer'; archived?: boolean }>;
  /** Optional: list of IBANs the user has flagged as their own (internal accounts). */
  internalIbans?: string[];
  /** Optional: same description seen recently with timestamps. */
  recentSameDescription?: Array<{ date: string; categoryId: string }>;
}

/** Confidence thresholds. */
export const CONFIDENCE_THRESHOLDS = {
  /** ≥ this → 'high' (auto-accept on import without user review) */
  HIGH: 0.78,
  /** ≥ this → 'medium' (suggest, mark for review) */
  MEDIUM: 0.55,
  /** ≥ this → 'low' (suggest but mark as low confidence) */
  LOW: 0.32,
  /** below LOW → 'none' (don't suggest, let user pick) */
} as const;