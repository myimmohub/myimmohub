import type { EvidenceRef, UsageYear } from "../../domain/types";
import { emptyValidationResult } from "./common";

export function validateUsage(usageYears: UsageYear[], evidence: EvidenceRef[] = []) {
  const result = emptyValidationResult();
  const evidenceTypes = new Set(evidence.map((item) => item.type));

  for (const usage of usageYears) {
    const knownDays =
      (usage.selfUseDays ?? 0) +
      (usage.reservedSelfUseDays ?? 0) +
      (usage.rentalDays ?? 0) +
      (usage.vacancyDays ?? 0);
    if (knownDays > 0 && knownDays !== usage.totalDays) {
      result.blockingErrors.push({
        code: "USAGE_DAYS_INVALID",
        message: `Nutzungstage ${usage.propertyId}/${usage.taxYear} ergeben ${knownDays} statt ${usage.totalDays}.`,
      });
    }
    if ((usage.vacancyDays ?? 0) > 0 && !evidenceTypes.has("local_typical_rental_days_evidence")) {
      result.reviewFlags.push({
        code: "VACANCY_EVIDENCE_REVIEW",
        message: `Leerstand für ${usage.propertyId}/${usage.taxYear} sollte mit Vermietungsnachweisen belegt werden.`,
      });
    }
  }

  return result;
}
