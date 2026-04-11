import type { Asset, DepreciationLine, DepreciationResult, Property } from "../../domain/types";
import type { TaxPolicyPack } from "../../policy/policy-types";
import { computeEnhancedDepreciation } from "./enhanced";
import { computeSpecialDepreciation } from "./special";

export function computeBuildingDepreciation(args: {
  assets: Asset[];
  property: Property;
  taxYear: number;
  policy: TaxPolicyPack;
}): DepreciationResult {
  const lines: DepreciationLine[] = [];
  for (const asset of args.assets.filter((candidate) => candidate.assetType === "building" || candidate.assetType === "building_component" || candidate.assetType === "outdoor_facility")) {
    const enhanced = computeEnhancedDepreciation(asset);
    if (enhanced) {
      lines.push(enhanced);
      continue;
    }
    const special = computeSpecialDepreciation(asset);
    if (special) {
      lines.push(special);
      continue;
    }
    const yearBuilt = args.property.yearBuilt ?? args.taxYear;
    const rule = args.policy.buildingDepreciationRules.find((candidate) =>
      (candidate.fromYearBuilt == null || yearBuilt >= candidate.fromYearBuilt) &&
      (candidate.toYearBuilt == null || yearBuilt <= candidate.toYearBuilt),
    ) ?? args.policy.buildingDepreciationRules[args.policy.buildingDepreciationRules.length - 1];
    const amountCents = Math.round(asset.acquisitionCostCents * rule.annualRatePercent / 100);
    lines.push({
      assetId: asset.id,
      description: asset.description,
      depreciationMethod: rule.method,
      amountCents,
    });
  }
  return { totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0), lines };
}
