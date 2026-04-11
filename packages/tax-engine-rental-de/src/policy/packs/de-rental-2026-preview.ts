import { DE_RENTAL_2025 } from "./de-rental-2025";

export const DE_RENTAL_2026_PREVIEW = {
  ...DE_RENTAL_2025,
  id: "de-rental-2026-preview",
  legalSnapshotDate: "2026-12-31",
  featureFlags: {
    ...DE_RENTAL_2025.featureFlags,
    previewYear: true,
  },
};
