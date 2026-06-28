/**
 * Map a confidence score (0..1) to a short Catalan label for the UI.
 *
 * Thresholds were picked to align with the design proposal:
 *   ≥ 0.78 → "alta"
 *   ≥ 0.55 → "mitja"
 *   ≥ 0.32 → "baixa"
 *   else    → "mín."
 *
 * Exposed as a pure function so the UI does not need a component test
 * harness to lock the boundaries; a label change requires changing the
 * numbers here AND updating the importer confidence test.
 */
export function confidenceLabel(score: number): string {
  if (score >= 0.78) return 'alta';
  if (score >= 0.55) return 'mitja';
  if (score >= 0.32) return 'baixa';
  return 'mín.';
}
