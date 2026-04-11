import type { DeductionResult, ExpenseEvent, UsageYear } from "../domain/types";
import { classifyExpense } from "./expense-classification";

function resolveExpensePercent(expense: ExpenseEvent, usage: UsageYear | undefined): number {
  if (expense.allocationMode === "manual_with_reason" && expense.deductiblePercentOverride != null) {
    return Math.max(0, Math.min(100, expense.deductiblePercentOverride));
  }
  if (expense.allocationMode === "pro_rata_rental_use" && usage) {
    const rentalDays = usage.rentalDays ?? 0;
    const totalDays = Math.max(1, usage.totalDays);
    return (rentalDays / totalDays) * 100;
  }
  return 100;
}

export function computeDeductibleExpenses(args: {
  expenses: ExpenseEvent[];
  usage?: UsageYear;
  acquisitionNearTriggeredExpenseIds?: Set<string>;
  distributedExpenseIds?: Set<string>;
}): DeductionResult {
  const buckets = new Map<string, number>();
  const capitalizedExpenseIds: string[] = [];
  const maintenanceCandidateExpenseIds: string[] = [];

  for (const expense of args.expenses) {
    const treatment = classifyExpense(expense, {
      acquisitionNearTriggeredExpenseIds: args.acquisitionNearTriggeredExpenseIds,
    });
    if (treatment.treatment === "capitalize_asset" || treatment.treatment === "capitalize_building") {
      capitalizedExpenseIds.push(expense.id);
      continue;
    }
    if (treatment.treatment === "maintenance_distribution_candidate") {
      maintenanceCandidateExpenseIds.push(expense.id);
      if (args.distributedExpenseIds?.has(expense.id)) {
        continue;
      }
    }
    if (treatment.deductionCategory === "none" || treatment.deductionCategory === "owner_specific") {
      continue;
    }
    const percent = resolveExpensePercent(expense, args.usage);
    const deductibleCents = Math.round((expense.amountCents * percent) / 100);
    buckets.set(treatment.deductionCategory, (buckets.get(treatment.deductionCategory) ?? 0) + deductibleCents);
  }

  const deductibleExpenseCents = Array.from(buckets.values()).reduce((sum, value) => sum + value, 0);
  return {
    immediateExpenseCents: deductibleExpenseCents,
    deductibleExpenseCents,
    allocatedExpenseCents: deductibleExpenseCents,
    buckets: Array.from(buckets.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, amountCents]) => ({ key, amountCents })),
    capitalizedExpenseIds,
    maintenanceCandidateExpenseIds,
  };
}
