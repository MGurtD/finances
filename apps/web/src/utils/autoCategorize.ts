import type { Category } from '@finances/contracts';

/**
 * Heuristic: pick the category whose name (lowercased, no diacritics) appears
 * as the longest substring in the description. Ties go to the first match.
 * Returns null when no category name is found.
 */
export function autoCategorize(description: string, categories: Category[]): string | null {
  const norm = (s: string): string =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const desc = norm(description);
  if (!desc) return null;

  let best: { id: string; len: number } | null = null;
  for (const c of categories) {
    const needle = norm(c.name);
    if (!needle || needle.length < 3) continue;
    if (desc.includes(needle)) {
      if (!best || needle.length > best.len) {
        best = { id: c.id, len: needle.length };
      }
    }
  }
  return best ? best.id : null;
}