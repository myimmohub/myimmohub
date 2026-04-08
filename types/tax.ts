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
