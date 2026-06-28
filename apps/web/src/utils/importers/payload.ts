import type { CreateTransactionInput } from '@/api/types';

/**
 * Shape Import.vue's EditableRow carries in-memory (subset of
 * ParsedRow + UI-side categorisation metadata). Kept inline because
 * the view owns the categorisation state; the helper below only reads
 * the documented fields.
 */
export interface EditableRowLike {
  date: string;
  description: string;
  amountCents: number;
  kind: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  importHash?: string;
}

/**
 * Build the body of POST /api/transactions/bulk from the rows the user
 * approved in the preview.
 *
 * - amount sign comes from kind: income/transfer are positive cents,
 *   expense is the negative of the absolute value (matches how the
 *   existing backend dedup keys on signed integer cents).
 * - importHash is forwarded when the importer emitted one — this is
 *   what activates the backend SHA256 dedup.
 */
export function buildBulkPayload(
  accountId: string,
  rows: EditableRowLike[],
): { transactions: CreateTransactionInput[] } {
  return {
    transactions: rows.map((r) => {
      const amount = r.kind === 'expense' ? -Math.abs(r.amountCents) : Math.abs(r.amountCents);
      const tx: CreateTransactionInput = {
        accountId,
        categoryId: r.categoryId,
        kind: r.kind,
        amount,
        description: r.description,
        date: r.date,
      };
      if (r.importHash) tx.importHash = r.importHash;
      return tx;
    }),
  };
}
