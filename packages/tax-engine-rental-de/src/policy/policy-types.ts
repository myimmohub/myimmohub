import type { FilingProfile } from "../domain/types";

export interface BuildingDepreciationRule {
  fromYearBuilt?: number;
  toYearBuilt?: number;
  method: "linear" | "degressive_building";
  annualRatePercent: number;
}

export interface MovableAssetRule {
  assetType: "movable_inventory" | "gwg_candidate" | "pooled_asset_candidate";
  usefulLifeYears: number;
}

export interface HolidayApartmentRuleSet {
  vacancyRequiresEvidence: boolean;
  allowPositivePresumptionWithManager: boolean;
  localTypicalRentalDaysRequired: boolean;
}

export interface MaintenanceRuleSet {
  distributionYearsAllowed: Array<2 | 3 | 4 | 5>;
  accelerateOnSale: boolean;
}

export interface FilingRuleSet {
  directProfiles: FilingProfile[];
  assessmentProfiles: FilingProfile[];
  limitedTaxProfiles: FilingProfile[];
}

export interface ValidationRuleSet {
  requireUsageDayConsistency: boolean;
  requireOwnerShares100: boolean;
}

export interface ReviewRuleSet {
  blockPossibleBusinessCases: boolean;
  requireEvidenceForBelowMarket: boolean;
}

export interface TaxPolicyPack {
  id: string;
  legalSnapshotDate: string;
  formPackCompatibility: string[];
  lawReferenceMap: Record<string, string>;
  thresholds: {
    belowMarketSplitPercent: number;
    acquisitionNearCostPercent: number;
    acquisitionNearWindowMonths: number;
    gwgImmediateMaxCents?: number;
    gwgPoolMinCents?: number;
    gwgPoolMaxCents?: number;
  };
  defaultForecastConfig: {
    totalSurplusForecastHorizonYears: number;
    allowManualForecastOverrideWithReason: boolean;
  };
  buildingDepreciationRules: BuildingDepreciationRule[];
  movableAssetRules: MovableAssetRule[];
  holidayApartmentRules: HolidayApartmentRuleSet;
  maintenanceRules: MaintenanceRuleSet;
  filingRules: FilingRuleSet;
  validationRules: ValidationRuleSet;
  reviewRules: ReviewRuleSet;
  featureFlags?: Record<string, boolean>;
}
