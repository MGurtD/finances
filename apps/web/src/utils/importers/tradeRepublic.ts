import type { Importer } from './types';

/**
 * Trade Republic CSV importer (stub — real implementation lands in T-8).
 *
 * Detection: filename matches the Trade Republic export pattern OR the
 * header carries the broker-specific columns (`transaction_id` +
 * `counterparty_iban`). Scoring is documented in design.md.
 *
 * Parse: deferred — T-8 fills this in. The stub returns [] so the
 * registry test can verify ordering without a real TR fixture yet.
 */
export const tradeRepublicImporter: Importer = {
  id: 'trade-republic',
  label: 'Trade Republic',
  description: 'Exportación de transacciones de Trade Republic',
  detect: (_filename: string, content: string): number => {
    let score = 0;
    if (/(^|[^a-z])traderepublic([^a-z]|$)|(^|[^a-z])tr_/i.test(_filename)) {
      score += 0.45;
    }
    const headerLine = content.split(/\r?\n/, 1)[0] ?? '';
    const has = (name: string) => headerLine.toLowerCase().includes(name);
    if (has('transaction_id') && has('counterparty_iban')) {
      score += 0.45;
    }
    if (has('asset_class')) {
      score += 0.30;
    }
    return Math.min(score, 1);
  },
  parse: async (_content: string) => {
    // Real parser lands in T-8.
    return [];
  },
};
