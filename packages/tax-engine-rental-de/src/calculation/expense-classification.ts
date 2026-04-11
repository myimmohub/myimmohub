import type { ExpenseCategory, ExpenseEvent } from "../domain/types";

export type ExpenseTreatmentKind =
  | "immediate_deduction"
  | "maintenance_distribution_candidate"
  | "capitalize_asset"
  | "capitalize_building"
  | "review_required";

export interface ExpenseTreatmentDecision {
  expenseId: string;
  treatment: ExpenseTreatmentKind;
  deductionCategory: ExpenseCategory | "owner_specific" | "none";
  rationale: string;
}

export interface ClassificationContext {
  acquisitionNearTriggeredExpenseIds?: Set<string>;
}

export function classifyExpense(expense: ExpenseEvent, context: ClassificationContext = {}): ExpenseTreatmentDecision {
  if (context.acquisitionNearTriggeredExpenseIds?.has(expense.id)) {
    return {
      expenseId: expense.id,
      treatment: "capitalize_building",
      deductionCategory: "none",
      rationale: "acquisition_near_costs_threshold_triggered",
    };
  }

  switch (expense.category) {
    case "capital_improvement_candidate":
      return {
        expenseId: expense.id,
        treatment: "capitalize_building",
        deductionCategory: "none",
        rationale: "capital_improvement_candidate",
      };
    case "furnishing_candidate":
      return {
        expenseId: expense.id,
        treatment: "capitalize_asset",
        deductionCategory: "none",
        rationale: "movable_asset_candidate",
      };
    case "maintenance_candidate":
      return {
        expenseId: expense.id,
        treatment: "maintenance_distribution_candidate",
        deductionCategory: expense.category,
        rationale: "maintenance_requires_user_choice",
      };
    default:
      return {
        expenseId: expense.id,
        treatment: "immediate_deduction",
        deductionCategory: expense.category,
        rationale: "default_deductible_expense",
      };
  }
}
