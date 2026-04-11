import type { Asset, EvidenceRef, Property } from "../../domain/types";
import { emptyValidationResult } from "./common";

export function validateAssets(assets: Asset[], properties: Property[], evidence: EvidenceRef[] = []) {
  const result = emptyValidationResult();
  const evidenceTypes = new Set(evidence.map((item) => item.type));
  const propertyIds = new Set(properties.map((property) => property.id));

  for (const asset of assets) {
    if (!propertyIds.has(asset.propertyId)) {
      result.blockingErrors.push({
        code: "AFA_MISSING_FOR_ACTIVE_ASSETS",
        message: `Asset ${asset.id} referenziert unbekanntes Objekt ${asset.propertyId}.`,
      });
    }
    if ((asset.depreciationMethodHint === "enhanced_7h" || asset.depreciationMethodHint === "enhanced_7i") && !evidenceTypes.has("certificate_7h") && !evidenceTypes.has("certificate_7i")) {
      result.reviewFlags.push({
        code: "MONUMENT_CERTIFICATE_REVIEW",
        message: `Asset ${asset.id} nutzt erhöhte AfA ohne hinterlegte Bescheinigung.`,
      });
    }
    if (asset.depreciationMethodHint === "special_7b") {
      result.reviewFlags.push({
        code: "SPECIAL_DEPRECIATION_ELIGIBILITY_REVIEW",
        message: `Asset ${asset.id} mit §7b-Sonder-AfA sollte geprüft werden.`,
      });
    }
  }

  return result;
}
