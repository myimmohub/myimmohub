import type { Asset, DepreciationLine, DepreciationResult } from "../../domain/types";
import type { TaxPolicyPack } from "../../policy/policy-types";

export function computeMovableAssetDepreciation(args: { assets: Asset[]; policy: TaxPolicyPack }): DepreciationResult {
  const lines: DepreciationLine[] = [];
  for (const asset of args.assets.filter((candidate) => candidate.assetType === "movable_inventory" || candidate.assetType === "gwg_candidate" || candidate.assetType === "pooled_asset_candidate")) {
    const usefulLife = asset.usefulLifeYears
      ?? args.policy.movableAssetRules.find((rule) =>
        (asset.assetType === "movable_inventory" && rule.assetType === "movable_inventory") ||
        (asset.assetType === "gwg_candidate" && rule.assetType === "gwg_candidate") ||
        (asset.assetType === "pooled_asset_candidate" && rule.assetType === "pooled_asset_candidate"),
      )?.usefulLifeYears
      ?? 10;
    lines.push({
      assetId: asset.id,
      description: asset.description,
      depreciationMethod: asset.depreciationMethodHint ?? "linear",
      amountCents: asset.depreciationMethodHint === "gwg_immediate" ? asset.acquisitionCostCents : Math.round(asset.acquisitionCostCents / usefulLife),
    });
  }
  return { totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0), lines };
}
