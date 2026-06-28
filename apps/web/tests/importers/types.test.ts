import { describe, expectTypeOf, it } from 'vitest';
import type {
  Importer,
  ImporterSuggestion,
  ParsedRow,
} from '@/utils/importers/types';
import type { TransactionKind } from '@/api/types';

describe('importer types — smoke imports', () => {
  it('exposes ParsedRow with the documented shape', () => {
    const row: ParsedRow = {
      date: '2026-04-01',
      description: 'Amazon',
      amountCents: -1234,
      kind: 'expense',
      importHash: 'abc',
    };
    expectTypeOf(row.date).toEqualTypeOf<string>();
    expectTypeOf(row.description).toEqualTypeOf<string>();
    expectTypeOf(row.amountCents).toEqualTypeOf<number>();
    expectTypeOf(row.kind).toEqualTypeOf<TransactionKind>();
    expectTypeOf(row.importHash).toEqualTypeOf<string | undefined>();
  });

  it('exposes Importer with the documented detect/parse contract', () => {
    const dummy: Importer = {
      id: 'x',
      label: 'X',
      description: 'X importer',
      detect: (_filename: string, _content: string): number => 0.5,
      parse: async (_content: string): Promise<ParsedRow[]> => [],
    };
    expectTypeOf(dummy.detect).parameters.toEqualTypeOf<[string, string]>();
    expectTypeOf(dummy.detect).returns.toEqualTypeOf<number>();
    expectTypeOf(dummy.parse).returns.toEqualTypeOf<Promise<ParsedRow[]>>();
  });

  it('exposes ImporterSuggestion with primary/confidence/alternatives', () => {
    const dummy: ImporterSuggestion = {
      primary: null,
      confidence: 0,
      alternatives: [],
    };
    expectTypeOf(dummy.confidence).toEqualTypeOf<number>();
    expectTypeOf(dummy.primary).toEqualTypeOf<Importer | null>();
  });
});
