import type { ExpenseEvent } from "../domain/types";
import type { Property } from "../domain/types";
import type { TaxPolicyPack } from "../policy/policy-types";

export interface AcquisitionNearCostDecision {
  triggered: boolean;
  totalCandidateCents: number;
  thresholdCents: number;
  affectedExpenseIds: string[];
}

export function computeAcquisitionNearCosts(
  expenses: ExpenseEvent[],
  property: Property,
  policy: TaxPolicyPack,
  buildingBasisCents: number,
): AcquisitionNearCostDecision {
  const acquisitionDate = property.acquisitionDate ? new Date(property.acquisitionDate) : null;
  if (!acquisitionDate) {
    return { triggered: false, totalCandidateCents: 0, thresholdCents: Math.round(buildingBasisCents * policy.thresholds.acquisitionNearCostPercent / 100), affectedExpenseIds: [] };
  }
  const windowEnd = new Date(acquisitionDate);
  windowEnd.setMonth(windowEnd.getMonth() + policy.thresholds.acquisitionNearWindowMonths);
  const candidates = expenses.filter((expense) =>
    expense.category === "maintenance_candidate" &&
    new Date(expense.bookingDate) >= acquisitionDate &&
    new Date(expense.bookingDate) <= windowEnd,
  );
  const totalCandidateCents = candidates.reduce((sum, expense) => sum + expense.amountCents, 0);
  const thresholdCents = Math.round(buildingBasisCents * policy.thresholds.acquisitionNearCostPercent / 100);
  return {
    triggered: totalCandidateCents > thresholdCents,
    totalCandidateCents,
    thresholdCents,
    affectedExpenseIds: candidates.map((expense) => expense.id),
  };
}
