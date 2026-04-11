import type { OwnershipModel, TaxSubject } from "../domain/types";

export function resolveOwnershipModel(taxSubject: TaxSubject): OwnershipModel {
  if (taxSubject.ownershipModelHint) return taxSubject.ownershipModelHint;
  if (taxSubject.subjectKind === "assessment_unit") return "partnership_asset_management";
  if (taxSubject.owners.length <= 1) return "single_owner";
  if (taxSubject.owners.every((owner) => owner.role === "participant")) return "partnership_asset_management";
  if (taxSubject.owners.length === 2) return "joint_spouses";
  return "co_ownership";
}
