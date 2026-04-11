export const OWNERSHIP_MODELS = [
  "single_owner",
  "joint_spouses",
  "co_ownership",
  "inheritance_community",
  "partnership_asset_management",
  "economic_user_right_holder",
  "review_required",
] as const;

export const RENTAL_MODES = [
  "long_term_residential",
  "holiday_short_term",
  "mixed_use",
  "below_market_residential",
  "temporary_vacancy_held_for_rent",
  "owner_self_use",
  "reserved_self_use",
  "review_required",
] as const;

export const FILING_PROFILES = [
  "est1a_v",
  "est1a_v_fewo",
  "est1a_v_sonstige",
  "est1c_v",
  "est1c_v_fewo",
  "est1c_v_sonstige",
  "est1b_fb_v",
  "est1b_fb_v_fewo",
  "fw_optional_side_adapter",
  "manual_review",
] as const;

export const INCOME_REGIMES = [
  "section_21_rental",
  "review_required",
] as const;

export const OWNER_ROLES = [
  "legal_owner",
  "economic_owner",
  "usufruct_holder",
  "obligatory_user",
  "participant",
] as const;

export const RESIDENCY_STATUSES = [
  "unlimited_tax",
  "limited_tax",
  "application_unlimited_tax",
  "unknown_review_required",
] as const;
