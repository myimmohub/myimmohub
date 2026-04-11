import type { OwnershipPeriod, TaxSubject } from "../../domain/types";
import { emptyValidationResult } from "./common";
import { normalizePartyName } from "./common";

function overlaps(aStart: string, aEnd: string | undefined, bStart: string, bEnd: string | undefined): boolean {
  const startA = new Date(aStart).getTime();
  const endA = new Date(aEnd ?? "9999-12-31").getTime();
  const startB = new Date(bStart).getTime();
  const endB = new Date(bEnd ?? "9999-12-31").getTime();
  return startA <= endB && startB <= endA;
}

export function detectOwnerDuplicates(taxSubject: TaxSubject): Array<{ ownerIds: string[]; normalizedName: string }> {
  const matches = new Map<string, string[]>();
  for (const owner of taxSubject.owners) {
    const normalizedName = normalizePartyName(owner);
    if (!normalizedName) continue;
    const ids = matches.get(normalizedName) ?? [];
    ids.push(owner.id);
    matches.set(normalizedName, ids);
  }
  return Array.from(matches.entries())
    .filter(([, ownerIds]) => ownerIds.length > 1)
    .map(([normalizedName, ownerIds]) => ({ normalizedName, ownerIds }));
}

export function validateOwners(taxSubject: TaxSubject, ownershipPeriods: OwnershipPeriod[]) {
  const result = emptyValidationResult();
  const ownerIds = new Set(taxSubject.owners.map((owner) => owner.id));
  const duplicates = detectOwnerDuplicates(taxSubject);

  if (duplicates.length > 0) {
    result.blockingErrors.push({
      code: "DUPLICATE_OWNERS_UNRESOLVED",
      message: `Mögliche Dubletten bei Eigentümern erkannt: ${duplicates.map((match) => match.normalizedName).join(", ")}.`,
    });
  }

  const groupedPeriods = new Map<string, OwnershipPeriod[]>();
  for (const period of ownershipPeriods) {
    if (!ownerIds.has(period.ownerId)) {
      result.blockingErrors.push({
        code: "OVERLAPPING_OWNERSHIP_PERIODS_INVALID",
        message: `OwnershipPeriod ${period.id} referenziert unbekannten Owner ${period.ownerId}.`,
      });
      continue;
    }
    const periods = groupedPeriods.get(period.ownerId) ?? [];
    periods.push(period);
    groupedPeriods.set(period.ownerId, periods);
  }

  for (const [ownerId, periods] of groupedPeriods.entries()) {
    const sorted = [...periods].sort((left, right) => left.startDate.localeCompare(right.startDate));
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const current = sorted[index];
      const next = sorted[index + 1];
      if (overlaps(current.startDate, current.endDate, next.startDate, next.endDate)) {
        result.blockingErrors.push({
          code: "OVERLAPPING_OWNERSHIP_PERIODS_INVALID",
          message: `Überlappende OwnershipPeriods für Owner ${ownerId}: ${current.id} und ${next.id}.`,
        });
      }
    }
  }

  if (taxSubject.owners.some((owner) => owner.role === "usufruct_holder" || owner.role === "obligatory_user")) {
    result.reviewFlags.push({
      code: "OWNER_ROLE_REVIEW",
      message: "Nießbrauch-/Nutzungsrechtslage erkannt und sollte geprüft werden.",
    });
  }

  return result;
}
