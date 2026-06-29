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
import { suggestImporter } from '@/utils/importers';
import { parseCsv as parseIndexaCsv } from '@/utils/importers/indexaCapital';
import { parseCsv as parseAbancaCsv } from '@/utils/importers/abanca';

// ─── Indexa Capital importer — header literal from the spec ─────────────
const INDEXA_HEADER_CONTENT =
  '"Fecha valor";"Fecha operación";Inversión;"Código ISIN";Tipo;Participaciones;Importe;Retenciones;"Resultado fiscal"';

// Single Indexa data row matching the spec scenario (REEMBOLSO POR TRASPASO).
const INDEXA_REEMBOLSO_CSV = [
  INDEXA_HEADER_CONTENT,
  '11/05/2026;13/05/2026;Vanguard Global Stk Idx Eur -Ins Plus;IE00BFPM9N11;REEMBOLSO POR TRASPASO;1,730000;"732,52 €";"0,00 €";"0,00 €"',
].join('\n');

// SUSCRIPCION row for the income scenario.
const INDEXA_SUSCRIPCION_CSV = [
  INDEXA_HEADER_CONTENT,
  '01/05/2026;03/05/2026;iShares Core MSCI World;IE00B4L5Y983;SUSCRIPCIÓN;0,250000;"42,00 €";"0,00 €";"0,00 €"',
].join('\n');

// SUSCRIPCIÓN POR TRASPASO variant.
const INDEXA_SUSCRIPCION_POR_TRASPASO_CSV = [
  INDEXA_HEADER_CONTENT,
  '08/05/2026;10/05/2026;Amundi MSCI World;LU2009202107;SUSCRIPCIÓN POR TRASPASO;0,500000;"75,00 €";"0,00 €";"0,00 €"',
].join('\n');

// ─── Abanca importer — header literal from the spec ────────────────────
const ABANCA_HEADER = 'Fecha;Concepto;Saldo;Importe;Fecha operación;Fecha valor';

// 5-row Abanca content used by the POS stripping tests (mixed POS variants).
const ABANCA_FIVE_ROWS_CSV = [
  ABANCA_HEADER,
  '02-05-2026;MUTICK \\MADRID\\ES2605021101;1906.77 EUR;-120.0 EUR;2026-05-04T00:00:00;2026-05-02T00:00:00',
  '03-05-2026;AMAZON ES_MARKETPLACE ES2604011743;1850.00 EUR;-25.50 EUR;2026-05-04T00:00:00;2026-05-03T00:00:00',
  '04-05-2026;SPOTIFY ES2604061015;1810.00 EUR;-9.99 EUR;2026-05-05T00:00:00;2026-05-04T00:00:00',
  '05-05-2026;BAR MIRADOR\\ES2604030924;1799.99 EUR;-23.40 EUR;2026-05-06T00:00:00;2026-05-05T00:00:00',
  '06-05-2026;JUST EAT ESPLUGUES\\ES2604041039;1776.59 EUR;-15.60 EUR;2026-05-07T00:00:00;2026-05-06T00:00:00',
].join('\n');

// Single-row CSV exercising the 'single space before POS' variant.
const ABANCA_SPACE_POS_CSV = [
  ABANCA_HEADER,
  '02-05-2026;MUTICK MADRID ES2604071000;1906.77 EUR;-120.0 EUR;2026-05-04T00:00:00;2026-05-02T00:00:00',
].join('\n');

// ROW used by tests #6, #5 (CHARTER no POS code).
const ABANCA_CHARTER_ROW_CSV = [
  ABANCA_HEADER,
  '01-05-2026;CHARTER EDUARD TOLDRA ESPLUGUES DE 34610;2033.43 EUR;-9.45 EUR;2026-05-04T00:00:00;2026-04-29T00:00:00',
].join('\n');

// 'Marc Gurt Dot;+100.0' incoming transfer scenario.
const ABANCA_INCOMING_CSV = [
  ABANCA_HEADER,
  '15-05-2026;Marc Gurt Dot;0.00 EUR;+100.0 EUR;2026-05-15T00:00:00;2026-05-15T00:00:00',
].join('\n');

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

// ─── Indexa Capital importer (csv-imports Reqs 1, 2, 3) ──────────────

describe('indexa-capital importer — detection', () => {
  it('detects by filename "IndexaCapital_Transacciones_…"', () => {
    const suggestion = suggestImporter(
      'IndexaCapital_Transacciones_7QMJ74WT_2026-06-28.csv',
      INDEXA_HEADER_CONTENT,
    );
    expect(suggestion.primary?.id).toBe('indexa-capital');
  });

  it('detects by header alone when filename is generic', () => {
    const suggestion = suggestImporter(
      'extracte-maig.csv',
      INDEXA_HEADER_CONTENT,
    );
    expect(suggestion.primary?.id).toBe('indexa-capital');
  });

  it('does NOT detect on a CaixaBank-shaped file with no Indexa header', () => {
    const caixabankHeader =
      'Fecha;Concepto;Saldo;Importe;Fecha operación;Fecha valor';
    const suggestion = suggestImporter('moviments.csv', caixabankHeader);
    expect(suggestion.primary?.id).not.toBe('indexa-capital');
  });
});

