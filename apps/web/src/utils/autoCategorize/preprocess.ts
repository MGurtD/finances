/**
 * Description preprocessor.
 *
 * Bank descriptions are notoriously messy:
 *   "PRIMAPRIX A192 \MADRID\ES2604021120"
 *   "TRF.PERIODICA: 1 ES79 2100 0813 6102 0000 1234"
 *   "AMORTIZACION DEUDA 44070-0300"
 *   "BIZUM ENVIADO - 666 11 22 33"
 *
 * Before any matching strategy runs we extract structured entities and
 * build a "clean" view of the description with bank noise stripped. This
 * lets the strategies reason about *meaning*, not formatting.
 */

import { normaliseText } from './normalize';

const DIACRITIC_MAP: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o', ø: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ñ: 'n', ç: 'c', ÿ: 'y',
};

const DIACRITIC_RE = /[àáâãäåèéêëìíîïòóôõöøùúûüñçÿÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖØÙÚÛÜÑÇ]/g;

export function normalise(input: string): string {
  if (!input) return '';
  const stripped = input.replace(DIACRITIC_RE, (ch) => DIACRITIC_MAP[ch] ?? ch);
  return stripped.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Spanish IBAN: ES + 2 check digits + 20 digits (with optional spaces). */
const IBAN_RE = /\bES[\s]?\d{2}[\s]?(\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}|\d{20})\b/gi;

/** 20-digit BBAN (no country prefix) — common in older exports. */
const BBAN_RE = /\b\d{4}[\s]\d{4}[\s]\d{4}[\s]\d{4}[\s]\d{4}\b/g;

/** Bank operation codes like ES2604021120 (country + date + terminal). */
const BANK_CODE_RE = /\b[A-Z]{2}\d{8,12}\b/g;

/** Postal codes (5 digits) — usually noise for merchants. */
const POSTAL_CODE_RE = /\b\d{5}\b/g;

/** Dates in various formats inside description. */
const DATE_IN_DESC_RE = /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g;

/** Time stamps HH:MM:SS or HH:MM. */
const TIME_RE = /\b\d{2}:\d{2}(?::\d{2})?\b/g;

/** Phone numbers (Spanish 9 digits, optionally with prefix). */
const PHONE_RE = /\b(?:\+?\d{2,3}[\s-]?)?[6-9]\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}\b/g;

/** Currency amounts inside description. */
const AMOUNT_IN_DESC_RE = /\b\d+[.,]\d{2}\b/g;

/** City names — heuristically detected as capitalised Spanish/Catalan words. */
const CITY_HINT_RE = /\b[A-Z][A-ZÁÉÍÓÚÑ\s]{3,}\b/g;

export interface ProcessedDescription {
  /** Original description, untouched. */
  raw: string;
  /** Fully normalised: lowercase, diacritics stripped, whitespace collapsed. */
  normalised: string;
  /** Description with all detected noise entities removed. Used by token strategies. */
  cleaned: string;
  /** Meaningful word tokens (after stopword + entity removal). */
  tokens: string[];
  /** Extracted IBANs (Spanish or BBAN). */
  ibans: string[];
  /** Bank operation codes (ES + 8-12 digits). */
  bankCodes: string[];
  /** Detected amounts (numbers like "12.50" inside description). */
  amounts: number[];
  /** Capitalised words/phrases that look like city or proper nouns. */
  locationHints: string[];
  /** Detected Spanish phone numbers. */
  phones: string[];
  /** Detected dates inside the description. */
  dates: string[];
}

