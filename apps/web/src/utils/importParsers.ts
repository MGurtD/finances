// Backward-compat shim — the parsers live in apps/web/src/utils/importers/.
// Re-exports keep existing callers (Import.vue, tests) compiling without
// churn. New code should import from `@/utils/importers` directly.
import {
  detectFormat as detectFormatNew,
  parseFile as parseFileNew,
  parseCsv,
  parseOfx,
  parseAmountCents,
  parseWith,
  suggestImporter,
  importers,
  primaryThreshold,
} from './importers';
import type { ParsedRow, ImportFormat } from './importers';

/**
 * Legacy parseFile shape — preserves the {format, rows} contract that
 * Import.vue and the existing importParsers.test.ts rely on. Internally
 * routes through the registry's parseFile and prepends the format
 * detection result.
 */
export async function parseFile(
  filename: string,
  text: string,
): Promise<{ format: ImportFormat; rows: ParsedRow[] }> {
  const format = detectFormatNew(filename, text);
  const rows = await parseFileNew(filename, text);
  return { format, rows };
}

export { detectFormatNew as detectFormat };
export { parseCsv, parseOfx, parseAmountCents, parseWith, suggestImporter, importers, primaryThreshold };
export type { ImportFormat, ParsedRow };
