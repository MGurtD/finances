import Papa from 'papaparse';
import type { TransactionKind } from '@/api/types';
import type { Importer, ParsedRow } from './types';
import { parseAmountCents, rowImportHash } from './genericCsv';

/**
 * Abanca CSV → ParsedRow[].
 *
 * Header (semicolon-delimited, no quoting):
 *   Fecha;Concepto;Saldo;Importe;Fecha operación;Fecha valor
 *
 * Detection (matches spec regex):
 *   FILENAME_RE: any standalone `abanca` token in the filename
 *   HEADER_EXACT: line 1 is literally `Fecha;Concepto;Saldo;Importe;
 *                 Fecha operación;Fecha valor`
 * Each hit contributes 0.45 confidence (cap 1.0).
 *
 * Parsing rules (from spec csv Reqs 4-6):
 *   - `Concepto` ends with a 12-char POS code in TWO variants seen in real
 *     exports — `\ES2605021101` (with one preceding backslash) and
 *     ` ES2604071000` (with one preceding space). BOTH must be stripped
 *     before the row's `description` flows downstream to `autoCategorize`,
 *     otherwise tokens like `ES2605021101` pollute categorisation.
 *   - `date` is `Fecha valor` (preferred) → `Fecha operación` → `Fecha`.
 *   - `amountCents` = parseAmountCents(`Importe`). Sign is honoured:
 *     negative → `expense`, positive → `income`, zero → skip the row.
 *   - `importHash` = sha256(`${date}|${description}|${amountCents}`) via
 *     `rowImportHash` from `genericCsv.ts:154-156` (matches every other
 *     importer's dedup fingerprint contract).
 */

const FILENAME_RE = /(^|[^a-z])abanca([^a-z]|$)/i;
const HEADER_EXACT =
  'Fecha;Concepto;Saldo;Importe;Fecha operación;Fecha valor';

/**
 * Strip the trailing 12-char POS code from an Abanca `Concepto` cell.
 *
 * Real Abanca exports produce both:
 *   - `MUTICK \MADRID\ES2605021101`  (single backslash before `ES`)
 *   - `MUTICK MADRID ES2604071000`   (single space before `ES`)
 *
 * The regex `(\s*\\?)\s*ES\d{10}\s*$` accepts any combo of 0+ leading
 * whitespace, an OPTIONAL backslash, then the literal `ES` + 10 digits,
 * anchored at end-of-string. The replacement is empty, then `.trim()`
 * handles any leftover leading whitespace defensively (the regex's
 * leading `\s*` already consumes it in practice).
 *
 * Concepto cells WITHOUT a trailing POS code are returned unchanged.
 */
export function stripAbancaPosCode(concepto: string): string {
  const stripped = concepto.replace(/(\s*\\?)\s*ES\d{10}\s*$/, '');
  return stripped.trim();
}

/**
 * Pick the date column with the priority `Fecha valor` → `Fecha operación`
 * → `Fecha`. Returns null if none parses.
 *
 * Date cell values in real Abanca exports are ISO timestamps
 * (e.g. `2026-04-29T00:00:00`) so the ISO branch in `parseDate` matches
 * first. The `Fecha` column uses `dd-mm-yyyy`.
 */
export function abancaDate(row: Record<string, string>): string | null {
  const fechaValorRaw = (row['Fecha valor'] ?? '').trim();
  if (fechaValorRaw) {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaValorRaw);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const fechaOperacionRaw = (row['Fecha operación'] ?? '').trim();
  if (fechaOperacionRaw) {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaOperacionRaw);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const fechaRaw = (row['Fecha'] ?? '').trim();
  if (fechaRaw) {
    const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(fechaRaw);
    if (dmy) {
      let yyyy = dmy[3] ?? '';
      if (yyyy.length === 2) yyyy = `20${yyyy}`;
      const dd = (dmy[1] ?? '').padStart(2, '0');
      const mm = (dmy[2] ?? '').padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  return null;
}

/**
 * Derive `TransactionKind` from a parsed `amountCents`.
 *
 * Abanca's `Importe` is signed (`"-9.45 EUR"` or `"+100.0 EUR"`), so the
 * cents value carries the truth. Cents `=== 0` are CSV artifacts and the
 * caller should skip the row, hence the `null` return.
 */
function abancaKind(cents: number): TransactionKind | null {
  if (cents > 0) return 'income';
  if (cents < 0) return 'expense';
  return null;
}

export function parseCsv(text: string): ParsedRow[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: ';',
  });

  const fields = result.meta.fields ?? [];
  // Defensive: if the canonical Abanca header isn't present, refuse to
  // emit rows — the caller almost certainly has the wrong file.
  if (
    !fields.includes('Fecha') ||
    !fields.includes('Concepto') ||
    !fields.includes('Importe')
  ) {
    return [];
  }

  const rows = result.data;
  const out: ParsedRow[] = [];
  for (const row of rows) {
    const importeRaw = (row['Importe'] ?? '').trim();
    const amountCents = parseAmountCents(importeRaw);
    const kind = abancaKind(amountCents);
    if (!kind) continue; // cents === 0 — CSV artifact, drop it

    const date = abancaDate(row);
    if (!date) continue;

    const description = stripAbancaPosCode((row['Concepto'] ?? '').trim());
    if (!description) continue;

    const parsed: ParsedRow = { date, description, amountCents, kind };
    parsed.importHash = rowImportHash(parsed);
    out.push(parsed);
  }
  return out;
}

/**
 * Abanca importer (registered in `./index.ts`). Detection uses filename
 * OR exact header literal, each contributing 0.45 confidence (capped at
 * 1.0). The header weight is slightly boosted to 0.55 so Abanca wins
 * over the genericCsv 0.5 even when only the header matches (mirrors
 * the Indexa detection strategy).
 */
export const abancaImporter: Importer = {
  id: 'abanca',
  label: 'Abanca',
  description: 'Extracte bancari Abanca (semicolon-delimited CSV amb codi POS al final)',
  detect: (filename: string, content: string): number => {
    let score = 0;
    if (FILENAME_RE.test(filename)) score += 0.45;
    const headerLine = content.split(/\r?\n/, 1)[0]?.trim() ?? '';
    if (headerLine === HEADER_EXACT) score += 0.55;
    return Math.min(score, 1);
  },
  parse: async (content: string) => parseCsv(content),
};
