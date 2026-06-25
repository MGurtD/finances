import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  parseAmountCents,
  parseCsv,
  parseFile,
  detectFormat,
  type ParsedRow,
} from '@/utils/importParsers';

// Resolve the real Marc's CSV fixture shipped under tests/fixtures.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CAIXABANK_CSV = readFileSync(
  resolve(__dirname, 'fixtures/caixabank-export.csv'),
  'utf8',
);

describe('parseAmountCents', () => {
  it('parses unsigned euros into positive cents', () => {
    expect(parseAmountCents('18.03')).toBe(1803);
    expect(parseAmountCents('1,234.56')).toBe(123456);
    expect(parseAmountCents('1234,56')).toBe(123456);
    expect(parseAmountCents('1.234,56')).toBe(123456);
  });

  it('preserves an explicit negative sign', () => {
    expect(parseAmountCents('-18.03')).toBe(-1803);
    expect(parseAmountCents('-1.234,56 EUR')).toBe(-123456);
  });

  it('preserves an explicit positive sign', () => {
    expect(parseAmountCents('+18.03')).toBe(1803);
  });

  it('strips currency symbols and whitespace', () => {
    expect(parseAmountCents('  -18.03 EUR  ')).toBe(-1803);
    expect(parseAmountCents('1.234,56 €')).toBe(123456);
  });

  it('returns 0 for empty / unparseable / null', () => {
    expect(parseAmountCents('')).toBe(0);
    expect(parseAmountCents('   ')).toBe(0);
    expect(parseAmountCents(null)).toBe(0);
    expect(parseAmountCents(undefined)).toBe(0);
    expect(parseAmountCents('abc')).toBe(0);
  });
});

describe('detectFormat', () => {
  it('detects CSV by extension', () => {
    expect(detectFormat('export.csv', '')).toBe('csv');
    expect(detectFormat('moviments.txt', '')).toBe('csv');
  });

  it('detects OFX by extension', () => {
    expect(detectFormat('extracte.ofx', '')).toBe('ofx');
    expect(detectFormat('extracte.qfx', '')).toBe('ofx');
  });

  it('detects OFX by header magic', () => {
    expect(detectFormat('unknown.dat', 'OFXHEADER:100')).toBe('ofx');
  });
});

describe('parseCsv — Marc\'s real CaixaBank export (Apr 2026)', () => {
  let rows: ParsedRow[];

  it('parses the fixture file', () => {
    rows = parseCsv(CAIXABANK_CSV);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('imports 50 valid transactions (1 row has unparseable date)', () => {
    rows = parseCsv(CAIXABANK_CSV);
    expect(rows).toHaveLength(50);
  });

  it('detects the 3 income rows that the old parser missed', () => {
    rows = parseCsv(CAIXABANK_CSV);
    const incomes = rows.filter((r) => r.kind === 'income');
    expect(incomes).toHaveLength(3);

    const byDesc = new Map(incomes.map((r) => [r.description, r]));
    expect(byDesc.get('Sin concepto')?.amountCents).toBe(34000);
    expect(byDesc.get('Kireta')?.amountCents).toBe(32000);
    // KIYANI ROYAL SL has trailing merchant metadata; prefix match is enough.
    const kiyani = incomes.find((r) => r.description.startsWith('KIYANI ROYAL SL'));
    expect(kiyani?.amountCents).toBe(550);
  });

  it('keeps expense rows correctly signed via balance delta', () => {
    rows = parseCsv(CAIXABANK_CSV);
    const charter = rows.find((r) => r.description.startsWith('CHARTER EDUARD TOLDRA'));
    expect(charter).toBeDefined();
    expect(charter?.kind).toBe('expense');
    // Importe column is `-18.03 EUR` — parser preserves the sign, magnitude is 1803c.
    expect(charter?.amountCents).toBe(-1803);
    expect(charter?.date).toBe('2026-04-01');
  });

  it('parses dates in dd-mm-yyyy format into ISO', () => {
    rows = parseCsv(CAIXABANK_CSV);
    for (const r of rows) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('sum of incomes equals the expected net inflow', () => {
    rows = parseCsv(CAIXABANK_CSV);
    const totalIncome = rows
      .filter((r) => r.kind === 'income')
      .reduce((sum, r) => sum + r.amountCents, 0);
    expect(totalIncome).toBe(34000 + 32000 + 550);
  });
});

describe('parseCsv — debit/credit banks (US-style)', () => {
  // Bank that exports Debit/Credit columns instead of signed Amount.
  const csv = [
    'Date,Description,Debit,Credit',
    '2026-01-02,Salary,,2500.00',
    '2026-01-03,Coffee,4.50,',
    '2026-01-04,Refund,,12.00',
  ].join('\n');

  it('classifies from Debit/Credit columns', () => {
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: 'income', amountCents: 250000 });
    expect(rows[1]).toMatchObject({ kind: 'expense', amountCents: 450 });
    expect(rows[2]).toMatchObject({ kind: 'income', amountCents: 1200 });
  });
});

describe('parseCsv — description heuristic fallback (no balance, unsigned amount)', () => {
  // Bank that gives a positive Amount column with no Saldo and no sign.
  // Heuristic should pick up obvious income keywords.
  const csv = [
    'Date,Description,Amount',
    '2026-01-02,Nómina mensual,2500.00',
    '2026-01-03,Supermercado,52.40',
    '2026-01-04,Devolución Amazon,18.99',
  ].join('\n');

  it('flags descriptions with income hints as income', () => {
    const rows = parseCsv(csv);
    const nomina = rows.find((r) => r.description === 'Nómina mensual');
    const superm = rows.find((r) => r.description === 'Supermercado');
    const devol = rows.find((r) => r.description === 'Devolución Amazon');
    expect(nomina?.kind).toBe('income');
    expect(superm?.kind).toBe('expense');
    expect(devol?.kind).toBe('income');
  });
});

describe('parseCsv — empty / malformed inputs', () => {
  it('returns [] on empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('returns [] when required columns are missing', () => {
    const csv = 'Foo,Bar\n1,2';
    expect(parseCsv(csv)).toEqual([]);
  });

  it('skips rows with zero amount or missing date', () => {
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
  });
});

describe('parseFile', () => {
  it('routes to parseCsv for .csv files', async () => {
    const r = await parseFile('export.csv', 'Date,Description,Amount\n2026-01-02,X,1.00');
    expect(r.format).toBe('csv');
    expect(r.rows).toHaveLength(1);
  });

  it('falls back to csv for unrecognised extensions and produces no rows when headers are missing', async () => {
    // detectFormat defaults to 'csv' for unknown extensions (legacy behaviour).
    // With no recognisable headers, parseCsv yields [].
    const r = await parseFile('mystery.bin', '???');
    expect(r.format).toBe('csv');
    expect(r.rows).toEqual([]);
  });
});