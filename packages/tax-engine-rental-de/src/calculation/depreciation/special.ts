import type { Asset, DepreciationLine } from "../../domain/types";

export function computeSpecialDepreciation(asset: Asset): DepreciationLine | null {
  if (asset.depreciationMethodHint !== "special_7b") return null;
  return {
    assetId: asset.id,
    description: asset.description,
    depreciationMethod: "special_7b",
    amountCents: Math.round(asset.acquisitionCostCents * 0.05),
  };
}
