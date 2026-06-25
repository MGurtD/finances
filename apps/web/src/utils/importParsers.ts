import Papa from 'papaparse';
import type { TransactionKind } from '@finances/contracts';

export interface ParsedRow {
  date: string;
  description: string;
  amountCents: number;
  kind: TransactionKind;
}

export type ImportFormat = 'csv' | 'ofx' | 'unknown';

const DATE_KEYS = ['date', 'fecha', 'data', 'fec', 'fechaoperacion', 'fecha_valor', 'fecha_operacion', 'f.operation'];
const DESC_KEYS = ['description', 'descripcion', 'descripción', 'concepto', 'detalle', 'memo'];
const AMOUNT_KEYS = ['amount', 'importe', 'quantitat', 'valor'];
const DEBIT_KEYS = ['debit', 'cargo', 'deure', 'debit_amount', 'habe'];
const CREDIT_KEYS = ['credit', 'abono', 'haver', 'credit_amount'];
const BALANCE_KEYS = ['saldo', 'balance', 'saldoactual', 'saldo_final', 'saldo_final_disponible'];

// Heurística: descripcions positives → ingressos habituals a extractes espanyols.
const INCOME_HINTS = [
  /\bn[oó]mina\b/i,
  /\bsou\b/i,
  /\btransfer(encia|\.)\s+rebuda/i,
  /\btransf(erencia|\.)\s+recibida/i,
  /\babono\b/i,
  /\bdevoluci(o|ó)n\b/i,
  /\breembolso\b/i,
  /\bintereses?\b/i,
  /\bdiv(idendos?|idend)\b/i,
];

function normaliseKey(k: string): string {
  return k.toLowerCase().trim().replace(/\s+/g, '');
}

function findKey(keys: string[], candidates: string[]): string | undefined {
  const normalised = keys.map(normaliseKey);
  for (const c of candidates) {
    const idx = normalised.indexOf(c);
    if (idx >= 0) return keys[idx];
  }
  return undefined;
}

/**
 * Parse a money string into signed cents.
 *
 * - Strips currency symbols / thousands separators
 * - Keeps the rightmost of `,` / `.` as the decimal separator
 * - Preserves sign: `-18.03` → -1803, `+18.03` → 1803, `18.03` → 1803
 * - Returns 0 for empty / unparseable input (never NaN)
 */
export function parseAmountCents(raw: string | undefined | null): number {
  if (raw == null) return 0;
  const trimmed = String(raw).trim();
  if (!trimmed) return 0;
  // Detect explicit sign
  let sign = 1;
  let body = trimmed;
  if (body.startsWith('-') || body.startsWith('+')) {
    if (body.startsWith('-')) sign = -1;
    body = body.slice(1);
  }
  // Strip everything that isn't a digit, decimal point, comma, or stray minus
  const cleaned = body.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return 0;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalised = cleaned;
  if (lastComma > lastDot) {
    // European: 1.234,56 → 1234.56
    normalised = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // US: 1,234.56 → 1234.56
    normalised = cleaned.replace(/,/g, '');
  } else {
    // No separators or only one kind — no-op
    normalised = cleaned;
  }
  const n = Number(normalised);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) * sign;
}

function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // ISO first
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(trimmed);
  if (dmy) {
    let yyyy = dmy[3]!;
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    const dd = dmy[1]!.padStart(2, '0');
    const mm = dmy[2]!.padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

export function detectFormat(filename: string, content: string): ImportFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.ofx') || lower.endsWith('.qfx')) return 'ofx';
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'csv';
  if (content.trimStart().startsWith('OFXHEADER')) return 'ofx';
  return 'csv';
}

/**
 * Decide if `desc` looks like an income (payroll, transfer received, refund…).
 * Used as last-resort heuristic when the bank gives an unsigned Amount column.
 */
function looksLikeIncome(desc: string): boolean {
  return INCOME_HINTS.some((re) => re.test(desc));
}

/**
 * Derive the transaction kind using the most reliable signal available.
 *
 * Priority:
 *  1. Previous-row balance delta (very reliable for any bank that exports Saldo)
 *  2. Explicit sign on the Amount field
 *  3. Debit/Credit columns
 *  4. Description heuristics (weakest signal — only used as tie-breaker)
 */
