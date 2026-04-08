/**
 * Vollständiges Feldmapping Anlage V 2025 (28 Felder).
 * Basis: Anlage V 2025, Fassung 01/2025.
 *
 * Jedes Feld hat:
 * - key: Spaltenname in tax_data
 * - label: Deutsche Bezeichnung
 * - zeile: ELSTER-Zeilennummer
 * - category: Gruppierung (obj/ein/wk/afa/sonder)
 * - type: Datentyp
 */

import type { TaxFieldMeta } from "@/types/tax";

export const TAX_FIELDS: TaxFieldMeta[] = [
  // ── Objekt-Stammdaten (Z. 1-8) ──────────────────────────────────────────────
  { key: "tax_ref",                    label: "Steuernummer Objekt",           zeile: "Z. 1",  category: "obj",    type: "text"    },
  // Z. 2 + Z. 3 kommen aus properties.address (nicht in tax_data gespeichert)
  { key: "ownership_share_pct",        label: "Eigentumsanteil (%)",           zeile: "Z. 4",  category: "obj",    type: "numeric" },
  { key: "property_type",              label: "Art des Objekts",               zeile: "Z. 5",  category: "obj",    type: "text"    },
  { key: "build_year",                 label: "Baujahr",                       zeile: "Z. 6",  category: "obj",    type: "integer" },
  { key: "acquisition_date",           label: "Anschaffungsdatum",             zeile: "Z. 7",  category: "obj",    type: "date"    },
  { key: "acquisition_cost_building",  label: "Anschaffungskosten Gebäude",    zeile: "Z. 8",  category: "obj",    type: "numeric" },

  // ── Einnahmen (Z. 9-14) ─────────────────────────────────────────────────────
  { key: "rent_income",                label: "Mieteinnahmen (ohne Umlagen)",  zeile: "Z. 9",  category: "ein",    type: "numeric" },
  { key: "deposits_received",          label: "Vereinnahmte Kautionen",        zeile: "Z. 10", category: "ein",    type: "numeric" },
  { key: "rent_prior_year",            label: "Mieteinnahmen Vorjahr",         zeile: "Z. 11", category: "ein",    type: "numeric" },
  { key: "operating_costs_income",     label: "Umlagen (Betriebskosten)",      zeile: "Z. 13", category: "ein",    type: "numeric" },
  { key: "other_income",               label: "Sonstige Einnahmen",            zeile: "Z. 14", category: "ein",    type: "numeric" },

  // ── Werbungskosten (Z. 17-53) ───────────────────────────────────────────────
  { key: "loan_interest",              label: "Schuldzinsen",                  zeile: "Z. 17", category: "wk",     type: "numeric" },
  { key: "property_tax",               label: "Grundsteuer",                   zeile: "Z. 19", category: "wk",     type: "numeric" },
  { key: "hoa_fees",                   label: "Hausgeld / WEG-Umlage",        zeile: "Z. 20", category: "wk",     type: "numeric" },
  { key: "insurance",                  label: "Versicherungen",                zeile: "Z. 21", category: "wk",     type: "numeric" },
  { key: "water_sewage",               label: "Wasser / Abwasser",            zeile: "Z. 26", category: "wk",     type: "numeric" },
  { key: "waste_disposal",             label: "Müllabfuhr",                   zeile: "Z. 28", category: "wk",     type: "numeric" },
  { key: "property_management",        label: "Hausverwaltung",                zeile: "Z. 35", category: "wk",     type: "numeric" },
  { key: "bank_fees",                  label: "Kontoführungsgebühren",         zeile: "Z. 37", category: "wk",     type: "numeric" },
  { key: "maintenance_costs",          label: "Erhaltungsaufwand",             zeile: "Z. 40", category: "wk",     type: "numeric" },
  { key: "other_expenses",             label: "Sonstige Werbungskosten",       zeile: "Z. 53", category: "wk",     type: "numeric" },

  // ── AfA (Z. 33-36) ─────────────────────────────────────────────────────────
  { key: "depreciation_building",      label: "AfA Gebäude (2% linear)",       zeile: "Z. 33", category: "afa",    type: "numeric" },
  { key: "depreciation_outdoor",       label: "AfA Außenanlagen",             zeile: "Z. 34", category: "afa",    type: "numeric" },
  { key: "depreciation_fixtures",      label: "AfA Einbauküche / Ausstattung", zeile: "Z. 36", category: "afa",    type: "numeric" },

  // ── Sonderwerbungskosten (Z. 60-61) ─────────────────────────────────────────
  { key: "special_deduction_7b",       label: "Sonderwerbungskosten §7b EStG", zeile: "Z. 60", category: "sonder", type: "numeric" },
  { key: "special_deduction_renovation", label: "Sonderabschreibung Sanierung", zeile: "Z. 61", category: "sonder", type: "numeric" },
];

/** Gruppierte Felder nach Kategorie */
export const TAX_FIELD_GROUPS = [
  { key: "obj",    label: "Objekt-Stammdaten",      color: "slate"   },
  { key: "ein",    label: "Einnahmen",               color: "emerald" },
  { key: "wk",     label: "Werbungskosten",          color: "red"     },
  { key: "afa",    label: "Abschreibung (AfA)",      color: "blue"    },
  { key: "sonder", label: "Sonderwerbungskosten",    color: "purple"  },
] as const;

/** Felder nach Kategorie filtern */
export function getFieldsByCategory(category: TaxFieldMeta["category"]): TaxFieldMeta[] {
  return TAX_FIELDS.filter((f) => f.category === category);
}

/** Mapping: Anlage-V-Zeile → tax_data-Feld (für Transaction-Aggregation) */
export const ZEILE_TO_FIELD: Record<string, keyof import("@/types/tax").TaxData> = {
  "Z. 9":  "rent_income",
  "Z. 10": "deposits_received",
  "Z. 11": "rent_prior_year",
  "Z. 13": "operating_costs_income",
  "Z. 14": "other_income",
  "Z. 17": "loan_interest",
  "Z. 19": "property_tax",
  "Z. 20": "hoa_fees",
  "Z. 21": "insurance",
  "Z. 26": "water_sewage",
  "Z. 28": "waste_disposal",
  "Z. 35": "property_management",
  "Z. 37": "bank_fees",
  "Z. 40": "maintenance_costs",
  "Z. 47": "property_tax",
  "Z. 48": "insurance",       // Betriebskosten/Versicherungen teilen sich Z. 48
  "Z. 53": "other_expenses",
};

/** Alle numerischen Felder die aus Transaktionen berechnet werden können */
export const CALCULABLE_FIELDS = TAX_FIELDS
  .filter((f) => f.type === "numeric" && (f.category === "ein" || f.category === "wk"))
  .map((f) => f.key);
