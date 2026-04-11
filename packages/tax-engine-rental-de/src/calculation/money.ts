export function centsToEuro(cents: number) {
  return cents / 100;
}

export function euroToCents(euro: number) {
  return Math.round(euro * 100);
}

export function addCents(...values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}