describe('indexa-capital importer — parseCsv', () => {
  it('parses REEMBOLSO POR TRASPASO row → expense, 73252c, correct description', () => {
    const rows = parseIndexaCsv(INDEXA_REEMBOLSO_CSV);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.date).toBe('2026-05-11');
    expect(rows[0]?.description).toBe(
      'Vanguard Global Stk Idx Eur -Ins Plus — REEMBOLSO POR TRASPASO',
    );
    expect(rows[0]?.amountCents).toBe(73252);
    expect(rows[0]?.kind).toBe('expense');
  });

  it('parses SUSCRIPCIÓN row → income', () => {
    const rows = parseIndexaCsv(INDEXA_SUSCRIPCION_CSV);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('income');
    expect(rows[0]?.amountCents).toBeGreaterThan(0);
  });

  it('parses SUSCRIPCIÓN POR TRASPASO row → income (variant mapping)', () => {
    const rows = parseIndexaCsv(INDEXA_SUSCRIPCION_POR_TRASPASO_CSV);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('income');
  });

  it('imports the full fixture and emits 90 rows (no truncation)', () => {
    const csv = readFileSync(
      resolve(__dirname, 'fixtures/indexa-sample.csv'),
      'utf8',
    );
    const rows = parseIndexaCsv(csv);
    expect(rows.length).toBe(90);
  });
});

describe('indexa-capital importer — importHash determinism', () => {
  it('produces identical importHash on re-parse of the same CSV', () => {
    const csv = readFileSync(
      resolve(__dirname, 'fixtures/indexa-sample.csv'),
      'utf8',
    );
    const a = parseIndexaCsv(csv);
    const b = parseIndexaCsv(csv);
    expect(a).toHaveLength(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]?.importHash).toBe(b[i]?.importHash);
    }
  });

  it('differentiates hashes by ISIN (hash key uses raw cells, not description)', () => {
    const csv = [
      INDEXA_HEADER_CONTENT,
      '11/05/2026;13/05/2026;Same Investment Name;IE00AAAAAA001;REEMBOLSO POR TRASPASO;1,000000;"100,00 €";"0,00 €";"0,00 €"',
      '11/05/2026;13/05/2026;Same Investment Name;IE00BBBBBB002;REEMBOLSO POR TRASPASO;1,000000;"100,00 €";"0,00 €";"0,00 €"',
    ].join('\n');
    const rows = parseIndexaCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.description).toBe(rows[1]?.description);
    expect(rows[0]?.importHash).not.toBe(rows[1]?.importHash);
  });
});

// ─── Abanca importer (csv-imports Reqs 4, 5, 6) ────────────────────────

describe('abanca importer — detection', () => {
  it('detects by filename "Abanca_Transacciones.csv"', () => {
    const suggestion = suggestImporter(
      'Abanca_Transacciones.csv',
      `${ABANCA_HEADER}\n01-05-2026;CHARTER ESPLUGUES DE 34610;2033.43 EUR;-9.45 EUR;2026-05-04T00:00:00;2026-04-29T00:00:00`,
    );
    expect(suggestion.primary?.id).toBe('abanca');
    expect(suggestion.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it('detects by exact header literal even when filename is generic', () => {
    const suggestion = suggestImporter('extracte.csv', ABANCA_HEADER);
    expect(suggestion.primary?.id).toBe('abanca');
  });
});

describe('abanca importer — Concepto POS stripping', () => {
  it('5 mixed Concepto variants all lose the trailing ES\\d{10}', () => {
    const rows = parseAbancaCsv(ABANCA_FIVE_ROWS_CSV);
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.description).not.toMatch(/ES\d{10}/);
    }
  });

  it('strips " ES…" form (single space before POS)', () => {
    const rows = parseAbancaCsv(ABANCA_SPACE_POS_CSV);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.description).toBe('MUTICK MADRID');
    expect(rows[0]?.description).not.toMatch(/ES\d{10}/);
  });

  it('leaves a Concepto without a POS code untouched', () => {
    const rows = parseAbancaCsv(ABANCA_CHARTER_ROW_CSV);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.description).toBe(
      'CHARTER EDUARD TOLDRA ESPLUGUES DE 34610',
    );
  });
});

describe('abanca importer — parseCsv', () => {
  it('CHARTER EDUARD TOLDRA → date 2026-04-29 (Fecha valor), expense, -945c', () => {
    const rows = parseAbancaCsv(ABANCA_CHARTER_ROW_CSV);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-04-29',
      amountCents: -945,
      kind: 'expense',
      description: 'CHARTER EDUARD TOLDRA ESPLUGUES DE 34610',
    });
  });

  it('MUTICK \\MADRID\\ES2605021101 → POS stripped, amount preserved', () => {
    const rows = parseAbancaCsv(ABANCA_FIVE_ROWS_CSV);
    const mutick = rows.find((r) => r.description.includes('MUTICK'));
    expect(mutick).toBeDefined();
    expect(mutick?.description).toBe('MUTICK \\MADRID');
    expect(mutick?.amountCents).toBe(-12000);
    expect(mutick?.kind).toBe('expense');
  });

  it('incoming transfer with +100.0 EUR → kind="income" and 10000c', () => {
    const rows = parseAbancaCsv(ABANCA_INCOMING_CSV);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amountCents).toBe(10000);
    expect(rows[0]?.kind).toBe('income');
  });

  it('full Abanca fixture yields exactly 43 ParsedRow', () => {
    const csv = readFileSync(
      resolve(__dirname, 'fixtures/abanca-sample.csv'),
      'utf8',
    );
    const rows = parseAbancaCsv(csv);
    expect(rows.length).toBe(43);
  });

  it('parseCsv(AbancaContent) called twice → identical importHash per row', () => {
    const csv = readFileSync(
      resolve(__dirname, 'fixtures/abanca-sample.csv'),
      'utf8',
    );
    const a = parseAbancaCsv(csv);
    const b = parseAbancaCsv(csv);
    expect(a).toHaveLength(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]?.importHash).toBe(b[i]?.importHash);
    }
  });
});