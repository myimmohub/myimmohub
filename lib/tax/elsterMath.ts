const EURO_CENTS = 100;
const RATIO_SCALE = 10000;

function normalizeNumberString(value: string) {
  return value.replace(/\s/g, "").replace(",", ".");
}

export function toCents(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;

  const normalized = typeof value === "number"
    ? value.toFixed(2)
    : normalizeNumberString(value);

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return 0;

  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [euros, decimals = ""] = unsigned.split(".");
  const decimalPart = (decimals + "00").slice(0, 2);
  const cents = (Number(euros || "0") * EURO_CENTS) + Number(decimalPart || "0");
  return negative ? -cents : cents;
}

export function fromCents(value: number): number {
  return value / 100;
}

export function ratioToBasisPoints(value: number | null | undefined): number {
  const safe = Math.max(0, Math.min(1, Number(value ?? 1)));
  return Math.round(safe * RATIO_SCALE);
}

export function roundHalfUpInteger(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  const negative = numerator < 0;
  const absNumerator = negative ? -numerator : numerator;
  const rounded = Math.floor((absNumerator * 2 + denominator) / (2 * denominator));
  return negative ? -rounded : rounded;
}

export function roundHalfUpEuroFromCents(cents: number): number {
  return roundHalfUpInteger(cents, EURO_CENTS);
}

export function calcElsterEuroFromCents(args: {
  amountCents: number;
  applyRentalRatio: boolean;
  rentalShareBasisPoints: number;
  divisor?: number;
}): number {
  const divisor = Math.max(1, args.divisor ?? 1);
  const ratio = args.applyRentalRatio ? args.rentalShareBasisPoints : RATIO_SCALE;
  const numerator = args.amountCents * ratio;
  const denominator = EURO_CENTS * divisor * RATIO_SCALE;
  return roundHalfUpInteger(numerator, denominator);
}
