import Papa from 'papaparse';
import type { TransactionKind } from '@/api/types';
import type { Importer, ParsedRow } from './types';
import { parseAmountCents } from './genericCsv';

/**
 * Trade Republic CSV → ParsedRow[].
 *
 * The TR export is 23 columns wide and uses 6-decimal EUR amounts for
 * `amount` (e.g. "474.530000"). Integer cents are produced via
 * `parseAmountCents` → `Math.round(n * 100)` so 474.530000 → 47453c.
 *
 * Sub-cent precision is INTENTIONALLY DROPPED here. Trades whose price
 * * shares falls below €0.01 cannot be represented in integer cents;
 * the user's accounts have trade sizes well above that floor so the
 * loss is acceptable for MVP. Tracked as a follow-up issue (not
 * blocking this PR).
 */

const TYPE_TO_KIND: Record<string, TransactionKind> = {
  INTEREST_PAYMENT: 'income',
  CUSTOMER_INBOUND: 'income',
  TRANSFER_INSTANT_INBOUND: 'transfer',
  TRANSFER_INBOUND: 'transfer',
  TRANSFER_INSTANT_OUTBOUND: 'transfer',
  TRANSFER_OUTBOUND: 'transfer',
  CARD_TRANSACTION: 'expense',
  // BUY (TRADING) → expense for MVP. Trading-as-investment kind split
  // is a future concern.
  BUY: 'expense',
};

function buildDescription(
  counterpartyName: string | undefined,
  description: string | undefined,
): string {
  const cp = (counterpartyName ?? '').trim();
  const note = (description ?? '').trim();
  if (cp && note) return `${cp} — ${note}`;
  return cp || note || '';
}

export function parseCsv(text: string): ParsedRow[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const fields = result.meta.fields ?? [];
  // Trade Republic detection requires transaction_id — if it's not
  // present we refuse to parse (the user is probably looking at the
  // wrong file).
  if (!fields.includes('transaction_id')) return [];

  const rows = result.data;

  const out: ParsedRow[] = [];
  for (const row of rows) {
    const transactionId = (row.transaction_id ?? '').trim();
    if (!transactionId) continue; // skip blank rows (e.g. trailing blank line)

    const date = (row.date ?? '').trim();
    if (!date) continue;

    const cents = parseAmountCents(row.amount ?? '');
    if (cents === 0) continue;

    const trType = (row.type ?? '').trim();
    const kind: TransactionKind = TYPE_TO_KIND[trType] ?? 'expense';

    const description = buildDescription(row.counterparty_name, row.description);

    out.push({
      date,
      description,
      amountCents: cents,
      kind,
      importHash: transactionId,
    });
  }
  return out;
}

/**
 * Trade Republic importer (registered in `./index.ts`). Detection:
 * filename matches the export pattern OR the header carries both
 * `transaction_id` and `counterparty_iban` columns; `asset_class` is a
 * corroborating signal. Capped at 1.0 so two-file boosters can't push
 * the score above 100%.
 */
export const tradeRepublicImporter: Importer = {
  id: 'trade-republic',
  label: 'Trade Republic',
  description: 'Exportación de transacciones de Trade Republic',
  detect: (filename: string, content: string): number => {
    let score = 0;
    if (/(^|[^a-z])traderepublic([^a-z]|$)|(^|[^a-z])tr_/i.test(filename)) {
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
  parse: async (content: string) => parseCsv(content),
};
