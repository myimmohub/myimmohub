export type OwnershipModel =
  | "single_owner"
  | "joint_spouses"
  | "co_ownership"
  | "inheritance_community"
  | "partnership_asset_management"
  | "economic_user_right_holder"
  | "review_required";

export type RentalMode =
  | "long_term_residential"
  | "holiday_short_term"
  | "mixed_use"
  | "below_market_residential"
  | "temporary_vacancy_held_for_rent"
  | "owner_self_use"
  | "reserved_self_use"
  | "review_required";

export type FilingProfile =
  | "est1a_v"
  | "est1a_v_fewo"
  | "est1a_v_sonstige"
  | "est1c_v"
  | "est1c_v_fewo"
  | "est1c_v_sonstige"
  | "est1b_fb_v"
  | "est1b_fb_v_fewo"
  | "fw_optional_side_adapter"
  | "manual_review";

export type IncomeRegime = "section_21_rental" | "review_required";
export type OwnerRole = "legal_owner" | "economic_owner" | "usufruct_holder" | "obligatory_user" | "participant";
export type ResidencyStatus = "unlimited_tax" | "limited_tax" | "application_unlimited_tax" | "unknown_review_required";

export interface Address {
  street1?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
}

export interface Owner {
  id: string;
  role: OwnerRole;
  personType: "natural_person" | "legal_entity";
  title?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  birthDate?: string;
  taxId?: string;
  taxNumber?: string;
  email?: string;
  phone?: string;
  address?: Address;
}

export interface TaxSubject {
  id: string;
  displayName: string;
  subjectKind: "person" | "joint_return" | "assessment_unit";
  ownershipModelHint?: OwnershipModel;
  residencyStatus: ResidencyStatus;
  filingCountry: "DE";
  taxNumber?: string;
  taxOffice?: string;
  owners: Owner[];
}

export interface OwnershipPeriod {
  id: string;
  propertyId: string;
  ownerId: string;
  startDate: string;
  endDate?: string;
  numerator: number;
  denominator: number;
  reason?: "initial" | "sale" | "gift" | "inheritance" | "contract_change" | "manual";
}

export interface Property {
  id: string;
  displayName: string;
  propertyType:
    | "house"
    | "apartment"
    | "condominium"
    | "room"
    | "garage"
    | "parking"
    | "holiday_home"
    | "holiday_apartment"
    | "undeveloped_land"
    | "other_right";
  address?: Address;
  countryCode: string;
  acquisitionDate?: string;
  disposalDate?: string;
  completionDate?: string;
  yearBuilt?: number;
  landRegistryTaxRef?: string;
  livingAreaSqm?: number;
  usableAreaSqm?: number;
  isResidential: boolean;
  isMonument?: boolean;
  isSanierungsgebiet?: boolean;
  heldInBusinessAssets?: boolean;
  usedForHolidayRental?: boolean;
  usedForShortTermRental?: boolean;
}

export interface UsageYear {
  id: string;
  propertyId: string;
  taxYear: number;
  rentalModeHint?: RentalMode;
  totalDays: number;
  selfUseDays?: number;
  reservedSelfUseDays?: number;
  rentalDays?: number;
  vacancyDays?: number;
  qualifyingVacancyDays?: number;
  nonQualifyingVacancyDays?: number;
  localTypicalRentalDays?: number;
  heldAvailableForRent?: boolean;
  thirdPartyBrokerManaged?: boolean;
  selfUseContractuallyExcluded?: boolean;
  relatedPartyRental?: boolean;
  belowMarketRental?: boolean;
  notes?: string;
}

export type RevenueCategory =
  | "cold_rent"
  | "allocated_ancillary_prepayment"
  | "ancillary_refund_negative"
  | "lease_side_income"
  | "parking_rent"
  | "furniture_supplement"
  | "tourist_fee_pass_through"
  | "insurance_reimbursement"
  | "other_income";

export interface RevenueEvent {
  id: string;
  propertyId: string;
  taxYear: number;
  bookingDate: string;
  category: RevenueCategory;
  grossCents: number;
  ownerId?: string;
  sourceRef?: string;
  description?: string;
}

export type ExpenseCategory =
  | "property_tax"
  | "water"
  | "waste"
  | "heating"
  | "chimney"
  | "house_lighting"
  | "caretaker"
  | "insurance"
  | "administration"
  | "bank_fees"
  | "loan_interest"
  | "tax_advisor"
  | "internet"
  | "tourist_tax"
  | "tools_materials"
  | "pest_control"
  | "cosmetic_repair"
  | "maintenance_candidate"
  | "capital_improvement_candidate"
  | "furnishing_candidate"
  | "travel_costs_owner"
  | "other";

