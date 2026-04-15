/**
 * German number format utilities.
 * - Decimal separator: comma (,)
 * - Thousands separator: dot (.)
 */

/**
 * Parse a string that may use either German (comma) or English (dot) decimal notation.
 * Examples: "1.234,56" → 1234.56 | "1234.56" → 1234.56 | "950,00" → 950 | "950.00" → 950
 */
export function parseGermanDecimal(value: string | number | undefined | null): number {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return value;
  // Remove thousands separators (dots when followed by 3 digits) then replace comma decimal
  const cleaned = value
    .trim()
    .replace(/\.(?=\d{3}(?:[,\s]|$))/g, "") // remove dot-thousands-separators
    .replace(",", ".");                        // comma → dot for parseFloat
  return parseFloat(cleaned);
}

/**
 * Format a number with German locale (de-DE).
 * @param n - the number
 * @param minDecimals - minimum decimal places (default 0)
 * @param maxDecimals - maximum decimal places (default 2)
 */
export function fmtDecimal(n: number, minDecimals = 0, maxDecimals = 2): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * Format a percentage with German locale.
 * @param n - value as fraction (0.05) or percentage (5) — pass as-is, add % suffix
 * @param decimals - decimal places (default 2)
 */
export function fmtPct(n: number, decimals = 2): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + " %";
}

/**
 * Format cents as Euro currency string.
 */
export function fmtEurCents(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

/**
 * Format a euro value as currency string.
 */
export function fmtEur(eur: number): string {
  return eur.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
