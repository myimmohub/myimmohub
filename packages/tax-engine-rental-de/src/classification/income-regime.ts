import type { IncomeRegime, Property } from "../domain/types";

export function resolveIncomeRegime(properties: Property[]): IncomeRegime {
  if (properties.some((property) => property.heldInBusinessAssets)) return "review_required";
  return "section_21_rental";
}
