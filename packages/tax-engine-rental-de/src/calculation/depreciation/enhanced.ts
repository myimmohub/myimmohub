import type { Asset, DepreciationLine } from "../../domain/types";

function annualize(costCents: number, percent: number): number {
  return Math.round((costCents * percent) / 100);
}

export function computeEnhancedDepreciation(asset: Asset): DepreciationLine | null {
  if (asset.depreciationMethodHint !== "enhanced_7h" && asset.depreciationMethodHint !== "enhanced_7i") {
    return null;
  }
  const rate = asset.depreciationMethodHint === "enhanced_7h" ? 9 : 9;
  return {
    assetId: asset.id,
    description: asset.description,
    depreciationMethod: asset.depreciationMethodHint,
    amountCents: annualize(asset.acquisitionCostCents, rate),
  };
}
