import type { HolidayApartmentResult, ReviewFlag, UsageYear } from "../domain/types";

export function computeHolidayApartmentResult(usage: UsageYear): HolidayApartmentResult {
  const reviewFlags: ReviewFlag[] = [];
  const selfUseDays = usage.selfUseDays ?? 0;
  const rentalDays = usage.rentalDays ?? 0;
  const qualifyingVacancyDays = usage.qualifyingVacancyDays ?? 0;
  const qualifyingRentalUseDays = rentalDays + qualifyingVacancyDays;
  const allocationPercent = usage.totalDays > 0 ? qualifyingRentalUseDays / usage.totalDays : 0;

  if (selfUseDays + rentalDays + (usage.vacancyDays ?? 0) !== usage.totalDays) {
    reviewFlags.push({
      code: "VACANCY_EVIDENCE_REVIEW",
      message: "Nutzungstage sind nicht konsistent; Ferienwohnungslogik sollte geprüft werden.",
    });
  }
  if (selfUseDays > 0) {
    reviewFlags.push({
      code: "HOLIDAY_APARTMENT_INTENTION_REVIEW",
      message: "Eigennutzung in einer Ferienwohnung erfordert Prüfung der Einkunftserzielungsabsicht.",
    });
  }

  return {
    allocationPercent,
    qualifyingRentalUseDays,
    reviewFlags,
  };
}