function classify(
  rawAmount: string,
  parsedCents: number,
  description: string,
  debitKey: string | undefined,
  creditKey: string | undefined,
  row: Record<string, string>,
  prevBalanceCents: number | null,
  currentBalanceCents: number | null,
): TransactionKind {
  // (1) Balance delta — strongest signal.
  if (prevBalanceCents !== null && currentBalanceCents !== null) {
    return currentBalanceCents > prevBalanceCents ? 'income' : 'expense';
  }
  // (2) Debit/Credit columns — explicit.
  if (debitKey && creditKey) {
    const debit = parseAmountCents(row[debitKey]);
    const credit = parseAmountCents(row[creditKey]);
    if (debit > 0 && credit === 0) return 'expense';
    if (credit > 0 && debit === 0) return 'income';
    // Fall through if both zero or ambiguous.
  }
  // (3) Explicit sign on Amount.
  const raw = (rawAmount ?? '').toString().trim();
  if (raw.startsWith('-')) return 'expense';
  if (raw.startsWith('+')) return 'income';
  if (parsedCents < 0) return 'expense';
  // (4) Unsigned positive — could be either. Default to expense
  // (conservative: user reviews in the preview screen before committing).
  // But if the description strongly hints income, trust it.
  return looksLikeIncome(description) ? 'income' : 'expense';
}

export function parseCsv(text: string): ParsedRow[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (!result.meta.fields || result.meta.fields.length === 0) return [];

  const fields = result.meta.fields;
  const dateKey = findKey(fields, DATE_KEYS);
  const descKey = findKey(fields, DESC_KEYS);
  const amountKey = findKey(fields, AMOUNT_KEYS);
  const debitKey = findKey(fields, DEBIT_KEYS);
  const creditKey = findKey(fields, CREDIT_KEYS);
  const balanceKey = findKey(fields, BALANCE_KEYS);

  if (!dateKey || !descKey) return [];
  if (!amountKey && !debitKey && !creditKey) return [];

  const out: ParsedRow[] = [];
  let prevBalanceCents: number | null = null;

  for (const row of result.data) {
    const date = parseDate(row[dateKey] ?? '');
    const description = (row[descKey] ?? '').trim();
    if (!date || !description) continue;

    let cents = 0;
    if (amountKey) {
      cents = parseAmountCents(row[amountKey]);
    } else if (debitKey && creditKey) {
      const debit = parseAmountCents(row[debitKey]);
      const credit = parseAmountCents(row[creditKey]);
      cents = debit > 0 ? debit : credit;
    }

    if (cents === 0) continue;

    // Read balance if available — used for sign derivation.
    const currentBalanceCents = balanceKey ? parseAmountCents(row[balanceKey]) : null;

    const kind = classify(
      amountKey ? (row[amountKey] ?? '') : '',
      cents,
      description,
      debitKey,
      creditKey,
      row,
      prevBalanceCents,
      currentBalanceCents,
    );

    out.push({ date, description, amountCents: cents, kind });

    // Update running balance — use the parsed cents (absolute value) so a
    // previous-row delta of 0 won't mislead the next row.
    if (currentBalanceCents !== null) {
      prevBalanceCents = currentBalanceCents;
    }
  }
  return out;
}

interface OfxTransaction {
  DTPOSTED?: string;
  DTUSER?: string;
  TRNAMT?: string;
  FITID?: string;
  NAME?: string;
  MEMO?: string;
}

function ofxDateToIso(raw: string): string | null {
  // YYYYMMDD[HHMMSS][.SSS][TZ]
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export async function parseOfx(text: string): Promise<ParsedRow[]> {
  const { parse } = await import('ofx-js');
  const data = await parse(text);
  // ofx-js exposes body as a nested object; transactions live in STMTTRN nodes.
  const out: ParsedRow[] = [];
  const collect = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (obj.STMTTRN) {
      const tx = obj.STMTTRN as OfxTransaction | OfxTransaction[];
      const list = Array.isArray(tx) ? tx : [tx];
      for (const t of list) {
        const date = ofxDateToIso(t.DTPOSTED ?? t.DTUSER ?? '');
        const cents = Math.round(Math.abs(Number(t.TRNAMT ?? 0)) * 100);
        if (!date || cents === 0) continue;
        const description = (t.NAME ?? t.MEMO ?? '').trim();
        if (!description) continue;
        const rawAmount = Number(t.TRNAMT ?? 0);
        const kind: TransactionKind = rawAmount < 0 ? 'expense' : 'income';
        out.push({ date, description, amountCents: cents, kind });
      }
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') collect(v);
    }
  };
  collect(data);
  return out;
}

export async function parseFile(filename: string, text: string): Promise<{ format: ImportFormat; rows: ParsedRow[] }> {
  const format = detectFormat(filename, text);
  if (format === 'csv') return { format, rows: parseCsv(text) };
  if (format === 'ofx') return { format, rows: await parseOfx(text) };
  return { format: 'unknown', rows: [] };
}