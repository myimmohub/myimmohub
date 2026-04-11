import type {
  OwnerAllocationLine,
  OwnerAllocationResult,
  OwnerSpecificItem,
  OwnershipPeriod,
  TaxSubject,
} from "../domain/types";
import { daysBetweenInclusive, taxYearRange } from "./dates";

function sharePercent(periods: OwnershipPeriod[], ownerId: string, taxYear: number) {
  const ownerPeriods = periods.filter((period) => period.ownerId === ownerId);
  if (ownerPeriods.length === 0) return 0;
  const yearRange = taxYearRange(taxYear);
  const yearDays = daysBetweenInclusive(yearRange.startDate, yearRange.endDate);
  const weightedShare = ownerPeriods.reduce((sum, period) => {
    const overlapStart = period.startDate > yearRange.startDate ? period.startDate : yearRange.startDate;
    const overlapEnd = (period.endDate ?? yearRange.endDate) < yearRange.endDate ? (period.endDate ?? yearRange.endDate) : yearRange.endDate;
    if (overlapStart > overlapEnd) return sum;
    const overlapDays = daysBetweenInclusive(overlapStart, overlapEnd);
    return sum + (((100 * period.numerator) / period.denominator) * overlapDays) / yearDays;
  }, 0);
  return weightedShare;
}

export function computeOwnerAllocations(args: {
  taxSubject: TaxSubject;
  ownershipPeriods: OwnershipPeriod[];
  taxYear: number;
  totalRevenueCents: number;
  totalExpenseCents: number;
  totalDepreciationCents: number;
  totalResultCents: number;
  ownerSpecificItems: OwnerSpecificItem[];
}): OwnerAllocationResult[] {
  const lines: OwnerAllocationLine[] = args.taxSubject.owners.map((owner) => {
    const ownerSharePercent = sharePercent(args.ownershipPeriods, owner.id, args.taxYear);
    const factor = ownerSharePercent / 100;
    const specialItemsCents = args.ownerSpecificItems
      .filter((item) => item.ownerId === owner.id)
      .reduce((sum, item) => sum + item.amountCents, 0);
    return {
      ownerId: owner.id,
      revenueCents: Math.round(args.totalRevenueCents * factor),
      expenseCents: Math.round(args.totalExpenseCents * factor),
      depreciationCents: Math.round(args.totalDepreciationCents * factor),
      specialItemsCents,
      resultCents: Math.round(args.totalResultCents * factor) + specialItemsCents,
      sharePercent: ownerSharePercent,
    };
  });
  return [{ lines }];
}
