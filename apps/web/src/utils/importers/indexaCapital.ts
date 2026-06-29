import Papa from 'papaparse';
import { sha256 } from 'js-sha256';
import type { TransactionKind } from '@/api/types';
import type { Importer, ParsedRow } from './types';
import { parseAmountCents } from './genericCsv';

/**
 * Parse an Indexa `Fecha valor` / `Fecha operación` cell.
 *
 * Indexa's CSV uses `dd/mm/yyyy` (e.g. `11/05/2026`). This is a local copy
 * of the same logic as `genericCsv.parseDate` — kept local so we don't have
 * to export that internal helper (the genericCsv module is the shared
 * "generic CSV importer" and we want to keep its public surface minimal).
 *
 * Returns null for empty / unparseable input so callers can fall through.
 */
function parseIndexaDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(trimmed);
  if (!dmy) return null;
  let yyyy = dmy[3] ?? '';
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  const dd = (dmy[1] ?? '').padStart(2, '0');
  const mm = (dmy[2] ?? '').padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Indexa Capital CSV → ParsedRow[].
 *
 * Header (semicolon-delimited, mixed quoting):
 *   "Fecha valor";"Fecha operación";Inversión;"Código ISIN";
 *   Tipo;Participaciones;Importe;Retenciones;"Resultado fiscal"
 *
 * Detection (matches spec regex):
 *   FILENAME_RE: any of `indexacapital` / `indexa_capital` / `indexa capital`
 *   HEADER_RE:   `Fecha valor` and `Código ISIN` both appear on line 1
 * Each hit contributes 0.45 confidence (cap 1.0).
 *
 * Parsing rules (from spec csv Reqs 1-3):
 *   - `Fecha valor` dd/mm/yyyy → ISO date; fall back to `Fecha operación`.
 *   - `Tipo` SUSCRIPCIÓN* → income; REEMBOLSO* → expense.
 *   - `amountCents` = parseAmountCents(`Importe`). Sign from amount is NOT used
 *     for kind (the Tipo column is authoritative).
 *   - `description` = `${Inversión} — ${Tipo}`.
 *   - `importHash` = sha256(`${ISIN}|${Fecha valor raw}|${Tipo raw}|${Participaciones raw}`).
 *     Hash keys come from the raw CSV cells — not the rendered description —
 *     so re-imports dedup correctly.
 *   - Skip rows where `Participaciones` is empty OR `Importe === 0`.
 */

const FILENAME_RE =
  /(^|[^a-z])indexacapital([^a-z]|$)|(^|[^a-z])indexa_capital([^a-z]|$)|(^|[^a-z])indexa capital([^a-z]|$)/i;
const HEADER_RE = /"Fecha valor".*"Código ISIN"/i;

/**
 * Map an Indexa `Tipo` literal to a transaction kind.
 *
 * - SUSCRIPCIÓN* (SUSCRIPCIÓN, SUSCRIPCIÓN POR TRASPASO) → income
 * - REEMBOLSO*    (REEMBOLSO, REEMBOLSO POR TRASPASO)       → expense
 * - anything else                                              → expense (warn)
 */
export function indexaTipoToKind(tipo: string): TransactionKind {
  if (/^SUSCRIPCIÓN/i.test(tipo)) return 'income';
  if (/^REEMBOLSO/i.test(tipo)) return 'expense';
  // Unknown tipo — Indexa's CSV shouldn't emit these, but be conservative.
  if (typeof console !== 'undefined') {
    // eslint-disable-next-line no-console
    console.warn('[indexaCapital] unknown Tipo:', tipo);
  }
  return 'expense';
}

/**
 * Build the `description` field from a parsed Indexa row.
 *
 * Output shape: `${Inversión} — ${Tipo}` — papaparse strips the outer
 * quotes from quoted CSV cells, so we don't need to do any quote-stripping
 * ourselves.
 */
export function parseIndexaDescripcion(row: Record<string, string>): string {
  const inversion = (row['Inversión'] ?? '').trim();
  const tipo = (row['Tipo'] ?? '').trim();
  return tipo ? `${inversion} — ${tipo}` : inversion;
}

/**
 * Compute the per-row fingerprint so re-imports dedup at the backend.
 *
 * The hash key uses the FOUR raw CSV cells (not the rendered description):
 *   ISIN | Fecha valor | Tipo | Participaciones
 * The `|` separator is intentional — none of the raw cells can contain `|`
 * in real Indexa exports, so the key tuple is unambiguous.
 */
export function indexaImportHash(row: Record<string, string>): string {
  const isin = (row['Código ISIN'] ?? '').trim();
  const fechaValor = (row['Fecha valor'] ?? '').trim();
  const tipo = (row['Tipo'] ?? '').trim();
  const participaciones = (row['Participaciones'] ?? '').trim();
  return sha256(`${isin}|${fechaValor}|${tipo}|${participaciones}`);
}

export function parseCsv(text: string): ParsedRow[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: ';',
  });

  const fields = result.meta.fields ?? [];
  // Detection is the caller's job — but defensively: if neither Fecha valor
  // nor Código ISIN is present, refuse to emit rows (the file is almost
  // certainly a different bank's export).
  if (!fields.includes('Fecha valor') || !fields.includes('Código ISIN')) {
    return [];
  }

  const rows = result.data;
  const out: ParsedRow[] = [];
  for (const row of rows) {
    const participaciones = (row['Participaciones'] ?? '').trim();
    if (!participaciones) continue; // skip blank-row artifacts

    const importeRaw = (row['Importe'] ?? '').trim();
    const amountCents = parseAmountCents(importeRaw);
    if (amountCents === 0) continue; // zero-amount rows are CSV artifacts

    const fechaValor = (row['Fecha valor'] ?? '').trim();
    const fechaOperacion = (row['Fecha operación'] ?? '').trim();
    const date = parseIndexaDate(fechaValor) ?? parseIndexaDate(fechaOperacion);
    if (!date) continue;

    const description = parseIndexaDescripcion(row);
    if (!description) continue;

    out.push({
      date,
      description,
      amountCents,
      kind: indexaTipoToKind(row['Tipo'] ?? ''),
      importHash: indexaImportHash(row),
    });
  }
  return out;
}

/**
 * Indexa Capital importer (registered in `./index.ts`). Detection uses
 * filename OR header correlate. Header score (0.55) is intentionally
 * higher than `genericCsv`'s flat 0.50 so an Indexa-shaped header wins
 * over the generic fallback even when the filename is generic; the
 * spec's "header correlate is sufficient" scenario depends on this.
 */
export const indexaCapitalImporter: Importer = {
  id: 'indexa-capital',
  label: 'Indexa Capital',
  description: 'Extracte de transaccions de Indexa Capital (broker)',
  detect: (filename: string, content: string): number => {
    let score = 0;
    if (FILENAME_RE.test(filename)) score += 0.45;
    const headerLine = content.split(/\r?\n/, 1)[0] ?? '';
    if (HEADER_RE.test(headerLine)) score += 0.55;
    return Math.min(score, 1);
  },
  parse: async (content: string) => parseCsv(content),
};
