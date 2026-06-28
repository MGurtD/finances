import type { TransactionKind } from '@/api/types';
import type { ParsedRow } from './types';

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

/**
 * Parse an OFX/QFX file body into ParsedRow[].
 *
 * OFX is XML-ish (SGML in legacy variants) — ofx-js handles the syntax;
 * we walk the parsed object looking for STMTTRN nodes anywhere in the
 * tree. Each STMTTRN yields one row; rows missing date or amount are
 * skipped. Signed cents: amount is rounded to absolute integer cents and
 * the sign is preserved on `kind` (negative → expense, positive → income).
 */
export async function parseOfx(text: string): Promise<ParsedRow[]> {
  const { parse } = await import('ofx-js');
  const data = await parse(text);
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
