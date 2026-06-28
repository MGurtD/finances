import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseCsv } from '@/utils/importers/genericCsv';

// Resolve the real Marc's CSV fixture shipped under tests/fixtures.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CAIXABANK_CSV = readFileSync(
  resolve(__dirname, '../fixtures/caixabank-export.csv'),
  'utf8',
);

/**
 * The dedup fingerprint used by the generic CSV importer matches the
 * fingerprint the legacy `parseCsv` in `importParsers.ts` produced when
 * combined with SHA256 — i.e. it MUST be stable for a given
 * (date|description|cents) tuple so re-imports collide. The Backend dedup
 * SHA256s whatever it receives, so any consistent string works; we use
 * the same scheme that previously went through the frontend probe.
 */
function expectedHash(date: string, description: string, amountCents: number): string {
  return createHash('sha256').update(`${date}|${description}|${amountCents}`).digest('hex');
}

describe('parseCsv (genericCsv importer) — CaixaBank fixture', () => {
  it('parses 50 rows from the real fixture (1 row has an unparseable date)', () => {
    const rows = parseCsv(CAIXABANK_CSV);
    expect(rows).toHaveLength(50);
  });

  it('classifies the 3 income rows the old parser missed', () => {
    const rows = parseCsv(CAIXABANK_CSV);
    const incomes = rows.filter((r) => r.kind === 'income');
    expect(incomes).toHaveLength(3);

    const byDesc = new Map(incomes.map((r) => [r.description, r]));
    expect(byDesc.get('Sin concepto')?.amountCents).toBe(34000);
    expect(byDesc.get('Kireta')?.amountCents).toBe(32000);
    const kiyani = incomes.find((r) => r.description.startsWith('KIYANI ROYAL SL'));
    expect(kiyani?.amountCents).toBe(550);
  });

  it('keeps expense rows correctly signed via balance delta', () => {
    const rows = parseCsv(CAIXABANK_CSV);
    const charter = rows.find((r) => r.description.startsWith('CHARTER EDUARD TOLDRA'));
    expect(charter).toBeDefined();
    expect(charter?.kind).toBe('expense');
    expect(charter?.amountCents).toBe(-1803);
    expect(charter?.date).toBe('2026-04-01');
  });

  it('emits importHash = sha256(date|description|cents) for every row', () => {
    const rows = parseCsv(CAIXABANK_CSV);
    for (const row of rows) {
      const hash = expectedHash(row.date, row.description, row.amountCents);
      expect(row.importHash).toBe(hash);
    }
  });
});

describe('parseCsv (genericCsv importer) — debit/credit banks', () => {
  it('classifies from Debit/Credit columns', () => {
    const csv = [
      'Date,Description,Debit,Credit',
      '2026-01-02,Salary,,2500.00',
      '2026-01-03,Coffee,4.50,',
      '2026-01-04,Refund,,12.00',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: 'income', amountCents: 250000 });
    expect(rows[1]).toMatchObject({ kind: 'expense', amountCents: 450 });
    expect(rows[2]).toMatchObject({ kind: 'income', amountCents: 1200 });
    // Every row has a deterministic importHash.
    for (const r of rows) {
      expect(r.importHash).toBe(expectedHash(r.date, r.description, r.amountCents));
    }
  });
});

describe('parseCsv (genericCsv importer) — empty / malformed', () => {
  it('returns [] on empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('returns [] when required columns are missing', () => {
    expect(parseCsv('Foo,Bar\n1,2')).toEqual([]);
  });

  it('skips rows with zero amount or missing date (no importHash emitted)', () => {
    const csv = [
      'Date,Description,Amount',
      ',Missing date,10.00',
      '2026-01-02,,10.00',
      '2026-01-03,Zero amount,0.00',
      '2026-01-04,Valid row,5.00',
    ].join('\n');
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('Valid row');
    expect(rows[0].importHash).toBe(expectedHash('2026-01-04', 'Valid row', 500));
  });
});
