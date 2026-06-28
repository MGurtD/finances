import { describe, expect, it } from 'vitest';
import { confidenceLabel } from '@/utils/importers/confidence';

describe('confidenceLabel', () => {
  it('maps high scores to "alta"', () => {
    expect(confidenceLabel(1)).toBe('alta');
    expect(confidenceLabel(0.9)).toBe('alta');
    expect(confidenceLabel(0.78)).toBe('alta');
  });

  it('maps medium-high scores to "mitja"', () => {
    expect(confidenceLabel(0.77)).toBe('mitja');
    expect(confidenceLabel(0.55)).toBe('mitja');
  });

  it('maps low-medium scores to "baixa"', () => {
    expect(confidenceLabel(0.54)).toBe('baixa');
    expect(confidenceLabel(0.32)).toBe('baixa');
  });

  it('maps very low scores to "mín."', () => {
    expect(confidenceLabel(0.31)).toBe('mín.');
    expect(confidenceLabel(0)).toBe('mín.');
  });
});
