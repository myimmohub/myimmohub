import type { FilingProfile, OwnershipModel, RentalMode } from "../../src/domain/types";
import { REQUIRED_FIXTURES } from "./manifest";

export interface FixtureDescriptor {
  name: typeof REQUIRED_FIXTURES[number];
  ownershipModel: OwnershipModel;
  rentalMode: RentalMode;
  filingProfile: FilingProfile | "manual_review";
}

export const FIXTURE_CASES: FixtureDescriptor[] = [
  { name: "single-owner-long-term-basic", ownershipModel: "single_owner", rentalMode: "long_term_residential", filingProfile: "est1a_v" },
  { name: "single-owner-limited-tax-basic", ownershipModel: "single_owner", rentalMode: "long_term_residential", filingProfile: "est1c_v" },
  { name: "joint-spouses-direct-rental", ownershipModel: "joint_spouses", rentalMode: "long_term_residential", filingProfile: "est1a_v" },
  { name: "co-ownership-direct-split", ownershipModel: "co_ownership", rentalMode: "long_term_residential", filingProfile: "est1a_v" },
  { name: "inheritance-community-assessment", ownershipModel: "inheritance_community", rentalMode: "long_term_residential", filingProfile: "est1b_fb_v" },
  { name: "asset-management-gbr-assessment", ownershipModel: "partnership_asset_management", rentalMode: "long_term_residential", filingProfile: "est1b_fb_v" },
  { name: "share-import-v-sonstige", ownershipModel: "single_owner", rentalMode: "long_term_residential", filingProfile: "est1a_v_sonstige" },
  { name: "holiday-apartment-no-self-use-manager", ownershipModel: "single_owner", rentalMode: "holiday_short_term", filingProfile: "est1a_v_fewo" },
  { name: "holiday-apartment-self-use-review", ownershipModel: "single_owner", rentalMode: "mixed_use", filingProfile: "est1a_v_fewo" },
  { name: "mixed-use-holiday-apartment", ownershipModel: "single_owner", rentalMode: "mixed_use", filingProfile: "est1a_v_fewo" },
  { name: "below-market-rent-under-threshold", ownershipModel: "single_owner", rentalMode: "below_market_residential", filingProfile: "est1a_v" },
  { name: "below-market-rent-forecast-required", ownershipModel: "single_owner", rentalMode: "below_market_residential", filingProfile: "manual_review" },
  { name: "acquisition-near-costs-triggered", ownershipModel: "single_owner", rentalMode: "long_term_residential", filingProfile: "manual_review" },
  { name: "distributed-maintenance-3-years", ownershipModel: "single_owner", rentalMode: "long_term_residential", filingProfile: "est1a_v" },
  { name: "distributed-maintenance-sale-acceleration", ownershipModel: "single_owner", rentalMode: "long_term_residential", filingProfile: "est1a_v" },
  { name: "active-assets-zero-afa-block", ownershipModel: "single_owner", rentalMode: "long_term_residential", filingProfile: "manual_review" },
  { name: "duplicate-owners-block", ownershipModel: "co_ownership", rentalMode: "long_term_residential", filingProfile: "manual_review" },
  { name: "mid-year-share-change", ownershipModel: "co_ownership", rentalMode: "long_term_residential", filingProfile: "est1a_v" },
  { name: "monument-enhanced-depreciation", ownershipModel: "single_owner", rentalMode: "long_term_residential", filingProfile: "est1a_v" },
  { name: "manual-review-non-rental-regime", ownershipModel: "review_required", rentalMode: "review_required", filingProfile: "manual_review" },
];
