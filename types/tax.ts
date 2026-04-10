/**
 * ELSTER-Modul: TypeScript-Typen für Anlage V Steuerdaten.
 */

export type TaxConfidence = "high" | "medium" | "low";

export interface TaxData {
  id: string;
  property_id: string;
  tax_year: number;
  created_at?: string;
  updated_at?: string;

  // Objekt-Stammdaten (Z. 1-8)
  tax_ref?: string | null;
  ownership_share_pct?: number | null;
  property_type?: string | null;
  build_year?: number | null;
  acquisition_date?: string | null;
  acquisition_cost_building?: number | null;

  // Einnahmen (Z. 9-14)
  rent_income?: number | null;
  deposits_received?: number | null;
  rent_prior_year?: number | null;
  operating_costs_income?: number | null;
  other_income?: number | null;

  // Werbungskosten (Z. 17-53)
  loan_interest?: number | null;
  property_tax?: number | null;
  hoa_fees?: number | null;
  insurance?: number | null;
  water_sewage?: number | null;
  waste_disposal?: number | null;
  property_management?: number | null;
  bank_fees?: number | null;
  maintenance_costs?: number | null;
  other_expenses?: number | null;

  // AfA (Z. 33-36)
  depreciation_building?: number | null;
  depreciation_outdoor?: number | null;
  depreciation_fixtures?: number | null;

  // Sonderwerbungskosten (Z. 60-61)
  special_deduction_7b?: number | null;
  special_deduction_renovation?: number | null;

  // Import-Metadaten
  import_source?: "pdf_import" | "manual" | "calculated" | null;
  import_confidence?: Record<string, TaxConfidence> | null;
}

/** Numerische Felder die aus Transaktionen berechenbar sind */
export type TaxNumericField = Extract<
  keyof TaxData,
  | "rent_income" | "deposits_received" | "rent_prior_year"
  | "operating_costs_income" | "other_income"
  | "loan_interest" | "property_tax" | "hoa_fees" | "insurance"
  | "water_sewage" | "waste_disposal" | "property_management"
  | "bank_fees" | "maintenance_costs" | "other_expenses"
  | "depreciation_building" | "depreciation_outdoor" | "depreciation_fixtures"
  | "special_deduction_7b" | "special_deduction_renovation"
  | "ownership_share_pct" | "acquisition_cost_building"
>;

/** Metadaten für ein einzelnes Feld in der Anlage V */
export interface TaxFieldMeta {
  key: keyof TaxData;
  label: string;
  zeile: string;
  category: "obj" | "ein" | "wk" | "afa" | "sonder";
  type: "text" | "numeric" | "integer" | "date";
}

export interface GbrPartnerTaxBreakdown {
  partner_id: string;
  partner_name: string;
  email: string | null;
  anteil_pct: number;
  rent_income: number;
  deposits_received: number;
  rent_prior_year: number;
  operating_costs_income: number;
  other_income: number;
  total_income: number;
  loan_interest: number;
  property_tax: number;
  hoa_fees: number;
  insurance: number;
  water_sewage: number;
  waste_disposal: number;
  property_management: number;
  bank_fees: number;
  maintenance_costs: number;
  other_expenses: number;
  total_expenses: number;
  depreciation_total: number;
  special_deductions_total: number;
  partner_special_expenses: number;
  result_before_partner_adjustments: number;
  result: number;
}

export interface GbrPartnerTaxData {
  id: string;
  gbr_partner_id: string;
  tax_year: number;
  special_expenses: number;
  note?: string | null;
}

export type TaxDepreciationItemType = "building" | "outdoor" | "movable_asset";

export interface TaxDepreciationItem {
  id: string;
  property_id: string;
  tax_year: number;
  item_type: TaxDepreciationItemType;
  label: string;
  gross_annual_amount: number;
  apply_rental_ratio: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TaxMaintenanceDistributionItem {
  id: string;
  property_id: string;
  source_year: number;
  label: string;
  total_amount: number;
  classification: "maintenance_expense" | "production_cost" | "depreciation";
  deduction_mode: "immediate" | "distributed";
  distribution_years: number;
  current_year_share_override?: number | null;
  apply_rental_ratio: boolean;
  status: "active" | "completed";
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ComputedTaxDepreciationItem extends TaxDepreciationItem {
  tax_field: "depreciation_building" | "depreciation_outdoor" | "depreciation_fixtures";
  deductible_amount_elster: number;
}

export interface ComputedTaxMaintenanceDistributionItem extends TaxMaintenanceDistributionItem {
  current_year_share: number;
  deductible_amount_elster: number;
  affects_tax_year: boolean;
  tax_field: "maintenance_costs" | "depreciation_building" | "depreciation_fixtures";
  effective_classification: "maintenance_expense" | "production_cost" | "depreciation";
  auto_switched_to_afa: boolean;
}

export interface StructuredTaxLineTotals {
  depreciation_building: number | null;
  depreciation_outdoor: number | null;
  depreciation_fixtures: number | null;
  maintenance_costs: number | null;
}

export interface StructuredTaxWarning {
  code: "classification_required" | "distribution_is_optional" | "acquisition_related_costs";
  message: string;
}

export interface GbrTaxReport {
  tax_year: number;
  property_id: string;
  property_name: string | null;
  property_address: string | null;
  is_gbr: boolean;
  warnings: string[];
  tax_data: TaxData;
  gbr: {
    name: string;
    steuernummer: string;
    finanzamt: string;
    feststellungserklaerung: boolean;
    sonder_werbungskosten: boolean;
    teilweise_eigennutzung: boolean;
    partner_count: number;
    partner_total_share_pct: number;
    eigennutzung_tage: number;
    gesamt_tage: number;
    rental_share_pct: number;
    rental_share_source: "auto" | "override";
  };
  fe: {
    total_income: number;
    total_expenses: number;
    depreciation_total: number;
    special_deductions_total: number;
    collective_result: number;
    partner_special_expenses_total: number;
    final_result: number;
  };
  fb: GbrPartnerTaxBreakdown[];
  logic: {
    depreciation_items: ComputedTaxDepreciationItem[];
    maintenance_distributions: ComputedTaxMaintenanceDistributionItem[];
    line_totals: StructuredTaxLineTotals;
    warnings: StructuredTaxWarning[];
  };
}
