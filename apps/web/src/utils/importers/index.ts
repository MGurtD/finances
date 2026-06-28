import { parseCsv } from './genericCsv';
import { parseOfx } from './ofx';
import { tradeRepublicImporter } from './tradeRepublic';
import type { Importer, ImporterSuggestion, ParsedRow } from './types';

export { parseAmountCents, rowImportHash, parseCsv } from './genericCsv';
export { parseOfx } from './ofx';
export { confidenceLabel } from './confidence';
export { buildBulkPayload, type EditableRowLike } from './payload';
export type { Importer, ImporterSuggestion, ParsedRow } from './types';
export type { TransactionKind } from '@/api/types';

/** Score below which an importer is rejected as `primary`. */
export const primaryThreshold = 0.4;

/** Cap on alternatives surfaced to the UI. */
export const maxAlternatives = 3;

/**
 * Concrete generic CSV importer (entry in the registry). `detect` is
 * conservative: a CSV with at least one of the canonical header keys
 * (date/fecha/data, amount/importe) scores 0.5; otherwise 0. Trade
 * Republic always wins when its signals are present.
 */
export const genericCsvImporter: Importer = {
  id: 'generic-csv',
  label: 'CSV genèric',
  description: 'CaixaBank, BBVA, Sabadell, ABANCA i similars (CSV amb capçalera)',
  detect: (_filename: string, content: string): number => {
    const headerLine = content.split(/\r?\n/, 1)[0]?.toLowerCase() ?? '';
    if (!headerLine.trim()) return 0;
    const hasDate = /\b(date|fecha|data|fec)\b/.test(headerLine);
    const hasAmount = /\b(amount|importe|quantitat|valor)\b/.test(headerLine);
    const hasDebitCredit = /\b(debit|cargo|credit|abono)\b/.test(headerLine);
    if (hasDate && (hasAmount || hasDebitCredit)) return 0.5;
    return 0;
  },
  parse: async (content: string) => parseCsv(content),
};

/**
 * Concrete OFX/QFX importer. Detection: extension match OR magic header.
 */
export const ofxImporter: Importer = {
  id: 'ofx',
  label: 'OFX / QFX',
  description: 'Extractes bancaris en format OFX o QFX',
  detect: (filename: string, content: string): number => {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.ofx') || lower.endsWith('.qfx')) return 1;
    if (content.trimStart().startsWith('OFXHEADER')) return 1;
    return 0;
  },
  parse: async (content: string) => parseOfx(content),
};

/**
 * Registry of all known importers. Order matters: ties are broken by
 * registration order (first wins). Trade Republic is first because it
 * scores by filename/header combinations the generic CSV importer
 * can't reach.
 */
export const importers: Importer[] = [
  tradeRepublicImporter,
  genericCsvImporter,
  ofxImporter,
];

export type ImportFormat = 'csv' | 'ofx' | 'unknown';

/**
 * Legacy format detector — preserved for callers (and tests) that want
 * the simple 'csv' | 'ofx' | 'unknown' answer without picking an
 * importer. Mirrors the pre-registry semantics: extension first, OFX
 * magic header as fallback, default to 'csv'.
 */
export function detectFormat(filename: string, content: string): ImportFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.ofx') || lower.endsWith('.qfx')) return 'ofx';
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'csv';
  if (content.trimStart().startsWith('OFXHEADER')) return 'ofx';
  return 'csv';
}

/**
 * Score every importer against `filename` + `content`, return the
 * highest-scorer as `primary` (if >= primaryThreshold), and the rest
 * sorted descending, capped to maxAlternatives. When nothing scores
 * enough, `primary` is null and the UI shows a manual picker.
 */
export function suggestImporter(filename: string, content: string): ImporterSuggestion {
  const scored = importers.map((importer) => ({
    importer,
    confidence: clamp01(importer.detect(filename, content)),
  }));
  scored.sort((a, b) => b.confidence - a.confidence);
  const top = scored[0];
  if (!top || top.confidence < primaryThreshold) {
    return {
      primary: null,
      confidence: top?.confidence ?? 0,
      alternatives: scored.slice(0, maxAlternatives),
    };
  }
  return {
    primary: top.importer,
    confidence: top.confidence,
    alternatives: scored.slice(1, maxAlternatives + 1),
  };
}

/**
 * Look up an importer by id and run its parser. Throws if the id is
 * not registered — callers in the UI always pass an id they got from
 * `suggestImporter.alternatives` or the manual picker list, so the
 * error is treated as a programmer error rather than a runtime UX case.
 */
export async function parseWith(importerId: string, content: string): Promise<ParsedRow[]> {
  const importer = importers.find((i) => i.id === importerId);
  if (!importer) {
    throw new Error(`importer not registered: ${importerId}`);
  }
  return importer.parse(content);
}

/**
 * Detect format via the registry and run the chosen parser. Kept as a
 * thin shim so any external caller of `parseFile` keeps working without
 * picking an importer explicitly.
 */
export async function parseFile(filename: string, content: string): Promise<ParsedRow[]> {
  const suggestion = suggestImporter(filename, content);
  if (!suggestion.primary) return [];
  return suggestion.primary.parse(content);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
