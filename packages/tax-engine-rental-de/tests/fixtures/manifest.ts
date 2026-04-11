export const REQUIRED_FIXTURES = [
  "single-owner-long-term-basic",
  "single-owner-limited-tax-basic",
  "joint-spouses-direct-rental",
  "co-ownership-direct-split",
  "inheritance-community-assessment",
  "asset-management-gbr-assessment",
  "share-import-v-sonstige",
  "holiday-apartment-no-self-use-manager",
  "holiday-apartment-self-use-review",
  "mixed-use-holiday-apartment",
  "below-market-rent-under-threshold",
  "below-market-rent-forecast-required",
  "acquisition-near-costs-triggered",
  "distributed-maintenance-3-years",
  "distributed-maintenance-sale-acceleration",
  "active-assets-zero-afa-block",
  "duplicate-owners-block",
  "mid-year-share-change",
  "monument-enhanced-depreciation",
  "manual-review-non-rental-regime",
] as const;

export type RequiredFixtureName = typeof REQUIRED_FIXTURES[number];
