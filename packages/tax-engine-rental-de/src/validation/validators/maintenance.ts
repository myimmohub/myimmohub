import type { MaintenancePlan } from "../../domain/types";
import { emptyValidationResult } from "./common";

export function validateMaintenance(plans: MaintenancePlan[]) {
  const result = emptyValidationResult();

  for (const plan of plans) {
    if (plan.annualShareCents <= 0 || plan.originalAmountCents <= 0 || plan.sourceExpenseIds.length === 0) {
      result.blockingErrors.push({
        code: "MAINTENANCE_PLAN_INCOMPLETE",
        message: `MaintenancePlan ${plan.id} ist unvollständig.`,
      });
    }
  }

  return result;
}