export type AllocationMode = "full" | "pro_rata_rental_use" | "by_ownership_share" | "manual_with_reason" | "owner_specific";

export interface ExpenseEvent {
  id: string;
  propertyId: string;
  taxYear: number;
  bookingDate: string;
  invoiceDate?: string;
  vendor?: string;
  description: string;
  amountCents: number;
  vatCents?: number;
  category: ExpenseCategory;
  allocationMode: AllocationMode;
  deductiblePercentOverride?: number;
  ownerId?: string;
  sourceRef?: string;
}

export type AssetType =
  | "building"
  | "building_component"
  | "outdoor_facility"
  | "movable_inventory"
  | "gwg_candidate"
  | "pooled_asset_candidate";

export interface Asset {
  id: string;
  propertyId: string;
  assetType: AssetType;
  description: string;
  acquisitionCostCents: number;
  placedInServiceDate?: string;
  usefulLifeYears?: number;
  depreciationMethodHint?:
    | "linear"
    | "degressive_building"
    | "enhanced_7h"
    | "enhanced_7i"
    | "special_7b"
    | "gwg_immediate"
    | "pooled";
  sourceExpenseIds?: string[];
  sourceRef?: string;
}

export interface MaintenancePlan {
  id: string;
  propertyId: string;
  originTaxYear: number;
  firstDeductionTaxYear: number;
  distributionYears: 2 | 3 | 4 | 5;
  annualShareCents: number;
  originalAmountCents: number;
  sourceExpenseIds: string[];
  status: "active" | "completed" | "accelerated_on_sale_or_end_of_use";
}

export type OwnerSpecificItemCategory = "special_income" | "special_expense" | "carried_share_import" | "other_owner_specific";

export interface OwnerSpecificItem {
  id: string;
  ownerId: string;
  propertyId?: string;
  taxYear: number;
  category: OwnerSpecificItemCategory;
  amountCents: number;
  description: string;
  sourceRef?: string;
}

export interface Loan {
  id: string;
  propertyId: string;
  lender?: string;
  startDate?: string;
  endDate?: string;
  linkedExpenseIds?: string[];
}

export interface EvidenceRef {
  id: string;
  type:
    | "invoice"
    | "bank_transaction"
    | "loan_statement"
    | "market_rent_evidence"
    | "local_typical_rental_days_evidence"
    | "holiday_broker_contract"
    | "certificate_7h"
    | "certificate_7i"
    | "certificate_10f"
    | "ownership_document"
    | "feststellungsbescheid"
    | "other";
  reference: string;
  propertyId?: string;
  ownerId?: string;
}

export interface OverrideEvent {
  id: string;
  kind:
    | "expense_allocation"
    | "market_rent"
    | "local_typical_rental_days"
    | "filling_profile"
    | "policy"
    | "manual_percent";
  targetId: string;
  value: unknown;
  reason: string;
  sourceRef?: string;
}

export interface FilingsContext {
  requestedFilingProfile?: FilingProfile;
  importedShareOnly?: boolean;
  importedShareEvidenceRef?: string;
}

export interface WarningFlag {
  code:
    | "MISSING_OPTIONAL_TAX_ID"
    | "ESTIMATED_MARKET_RENT_USED"
    | "ESTIMATED_LOCAL_TYPICAL_RENTAL_DAYS_USED"
    | "POOLED_ASSET_POLICY_APPLIED"
    | "NON_MATERIAL_ROUNDING_ADJUSTMENT";
  message: string;
}

export interface BlockingError {
  code:
    | "OWNER_SHARES_NOT_100"
    | "OVERLAPPING_OWNERSHIP_PERIODS_INVALID"
    | "USAGE_DAYS_INVALID"
    | "AFA_MISSING_FOR_ACTIVE_ASSETS"
    | "CAPITALIZED_COST_DOUBLE_COUNTED"
    | "MAINTENANCE_PLAN_INCOMPLETE"
    | "ACQUISITION_NEAR_COSTS_NOT_CLASSIFIED"
    | "BELOW_MARKET_RENT_EVIDENCE_MISSING"
    | "TOTAL_SURPLUS_PROGNOSIS_REQUIRED_BUT_MISSING"
    | "DUPLICATE_OWNERS_UNRESOLVED"
    | "FILING_PROFILE_CONFLICT"
    | "FORM_PACK_MISMATCH"
    | "UI_SUMMARY_DIFFERS_FROM_RECOMPUTED_SUMMARY"
    | "MANUAL_OVERRIDE_WITHOUT_REASON"
    | "IMPORTED_SHARE_AND_DIRECT_OBJECT_INPUT_COLLISION";
  message: string;
}

