import type { FilingAdapter } from "../adapter-types";

export const EST1A_V_ADAPTER: FilingAdapter = {
  id: "est1a_v",
  formPackId: "elster-income-2025",
  map(input) {
    return {
      filingProfile: "est1a_v",
      formPackId: "elster-income-2025",
      fields: {
        property_name: { value: input.propertyName ?? "Property", provenance: ["classification", "property"] },
        total_revenue_cents: { value: input.revenueCents, provenance: ["revenue"] },
        total_expense_cents: { value: input.expenseCents, provenance: ["expense"] },
        total_depreciation_cents: { value: input.depreciationCents, provenance: ["depreciation"] },
        total_result_cents: { value: input.resultCents, provenance: ["result"] },
      },
    };
  },
};
