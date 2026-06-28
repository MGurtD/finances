import type { TransactionKind } from '@/api/types';

/**
 * Canonical shape of a row emitted by an importer after parsing a bank/broker
 * export. `importHash` is optional — importers that have a stable per-row
 * identifier (e.g. Trade Republic's `transaction_id`) populate it so the
 * backend's SHA256 dedup can recognise re-imports.
 */
export interface ParsedRow {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  description: string;
  /** Signed integer cents. Negative = expense, positive = income. */
  amountCents: number;
  kind: TransactionKind;
  /** Stable per-row identifier (UUID or sha256 fingerprint). */
  importHash?: string;
}

/**
 * Detection/parse contract every importer implements. Detection returns a
 * 0..1 confidence score so the registry can rank alternatives; 0 means
 * "definitely not me". The registry uses >= primaryThreshold to pick a
 * `primary`; below it, `primary === null` and the user sees a manual picker.
 */
export interface Importer {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  detect(filename: string, content: string): number;
  parse(content: string): Promise<ParsedRow[]>;
}

/**
 * Result of `suggestImporter`. `primary` is null when no importer scored
 * >= the registry threshold; in that case the UI shows a manual picker.
 * `alternatives` are sorted desc by confidence and capped to `maxAlts` (3).
 */
export interface ImporterSuggestion {
  primary: Importer | null;
  confidence: number;
  alternatives: Array<{ importer: Importer; confidence: number }>;
}
