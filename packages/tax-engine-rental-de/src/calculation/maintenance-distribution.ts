import type { ExpenseEvent, MaintenancePlan } from "../domain/types";
import type { TaxPolicyPack } from "../policy/policy-types";

export function computeMaintenancePlans(args: {
  expenses: ExpenseEvent[];
  existingPlans: MaintenancePlan[];
  taxYear: number;
  policy: TaxPolicyPack;
  accelerateOnSale?: boolean;
}): MaintenancePlan[] {
  return args.existingPlans.map((plan) => ({
    ...plan,
    status:
      args.accelerateOnSale && plan.status === "active"
        ? "accelerated_on_sale_or_end_of_use"
        : plan.status,
  }));
}
