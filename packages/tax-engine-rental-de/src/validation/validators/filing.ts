import type { FilingProfile, FilingsContext, OwnershipModel, RentalMode } from "../../domain/types";
import { emptyValidationResult } from "./common";

export function validateFilingContext(args: {
  filingsContext: FilingsContext;
  filingProfile: FilingProfile;
  ownershipModel: OwnershipModel;
  rentalMode: RentalMode;
}) {
  const result = emptyValidationResult();
  const requestedProfile = args.filingsContext.requestedFilingProfile;
  if (requestedProfile && requestedProfile !== args.filingProfile) {
    result.blockingErrors.push({
      code: "FILING_PROFILE_CONFLICT",
      message: `Gewünschtes Filing-Profil ${requestedProfile} kollidiert mit der automatischen Ableitung ${args.filingProfile}.`,
    });
  }
  if (args.ownershipModel === "review_required" || args.rentalMode === "review_required") {
    result.reviewFlags.push({
      code: "ASSESSMENT_REQUIREMENT_UNCERTAIN",
      message: "Filing-Kontext sollte manuell bestätigt werden.",
    });
  }
  return result;
}
