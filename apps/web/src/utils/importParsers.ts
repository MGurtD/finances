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

function parseAmount(raw: string): number {
  // Strip currency symbols and thousands separators; keep the last dot/comma as decimal.
  const cleaned = raw.replace(/[^\d.,\-]/g, '').trim();
  if (!cleaned) return 0;
  // If both . and , present assume the rightmost is decimal separator.
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalised = cleaned;
  if (lastComma > lastDot) {
    normalised = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalised = cleaned.replace(/,/g, '');
  }
  const n = Number(normalised);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.abs(n) * 100);
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

  if (!dateKey || !descKey) return [];
  if (!amountKey && !debitKey && !creditKey) return [];

  const out: ParsedRow[] = [];
  for (const row of result.data) {
    const date = parseDate(row[dateKey] ?? '');
    const description = (row[descKey] ?? '').trim();
    if (!date || !description) continue;

    let cents = 0;
    let kind: TransactionKind = 'expense';
    if (amountKey) {
      cents = parseAmount(row[amountKey] ?? '');
      // If amount is signed and negative → expense; positive → income. If no
      // sign info, default to expense.
      const raw = (row[amountKey] ?? '').trim();
      if (raw.startsWith('-')) {
        kind = 'expense';
      } else if (raw.startsWith('+')) {
        kind = 'income';
      } else {
        kind = cents === 0 ? 'expense' : 'expense';
      }
    } else {
      const debit = parseAmount(row[debitKey!] ?? '');
      const credit = parseAmount(row[creditKey!] ?? '');
      if (debit > 0) {
        cents = debit;
        kind = 'expense';
      } else if (credit > 0) {
        cents = credit;
        kind = 'income';
      } else {
        continue;
      }
    }

    if (cents === 0) continue;
    out.push({ date, description, amountCents: cents, kind });
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