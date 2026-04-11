export function daysBetweenInclusive(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86400000) + 1;
}

export function taxYearRange(taxYear: number) {
  return {
    startDate: `${taxYear}-01-01`,
    endDate: `${taxYear}-12-31`,
  };
}
