import { describe, expect, it } from 'vitest';
import { buildBulkPayload } from '@/utils/importers/payload';

describe('buildBulkPayload', () => {
  it('forwards accountId, kind, amount (signed), date, description', () => {
    const payload = buildBulkPayload('acct-1', [
      {
        id: 'row-1',
        date: '2026-04-01',
        description: 'Amazon',
        amountCents: 1234,
        kind: 'income',
        categoryId: null,
        suggestion: { categoryId: null, confidence: 'low' as const, reasons: [] },
      },
      {
        id: 'row-2',
        date: '2026-04-02',
        description: 'Shein',
        amountCents: 1234,
        kind: 'expense',
        categoryId: 'cat-1',
        suggestion: { categoryId: 'cat-1', confidence: 'high' as const, reasons: [] },
      },
    ]);

    expect(payload.transactions).toHaveLength(2);
    // Income → positive amount; expense → negative amount (cent sign carried via kind).
    expect(payload.transactions[0]).toMatchObject({
      accountId: 'acct-1',
      amount: 1234,
      date: '2026-04-01',
      description: 'Amazon',
      kind: 'income',
    });
    expect(payload.transactions[1]).toMatchObject({
      accountId: 'acct-1',
      amount: -1234,
      date: '2026-04-02',
      description: 'Shein',
      kind: 'expense',
      categoryId: 'cat-1',
    });
  });

  it('forwards importHash from the row when present', () => {
    const payload = buildBulkPayload('acct-1', [
      {
        id: 'row-1',
        date: '2026-04-01',
        description: 'TR row',
        amountCents: -47453,
        kind: 'expense',
        categoryId: null,
        importHash: '22058d7d-1cb0-4eb7-8e81-53eb9afd6493',
        suggestion: { categoryId: null, confidence: 'low' as const, reasons: [] },
      },
    ]);
    expect(payload.transactions[0]?.importHash).toBe('22058d7d-1cb0-4eb7-8e81-53eb9afd6493');
  });

  it('omits importHash when the row has none', () => {
    const payload = buildBulkPayload('acct-1', [
      {
        id: 'row-1',
        date: '2026-04-01',
        description: 'No hash',
        amountCents: -100,
        kind: 'expense',
        categoryId: null,
        suggestion: { categoryId: null, confidence: 'low' as const, reasons: [] },
      },
    ]);
    expect(payload.transactions[0]?.importHash).toBeUndefined();
  });
});
