/**
 * Berechnet tax_data-Felder aus vorhandenen Transaktionen.
 *
 * Mapping-Strategie:
 * 1. Kategorie-Label → tax_data-Feld (primär, über CATEGORY_TO_FIELD)
 * 2. Kategorie-Gruppe → tax_data-Feld (Fallback für unbekannte Labels)
 * 3. anlage_v_zeile auf der Transaktion (Legacy-Fallback)
 */

import type { TaxData } from "@/types/tax";

type Transaction = {
  date: string;
  amount: number;
  category: string | null;
  anlage_v_zeile: number | null;
};

type PropertyForTax = {
  kaufpreis: number | null;
  gebaeudewert: number | null;
  baujahr: number | null;
  afa_satz: number | null;       // dezimal, z. B. 0.02
  kaufdatum: string | null;
  address: string | null;
  type: string | null;
  ownership_share_pct?: number | null;
};

type DbCategory = {
  label: string;
  typ: string;
  anlage_v: string | null;
  gruppe: string;
};

// ── Direktes Mapping: Kategorie-Label → tax_data-Feld ───────────────────────

const CATEGORY_TO_FIELD: Record<string, keyof TaxData> = {
  // Einnahmen
  "Mieteinnahmen":                    "rent_income",
  "Ferienvermietung – Einnahmen":     "rent_income",
  "Nebenkostenerstattungen":          "operating_costs_income",
  "Sonstige Einnahmen":               "other_income",

  // Gebäude
  "Grundsteuer":                      "property_tax",
  "Versicherungen":                   "insurance",
  "Hausverwaltung / WEG-Kosten":      "hoa_fees",

  // Instandhaltung
  "Handwerkerleistungen":             "maintenance_costs",
  "Hausmeisterdienste":               "maintenance_costs",
  "Materialkosten":                   "maintenance_costs",

  // Betriebskosten
  "Energieversorgung":                "other_expenses",
  "Wasser & Abwasser":               "water_sewage",
  "Müllentsorgung":                   "waste_disposal",
  "Internet / Telefon / TV":          "other_expenses",

  // Finanzierung
  "Kreditzinsen / Schuldzinsen":      "loan_interest",
  "Kontoführungsgebühren":            "bank_fees",

  // Verwaltung
  "Steuerberatung / Rechtskosten":    "other_expenses",
  "Inserate & Vermarktung":           "other_expenses",
  "Fahrtkosten":                      "other_expenses",
  "Bürokosten / Verwaltungsaufwand":  "other_expenses",

  // Einrichtung
  "Einrichtung / Möbel":             "other_expenses",
  "Haushaltsbedarf / Kleinausstattung": "other_expenses",

  // Ferienimmobilie
  "Kurtaxe / Tourismusabgaben":       "other_expenses",
  "Plattformprovisionen / Agentur":   "other_expenses",
  "Reinigungskosten (Gästewechsel)":  "other_expenses",
  "Schlüsselübergabe / Check-in-Service": "other_expenses",
  "Gästewäsche / Bettwäsche-Service": "other_expenses",
  "Ferienhausverwaltung vor Ort":     "property_management",
  "Verbrauchsmaterialien für Gäste":  "other_expenses",
  "GEMA / Rundfunkbeitrag":           "other_expenses",
};

// ── Fallback: Gruppe → tax_data-Feld ────────────────────────────────────────

const GRUPPE_TO_FIELD: Record<string, keyof TaxData> = {
  "Einnahmen":       "other_income",
  "Gebäude":         "other_expenses",
  "Instandhaltung":  "maintenance_costs",
  "Betriebskosten":  "other_expenses",
  "Einrichtung":     "other_expenses",
  "Finanzierung":    "loan_interest",
  "Ferienimmobilie": "other_expenses",
  "Verwaltung":      "other_expenses",
  "Sonstiges":       "other_expenses",
};

// ── Fallback: Zeile → tax_data-Feld (für Legacy-Transaktionen mit anlage_v_zeile) ──

const ZEILE_TO_FIELD: Record<number, keyof TaxData> = {
  9:  "rent_income",
  10: "deposits_received",
  11: "rent_prior_year",
  13: "operating_costs_income",
  14: "other_income",
  17: "loan_interest",
  19: "property_tax",
  20: "hoa_fees",
  21: "insurance",
  26: "water_sewage",
  28: "waste_disposal",
  33: "depreciation_building",
  35: "property_management",
  37: "bank_fees",
  40: "maintenance_costs",
  45: "insurance",
  46: "property_management",
  47: "property_tax",
  48: "other_expenses",
  53: "other_expenses",
};

// ── Alte Slug-Kategorien (Abwärtskompatibilität) ────────────────────────────

const OLD_SLUG_TO_FIELD: Record<string, keyof TaxData> = {
  "miete_einnahmen_wohnen":    "rent_income",
  "miete_einnahmen_gewerbe":   "rent_income",
  "nebenkosten_einnahmen":     "operating_costs_income",
  "mietsicherheit_einnahme":   "deposits_received",
  "sonstige_einnahmen":        "other_income",
  "schuldzinsen":              "loan_interest",
  "grundsteuer":               "property_tax",
  "versicherungen":            "insurance",
  "erhaltungsaufwand":         "maintenance_costs",
  "verwaltungskosten":         "property_management",
  "betriebskosten":            "other_expenses",
  "geldbeschaffungskosten":    "bank_fees",
  "reinigung":                 "other_expenses",
  "maklerkosten":              "other_expenses",
  "fahrtkosten":               "other_expenses",
  "rechtskosten":              "other_expenses",
  "sonstiges_werbungskosten":  "other_expenses",
  "tilgung_kredit":            "other_expenses",
  "mietsicherheit_ausgabe":    "other_expenses",
  "sonstiges_nicht_absetzbar": "other_expenses",
};

