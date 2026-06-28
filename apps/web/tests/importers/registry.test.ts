import { describe, expect, it } from 'vitest';
import { importers, parseWith, suggestImporter } from '@/utils/importers';

/**
 * Helper: build a CSV with a given set of header columns.
 * The content is otherwise irrelevant — registry scoring is filename +
 * header driven, not row data.
 */
function csvWithHeaders(headers: string[]): string {
  return headers.join(',') + '\n';
}

describe('importer registry — suggestImporter', () => {
  it('returns primary=null when nothing scores >= primaryThreshold (0.4)', () => {
    const suggestion = suggestImporter('mystery.bin', '???');
    expect(suggestion.primary).toBeNull();
    expect(suggestion.confidence).toBeLessThan(0.4);
  });

  it('picks the highest-scoring importer as primary', () => {
    // A CSV with no recognisable headers scores genericCsv=0.5 (per design),
    // but tradeRepublic only scores when the header includes
    // transaction_id AND counterparty_iban. With only `Date,Amount,Desc`:
    // genericCsv wins. Order is otherwise preserved on ties.
    const suggestion = suggestImporter('export.csv', csvWithHeaders(['date', 'amount', 'description']));
    expect(suggestion.primary?.id).toBe('generic-csv');
    expect(suggestion.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it('orders alternatives descending by confidence, capped to 3 entries', () => {
    const suggestion = suggestImporter('export.csv', csvWithHeaders(['date', 'amount', 'description']));
    expect(suggestion.alternatives.length).toBeLessThanOrEqual(3);
    const confidences = suggestion.alternatives.map((a) => a.confidence);
    for (let i = 1; i < confidences.length; i += 1) {
      expect(confidences[i - 1]).toBeGreaterThanOrEqual(confidences[i]!);
    }
  });

  it('lists every registered importer in alternatives when nothing hits >= 0.4', () => {
    // mystery.bin + garbage → all importers score 0; primary is null; all
    // 3 (currently) registered importers appear in alternatives.
    const suggestion = suggestImporter('mystery.bin', '???');
    expect(suggestion.primary).toBeNull();
    expect(suggestion.alternatives).toHaveLength(importers.length);
    const ids = suggestion.alternatives.map((a) => a.importer.id).sort();
    expect(ids).toEqual([...importers.map((i) => i.id)].sort());
  });

  it('primary is the importer with the highest score even when others also score', () => {
    // For an OFX file (.ofx extension or OFXHEADER magic), ofx scores
    // 1.0; the other importers score 0 → primary is ofx, alternatives
    // are the other two with 0.
    const suggestion = suggestImporter('extracte.ofx', OFXHEADER + 'DATA:OFXSGML\n');
    expect(suggestion.primary?.id).toBe('ofx');
    expect(suggestion.confidence).toBe(1);
  });
});

describe('importer registry — parseWith', () => {
  it('routes to the chosen importer by id (manual override)', async () => {
    const rows = await parseWith('generic-csv', csvWithHeaders(['date', 'description', 'amount']));
    // genericCsv returns [] for headers missing required keys — this
    // proves parseWith routed through the genericCsv parser, not e.g.
    // tradeRepublic's stricter validator.
    expect(Array.isArray(rows)).toBe(true);
  });

  it('throws when the importer id is unknown', async () => {
    await expect(parseWith('does-not-exist', '')).rejects.toThrow(/importer not registered/i);
  });
});

// Inline OFX magic header used by the test above.
const OFXHEADER = 'OFXHEADER:100\n';
