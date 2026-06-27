/**
 * Combined dictionary aggregator (Phase 3).
 *
 * Wires the base dictionary (`merchants.ts`) with the user overrides
 * (`dictionary.user.ts`) into a single sorted list the matcher can iterate.
 * Lives in its own file to avoid the import cycle: `merchants.ts` defines
 * the `MerchantEntry` type, `dictionary.user.ts` consumes it, and this
 * module joins both at lookup time.
 */

import { MERCHANT_DICTIONARY, type MerchantEntry } from './merchants';
import {
  combineDictionary,
  loadUserDictionary,
  type CombinedToken,
} from './dictionary.user';

export interface AugmentedMerchantToken {
  token: string;
  entry: MerchantEntry;
  weight: number | undefined;
  source: 'base' | 'user';
}

/**
 * Get the user-augmented token list (base + additions - removals).
 * Lazy: re-reads the user dictionary on every call so changes are picked
 * up without reloading the page.
 */
export function getMerchantTokensSorted(): AugmentedMerchantToken[] {
  const combined: CombinedToken[] = combineDictionary(
    MERCHANT_DICTIONARY,
    loadUserDictionary(),
  );
  return combined.map((c) => ({
    token: c.token,
    entry: { categoryName: c.categoryName, tokens: [c.token] } as MerchantEntry,
    weight: c.weight,
    source: c.source,
  }));
}