/**
 * Berechnet AfA basierend auf Property-Daten.
 */
export function calculateDepreciation(property: PropertyForTax): number {
  const afaBasis = (property.gebaeudewert != null && property.gebaeudewert > 0)
    ? property.gebaeudewert
    : property.kaufpreis ?? 0;

  if (afaBasis <= 0) return 0;

  let satz = property.afa_satz ?? 0;
  if (satz === 0 && property.baujahr) {
    if (property.baujahr < 1925) satz = 0.025;
    else if (property.baujahr <= 2022) satz = 0.02;
    else satz = 0.03;
  }

  return Math.round(afaBasis * satz * 100) / 100;
}

/**
 * Bestimmt das tax_data-Feld für eine Transaktion.
 * Priorität: Label → Alte Slugs → anlage_v-Zeile aus DB → Gruppe → anlage_v_zeile auf TX
 */
function resolveField(
  cat: string,
  anlageVZeile: number | null,
  dbCatMap: Map<string, DbCategory>,
): keyof TaxData | null {
  // 1. Direkt über Label (hardcoded Mapping)
  if (CATEGORY_TO_FIELD[cat]) return CATEGORY_TO_FIELD[cat];

  // 2. Alte Slugs
  if (OLD_SLUG_TO_FIELD[cat]) return OLD_SLUG_TO_FIELD[cat];

  const dbCat = dbCatMap.get(cat);
  if (dbCat) {
    // "nicht absetzbar" → überspringen
    if (dbCat.anlage_v === "nicht absetzbar") return null;

    // 3. anlage_v-Zeile aus der DB-Kategorie (präzisestes Mapping, z. B. "Z. 19" → property_tax)
    if (dbCat.anlage_v) {
      const zeileNum = parseInt(dbCat.anlage_v.replace("Z. ", "").trim(), 10);
      if (!isNaN(zeileNum) && ZEILE_TO_FIELD[zeileNum]) {
        return ZEILE_TO_FIELD[zeileNum];
      }
    }

    // 4. Fallback: Gruppe → generisches Feld
    if (GRUPPE_TO_FIELD[dbCat.gruppe]) return GRUPPE_TO_FIELD[dbCat.gruppe];
  }

  // 4. anlage_v_zeile auf der Transaktion
  if (anlageVZeile && ZEILE_TO_FIELD[anlageVZeile]) {
    return ZEILE_TO_FIELD[anlageVZeile];
  }

  return null;
}

/**
 * Berechnet alle tax_data-Felder aus Transaktionen einer Immobilie.
 */
export function calculateTaxFromTransactions(
  transactions: Transaction[],
  property: PropertyForTax,
  taxYear: number,
  dbCategories?: DbCategory[],
): Partial<TaxData> {
  const von = `${taxYear}-01-01`;
  const bis = `${taxYear}-12-31`;

  // Nur kategorisierte Transaktionen im Steuerjahr
  const relevant = transactions.filter(
    (t) => t.date >= von && t.date <= bis && t.category != null && t.category !== "aufgeteilt",
  );

  // DB-Kategorien als Map: label → DbCategory
  const dbCatMap = new Map<string, DbCategory>();
  if (dbCategories) {
    for (const cat of dbCategories) {
      dbCatMap.set(cat.label, cat);
    }
  }

  // Aggregation
  const result: Record<string, number> = {};

  for (const tx of relevant) {
    const amount = Number(tx.amount);
    const cat = tx.category!;

    const fieldKey = resolveField(cat, tx.anlage_v_zeile, dbCatMap);
    if (!fieldKey) continue; // nicht absetzbar oder nicht zuordbar

    // Einnahme → positiv addieren, Ausgabe → abs addieren
    const dbCat = dbCatMap.get(cat);
    const isEinnahme = dbCat ? dbCat.typ === "einnahme" : amount > 0;

    result[fieldKey] = (result[fieldKey] ?? 0) + (isEinnahme ? amount : Math.abs(amount));
  }

  // AfA berechnen
  const afaJahr = calculateDepreciation(property);

  return {
    tax_year: taxYear,

    // Objekt-Stammdaten aus Property
    build_year: property.baujahr ?? undefined,
    acquisition_date: property.kaufdatum ?? undefined,
    acquisition_cost_building: property.gebaeudewert ?? property.kaufpreis ?? undefined,
    property_type: property.type ?? undefined,

    // Berechnete Einnahmen
    rent_income: result.rent_income ?? null,
    deposits_received: result.deposits_received ?? null,
    rent_prior_year: result.rent_prior_year ?? null,
    operating_costs_income: result.operating_costs_income ?? null,
    other_income: result.other_income ?? null,

    // Berechnete Werbungskosten
    loan_interest: result.loan_interest ?? null,
    property_tax: result.property_tax ?? null,
    hoa_fees: result.hoa_fees ?? null,
    insurance: result.insurance ?? null,
    water_sewage: result.water_sewage ?? null,
    waste_disposal: result.waste_disposal ?? null,
    property_management: result.property_management ?? null,
    bank_fees: result.bank_fees ?? null,
    maintenance_costs: result.maintenance_costs ?? null,
    other_expenses: result.other_expenses ?? null,

    // AfA
    depreciation_building: afaJahr > 0 ? afaJahr : null,

    import_source: "calculated",
  };
}