export interface ReviewFlag {
  code:
    | "ASSESSMENT_REQUIREMENT_UNCERTAIN"
    | "INCOME_REGIME_POSSIBLY_NON_RENTAL"
    | "LIMITED_TAX_CONTEXT_NEEDS_CONFIRMATION"
    | "HOLIDAY_APARTMENT_INTENTION_REVIEW"
    | "VACANCY_EVIDENCE_REVIEW"
    | "MONUMENT_CERTIFICATE_REVIEW"
    | "SPECIAL_DEPRECIATION_ELIGIBILITY_REVIEW"
    | "OWNER_ROLE_REVIEW"
    | "MIXED_USE_COMPONENT_SPLIT_REVIEW"
    | "FORM_YEAR_SWITCH_REVIEW";
  message: string;
}

export interface FilingRecommendation {
  filingProfile: FilingProfile;
  requiresAssessment: boolean;
  requiresHolidaySupplement: boolean;
  requiresVSonstige: boolean;
  requiresFWSideAdapter: boolean;
  requiresManualReview: boolean;
}

export interface ClassificationResult {
  ownershipModel: OwnershipModel;
  rentalMode: RentalMode;
  incomeRegime: IncomeRegime;
  filingProfile: FilingProfile;
}

export interface ProvenanceEntry {
  sourceEventIds: string[];
  appliedRuleIds: string[];
  calculationPath: string[];
  policyPackId: string;
  formPackId?: string;
}

export interface FilingPreviewField<T> {
  value: T;
  provenance: string[];
  warnings?: string[];
}

export interface FilingPreview {
  filingProfile: FilingProfile;
  formPackId: string;
  fields: Record<string, FilingPreviewField<unknown>>;
}

export interface FilingPreviewBundle {
  previews: FilingPreview[];
}

export interface AuditEntry {
  timestamp: string;
  actor: "system" | "user";
  action: string;
  targetId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  sourceRef?: string;
}

export interface RevenueTotals {
  byCategory: Record<RevenueCategory, number>;
  totalCents: number;
}

export interface DeductionBucket {
  key: string;
  amountCents: number;
}

export interface DeductionResult {
  immediateExpenseCents: number;
  deductibleExpenseCents: number;
  allocatedExpenseCents: number;
  buckets: DeductionBucket[];
  capitalizedExpenseIds: string[];
  maintenanceCandidateExpenseIds: string[];
}

export interface DepreciationLine {
  assetId: string;
  description: string;
  depreciationMethod: string;
  amountCents: number;
}

export interface DepreciationResult {
  totalCents: number;
  lines: DepreciationLine[];
}

export interface HolidayApartmentResult {
  allocationPercent: number;
  qualifyingRentalUseDays: number;
  reviewFlags: ReviewFlag[];
}

export interface BelowMarketResult {
  rentRelationPercent: number | null;
  requiresForecast: boolean;
  deductibleExpensePercent: number;
  reviewFlags: ReviewFlag[];
  warnings: WarningFlag[];
}

export interface OwnerAllocationLine {
  ownerId: string;
  revenueCents: number;
  expenseCents: number;
  depreciationCents: number;
  specialItemsCents: number;
  resultCents: number;
  sharePercent: number;
}

export interface OwnerAllocationResult {
  lines: OwnerAllocationLine[];
}

export interface CalculationSummary {
  revenueTotals: RevenueTotals;
  deductionResult: DeductionResult;
  depreciationResult: DepreciationResult;
  holidayApartmentResult: HolidayApartmentResult | null;
  belowMarketResult: BelowMarketResult | null;
  maintenancePlans: MaintenancePlan[];
  totalResultCents: number;
}

export interface ProvenanceBundle {
  calculations: Record<string, ProvenanceEntry>;
}

export interface ComputeRentalTaxCaseInput {
  policyPackId: string;
  formPackId?: string;
  taxYear: number;
  taxSubject: TaxSubject;
  properties: Property[];
  usageYears: UsageYear[];
  ownershipPeriods: OwnershipPeriod[];
  revenues: RevenueEvent[];
  expenses: ExpenseEvent[];
  assets: Asset[];
  maintenancePlans: MaintenancePlan[];
  loans: Loan[];
  ownerSpecificItems: OwnerSpecificItem[];
  filingsContext: FilingsContext;
  overrides?: OverrideEvent[];
  evidence?: EvidenceRef[];
}

export interface ComputeRentalTaxCaseOutput {
  status: "ok" | "blocking_error" | "review_required";
  blockingErrors: BlockingError[];
  reviewFlags: ReviewFlag[];
  warnings: WarningFlag[];
  classification: ClassificationResult;
  calculations: CalculationSummary;
  ownerAllocations: OwnerAllocationResult[];
  filingRecommendation: FilingRecommendation;
  filingsPreview: FilingPreviewBundle;
  provenance: ProvenanceBundle;
  auditLog: AuditEntry[];
}
