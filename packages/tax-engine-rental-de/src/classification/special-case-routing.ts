import type { Property, RentalMode, ReviewFlag, UsageYear } from "../domain/types";

export function resolveRentalMode(usageYears: UsageYear[]): RentalMode {
  const usage = usageYears[0];
  if (!usage) return "review_required";
  if (usage.rentalModeHint) return usage.rentalModeHint;
  if (usage.belowMarketRental || usage.relatedPartyRental) return "below_market_residential";
  if ((usage.selfUseDays ?? 0) > 0 && (usage.rentalDays ?? 0) > 0) return "mixed_use";
  if ((usage.selfUseDays ?? 0) > 0) return "owner_self_use";
  if ((usage.rentalDays ?? 0) > 0 && (usage.vacancyDays ?? 0) > 0 && usage.heldAvailableForRent) return "temporary_vacancy_held_for_rent";
  if ((usage.thirdPartyBrokerManaged || (usage.localTypicalRentalDays ?? 0) > 0) && (usage.rentalDays ?? 0) > 0) return "holiday_short_term";
  if ((usage.rentalDays ?? 0) > 0) return "long_term_residential";
  return "long_term_residential";
}

export function resolveSpecialCaseRouting(properties: Property[], usageYears: UsageYear[]): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  if (properties.some((property) => property.countryCode !== "DE")) {
    flags.push({ code: "INCOME_REGIME_POSSIBLY_NON_RENTAL", message: "Auslandsobjekte benötigen gesonderte Prüfung." });
  }
  if (usageYears.some((usage) => (usage.selfUseDays ?? 0) > 0 && usage.thirdPartyBrokerManaged)) {
    flags.push({ code: "HOLIDAY_APARTMENT_INTENTION_REVIEW", message: "Ferienvermietung mit Eigennutzung und Vermittler sollte auf Einkunftserzielungsabsicht geprüft werden." });
  }
  return flags;
}
