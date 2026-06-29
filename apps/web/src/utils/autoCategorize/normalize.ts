/**
 * Normalisation helpers shared by the auto-categorisation pipeline.
 *
 * The Spanish-bank CSV exports are messy: they concatenate merchant names
 * with city codes, postal codes, and transaction IDs (e.g.
 *   "PRIMAPRIX A192 MADRID ES2604021120"
 *   "CHARTER EDUARD TOLDRA ESPLUGUES DE 34610"
 * ). To compare reliably, we strip diacritics, lowercase, collapse whitespace,
 * and expose a tokenizer that drops uninformative tokens.
 */

const DIACRITIC_MAP: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o', ø: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ñ: 'n', ç: 'c', ÿ: 'y',
  À: 'A', Á: 'A', Â: 'A', Ã: 'A', Ä: 'A', Å: 'A',
  È: 'E', É: 'E', Ê: 'E', Ë: 'E',
  Ì: 'I', Í: 'I', Î: 'I', Ï: 'I',
  Ò: 'O', Ó: 'O', Ô: 'O', Õ: 'O', Ö: 'O', Ø: 'O',
  Ù: 'U', Ú: 'U', Û: 'U', Ü: 'U',
  Ñ: 'N', Ç: 'C',
};

/** Lowercase, strip diacritics, collapse whitespace. */
export function normaliseText(input: string): string {
  if (!input) return '';
  const stripped = input.replace(/[àáâãäåèéêëìíîïòóôõöøùúûüñçÿÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖØÙÚÛÜÑÇ]/g, (ch) => DIACRITIC_MAP[ch] ?? ch);
  return stripped.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Tokens we drop from the tokenise() output specifically — things that
 * are noise inside bank descriptions but would be over-reaching if added
 * to the global STOPWORDS list (which `preprocess.ts` shares with the
 * merchant-dictionary fuzzy matcher).
 *
 * `www` is the canonical example: `WWW.AMAZON* NH5OV6C14 LUXEMBOURG`
 * would otherwise emit `www` as a standalone token. It is intentionally
 * a separate Set from STOPWORDS so a future change to STOPWORDS won't
 * silently affect tokenise's behaviour.
 */
const TOKENISE_STOPWORDS = new Set(['www']);

/**
 * Tokenise a description. Splits on any non-alphanumeric, drops:
 *   - tokens shorter than 3 chars
 *   - pure-digit tokens (transaction IDs, postal codes)
 *   - mixed-digit-letter tokens that look like codes (e.g. ES2604021120)
 *   - tokenise-only stopwords (currently just `www`) — see spec cat Req 5
 *
 * @returns ordered array of cleaned tokens
 */
export function tokenise(input: string): string[] {
  const norm = normaliseText(input);
  if (!norm) return [];
  return norm
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length >= 3)
    .filter((tok) => !/^\d+$/.test(tok))
    .filter((tok) => !/^[a-z]{1,3}\d+/i.test(tok)) // e.g. "es26..."
    .filter((tok) => !TOKENISE_STOPWORDS.has(tok));
}

/**
 * Extract the merchant token: the leading token of the description.
 * Useful for step 1 of the pipeline (exact dictionary lookup).
 *
 * Examples:
 *   "PRIMAPRIX A192 MADRID ES2604021120" → "primaprix"
 *   "GOOGLE*YOUTUBE IRELAND 010074479"  → "google"   (we keep the * in the prefix)
 */
export function merchantToken(input: string): string {
  const norm = normaliseText(input);
  if (!norm) return '';
  // First non-empty word (allow letters/digits and asterisk as part of merchant codes)
  const match = /^([a-z0-9*]+)/.exec(norm);
  return match?.[1] ?? '';
}

/**
 * Extract a "clean merchant phrase" — first 2 non-noise tokens concatenated.
 * This catches merchants like "BANCO CETELEM" or "AMAZON PRIME" where a single
 * token is too generic but the pair is unique.
 */
export function merchantPhrase(input: string, maxTokens = 2): string {
  const toks = tokenise(input);
  return toks.slice(0, maxTokens).join(' ');
}