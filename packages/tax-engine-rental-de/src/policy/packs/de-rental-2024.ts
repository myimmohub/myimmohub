import { LEGAL_BASELINE } from "../legal-baseline";
import type { TaxPolicyPack } from "../policy-types";

export const DE_RENTAL_2024: TaxPolicyPack = {
  id: "de-rental-2024",
  legalSnapshotDate: "2024-12-31",
  formPackCompatibility: ["elster-income-2024", "elster-assessment-2024"],
  lawReferenceMap: { ...LEGAL_BASELINE },
  thresholds: {
    belowMarketSplitPercent: 66,
    acquisitionNearCostPercent: 15,
    acquisitionNearWindowMonths: 36,
    gwgImmediateMaxCents: 80000,
    gwgPoolMinCents: 25001,
    gwgPoolMaxCents: 100000,
  },
  defaultForecastConfig: {
    totalSurplusForecastHorizonYears: 30,
    allowManualForecastOverrideWithReason: true,
  },
  buildingDepreciationRules: [
    { toYearBuilt: 1924, method: "linear", annualRatePercent: 2.5 },
    { fromYearBuilt: 1925, toYearBuilt: 2022, method: "linear", annualRatePercent: 2 },
    { fromYearBuilt: 2023, method: "linear", annualRatePercent: 3 },
  ],
  movableAssetRules: [
    { assetType: "movable_inventory", usefulLifeYears: 10 },
    { assetType: "gwg_candidate", usefulLifeYears: 1 },
    { assetType: "pooled_asset_candidate", usefulLifeYears: 5 },
  ],
  holidayApartmentRules: {
    vacancyRequiresEvidence: true,
    allowPositivePresumptionWithManager: true,
    localTypicalRentalDaysRequired: true,
  },
  maintenanceRules: {
    distributionYearsAllowed: [2, 3, 4, 5],
    accelerateOnSale: true,
  },
  filingRules: {
    directProfiles: ["est1a_v", "est1a_v_fewo", "est1a_v_sonstige", "est1c_v", "est1c_v_fewo", "est1c_v_sonstige"],
    assessmentProfiles: ["est1b_fb_v", "est1b_fb_v_fewo"],
    limitedTaxProfiles: ["est1c_v", "est1c_v_fewo", "est1c_v_sonstige"],
  },
  validationRules: {
    requireUsageDayConsistency: true,
    requireOwnerShares100: true,
  },
  reviewRules: {
    blockPossibleBusinessCases: true,
    requireEvidenceForBelowMarket: true,
  },
  featureFlags: {
    enableHolidaySupplement: true,
    enableFwAdapter: true,
  },
};
