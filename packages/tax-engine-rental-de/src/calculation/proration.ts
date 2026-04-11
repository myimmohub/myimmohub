import { daysBetweenInclusive } from "./dates";

export function prorateByDays(amountCents: number, numeratorDays: number, denominatorDays: number) {
  if (denominatorDays <= 0) return 0;
  return Math.round((amountCents * numeratorDays) / denominatorDays);
}

export function overlapDays(periodStart: string, periodEnd: string, yearStart: string, yearEnd: string) {
  const start = new Date(Math.max(new Date(periodStart).getTime(), new Date(yearStart).getTime()));
  const end = new Date(Math.min(new Date(periodEnd).getTime(), new Date(yearEnd).getTime()));
  if (end < start) return 0;
  return daysBetweenInclusive(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
}
