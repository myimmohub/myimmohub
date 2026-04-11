import type { ExpenseEvent } from "../../domain/types";
import { emptyValidationResult } from "./common";

export function validateExpenses(expenses: ExpenseEvent[]) {
  const result = emptyValidationResult();

  for (const expense of expenses) {
    if (expense.amountCents < 0) {
      result.reviewFlags.push({
        code: "MIXED_USE_COMPONENT_SPLIT_REVIEW",
        message: `Expense ${expense.id} ist negativ und sollte als Erstattung oder Korrektur geprüft werden.`,
      });
    }
    if (expense.allocationMode === "manual_with_reason" && expense.deductiblePercentOverride == null) {
      result.blockingErrors.push({
        code: "MANUAL_OVERRIDE_WITHOUT_REASON",
        message: `Expense ${expense.id} nutzt manuelle Zuordnung ohne Prozent-Override.`,
      });
    }
  }

  return result;
}
