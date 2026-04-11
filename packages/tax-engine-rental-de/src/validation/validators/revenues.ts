import type { RevenueEvent } from "../../domain/types";
import { emptyValidationResult } from "./common";

export function validateRevenues(revenues: RevenueEvent[], taxYear: number) {
  const result = emptyValidationResult();

  for (const event of revenues) {
    if (new Date(event.bookingDate).getUTCFullYear() !== taxYear) {
      result.reviewFlags.push({
        code: "FORM_YEAR_SWITCH_REVIEW",
        message: `Revenue ${event.id} liegt außerhalb des Steuerjahrs ${taxYear} und sollte geprüft werden.`,
      });
    }
  }

  return result;
}
