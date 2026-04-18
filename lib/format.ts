/**
 * Shared formatting utilities (de-DE locale)
 */

const EUR_FORMATTER = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const EUR_FORMATTER_DECIMAL = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PCT_FORMATTER = new Intl.NumberFormat("de-DE", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Format a number as EUR currency (de-DE).
 * @param value  Amount in EUR
 * @param decimals  Whether to show cents (default: false)
 */
export function fmtEUR(value: number, decimals = false): string {
  return decimals ? EUR_FORMATTER_DECIMAL.format(value) : EUR_FORMATTER.format(value);
}

/**
 * Format a decimal ratio as percentage (0.05 → "5 %").
 */
export function fmtPct(value: number): string {
  return PCT_FORMATTER.format(value);
}

/**
 * Format a Date or ISO date string as DD.MM.YYYY.
 */
export function fmtDate(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  return DATE_FORMATTER.format(d);
}

/**
 * Format a plain number with thousands separator (de-DE).
 */
export function fmtNum(value: number, decimals = 0): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
