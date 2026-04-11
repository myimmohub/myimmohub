import type { ComputeRentalTaxCaseInput, FilingProfile, OwnershipModel, RentalMode } from "../domain/types";
import { mergeValidationResults } from "./validators/common";
import { validateAssets } from "./validators/assets";
import { validateExpenses } from "./validators/expenses";
import { validateFilingContext } from "./validators/filing";
import { validateMaintenance } from "./validators/maintenance";
import { validateOwners } from "./validators/owners";
import { validateRevenues } from "./validators/revenues";
import { validateUsage } from "./validators/usage";

export function validateBlockingAndReview(args: {
  input: ComputeRentalTaxCaseInput;
  ownershipModel: OwnershipModel;
  rentalMode: RentalMode;
  filingProfile: FilingProfile;
}) {
  return mergeValidationResults(
    validateOwners(args.input.taxSubject, args.input.ownershipPeriods),
    validateUsage(args.input.usageYears, args.input.evidence),
    validateRevenues(args.input.revenues, args.input.taxYear),
    validateExpenses(args.input.expenses),
    validateAssets(args.input.assets, args.input.properties, args.input.evidence),
    validateMaintenance(args.input.maintenancePlans),
    validateFilingContext({
      filingsContext: args.input.filingsContext,
      filingProfile: args.filingProfile,
      ownershipModel: args.ownershipModel,
      rentalMode: args.rentalMode,
    }),
  );
}