export function preprocess(input: string): ProcessedDescription {
  if (!input) {
    return {
      raw: '',
      normalised: '',
      cleaned: '',
      tokens: [],
      ibans: [],
      bankCodes: [],
      amounts: [],
      locationHints: [],
      phones: [],
      dates: [],
    };
  }

  const raw = input;

  // Step 1: extract structured entities from the ORIGINAL casing. We do
  // this before normalisation because some patterns (IBAN, bank codes)
  // are case-insensitive but easier to spot in mixed case.
  const ibans: string[] = [];
  for (const re of [IBAN_RE, BBAN_RE]) {
    for (const m of input.matchAll(re)) {
      // Strip internal spaces so IBANs compare cleanly.
      ibans.push(m[0].replace(/\s+/g, '').toUpperCase());
    }
  }

  const bankCodes: string[] = [];
  for (const m of input.matchAll(BANK_CODE_RE)) {
    bankCodes.push(m[0]);
  }

  const amounts: number[] = [];
  for (const m of input.matchAll(AMOUNT_IN_DESC_RE)) {
    const num = Number(m[0].replace(',', '.'));
    if (Number.isFinite(num)) amounts.push(num);
  }

  const phones: string[] = [];
  for (const m of input.matchAll(PHONE_RE)) {
    phones.push(m[0].replace(/[\s-]/g, ''));
  }

  const dates: string[] = [];
  for (const m of input.matchAll(DATE_IN_DESC_RE)) {
    dates.push(m[0]);
  }

  // Step 2: build the cleaned view by stripping all detected entities.
  // We strip from the ORIGINAL so we don't double-process.
  let cleaned = input;
  // Replace each match with a single space, then collapse.
  cleaned = cleaned
    .replace(IBAN_RE, ' ')
    .replace(BBAN_RE, ' ')
    .replace(BANK_CODE_RE, ' ')
    .replace(POSTAL_CODE_RE, ' ')
    .replace(TIME_RE, ' ')
    .replace(AMOUNT_IN_DESC_RE, ' ')
    .replace(DATE_IN_DESC_RE, ' ');

  // Strip bank-prefixed city codes like "S\ESPLUGUES", "L\HOSPITAL",
  // "L'HOSPITAL", "D'ESPLUGUES". These are CaixaBank/ABANCA artifacts:
  // a single letter + apostrophe or backslash + a place name. Removing
  // them keeps the merchant name intact (e.g. "KIYANI ROYAL S\ESPLUGUES"
  // becomes "KIYANI ROYAL").
//
// Critical: the single letter MUST be followed by a separator (not by
// another uppercase letter that would form a longer brand-name token
// like SHEIN, SPOTIFY, SUBMARI, etc.). The (?=[\\']) guard ensures
// the next non-whitespace character is a separator.
cleaned = cleaned.replace(/\b[SLDH](?=[\\' ])(?:\\|[']| )\s*[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-zàáèéíóòúñ]+/g, ' ');

  // Strip terminal "A\d+" tokens (e.g. "PRIMAPRIX A192", "CONSUM A45").
  // These are branch/terminal codes from the bank's POS system.
  cleaned = cleaned.replace(/\bA\d+\b/gi, ' ');

  // Strip trailing dot-prefixed city/branch tokens like "\MADRID",
  // "\SANT JUST", "\ESPLUGUES DE". The backslash is a bank field separator.
  cleaned = cleaned.replace(/\\\s?[A-Z][A-ZÁÉÍÓÚÑ\s]+/g, ' ');

  // We previously tried to detect "location hints" (e.g. capitalised
  // words like MADRID, BARCELONA) and strip them. That heuristic turned
  // out to be too aggressive — brand names like PRIMAPRIX, MCDONALD,
  // REPSOL also look like city hints when capitalised, so we'd strip
  // the very tokens the merchant dictionary matches against. The
  // stopwords list already covers real city names, so we leave the
  // cleaned view as-is from here on.
  const locationHints: string[] = [];
  void CITY_HINT_RE;
  void locationHints;

  // Step 3: normalise the cleaned view. This becomes the input for token
  // strategies.
  const normalised = normaliseText(cleaned);

  // Step 4: tokenise. We strip very short tokens (<3), pure digits (already
  // removed above but double-check), and "code-like" tokens (mostly digits
  // with a few letters — bank terminal IDs).
  const tokens = normalised
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .filter((t) => !/^\d+$/.test(t))
    .filter((t) => !/^[a-z]{1,3}\d+/i.test(t));

  return {
    raw,
    normalised,
    cleaned: normalised,
    tokens,
    ibans,
    bankCodes,
    amounts,
    locationHints,
    phones,
    dates,
  };
}