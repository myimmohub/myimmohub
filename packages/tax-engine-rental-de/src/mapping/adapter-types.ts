import type { FilingPreview, FilingProfile } from "../domain/types";

export type FilingAdapter = {
  id: FilingProfile;
  formPackId: string;
  map(input: {
    resultCents: number;
    revenueCents: number;
    expenseCents: number;
    depreciationCents: number;
    propertyName?: string;
  }): FilingPreview;
};
