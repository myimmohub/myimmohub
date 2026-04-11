import type { FilingProfile, OwnershipModel, RentalMode, ResidencyStatus } from "../domain/types";

export function resolveFilingProfile(args: {
  ownershipModel: OwnershipModel;
  rentalMode: RentalMode;
  residencyStatus: ResidencyStatus;
  importedShareOnly?: boolean;
}): FilingProfile {
  if (args.importedShareOnly) return "est1a_v_sonstige";
  const isAssessment = args.ownershipModel === "partnership_asset_management" || args.ownershipModel === "inheritance_community";
  const isHoliday = args.rentalMode === "holiday_short_term" || args.rentalMode === "mixed_use";
  if (isAssessment) return isHoliday ? "est1b_fb_v_fewo" : "est1b_fb_v";
  if (args.residencyStatus === "limited_tax") return isHoliday ? "est1c_v_fewo" : "est1c_v";
  return isHoliday ? "est1a_v_fewo" : "est1a_v";
}
