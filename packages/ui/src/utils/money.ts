/**
 * Money formatting helpers.
 * Amounts are stored as integers (cents) to avoid floating-point errors.
 */

export function formatMoney(
  cents: number,
  options: { showSign?: boolean; locale?: string } = {}
): string {
  const { showSign = false, locale = 'ca-ES' } = options;
  const euros = cents / 100;
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(euros));

  if (showSign && euros !== 0) {
    return euros > 0 ? `+${formatted}` : `−${formatted}`;
  }
  return euros < 0 ? `−${formatted}` : formatted;
}

export function formatCompactMoney(
  cents: number,
  locale = 'ca-ES'
): string {
  const euros = cents / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(euros);
}

export function parseMoneyInput(value: string): number {
  // Accepts "12,34", "12.34", "1.234,56", "-5"
  const cleaned = value
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '') // thousand dots
    .replace(',', '.');                    // decimal comma
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}