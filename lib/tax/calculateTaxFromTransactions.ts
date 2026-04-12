/**
 * Berechnet tax_data-Felder aus vorhandenen Transaktionen.
 *
 * Mapping-Strategie:
 * 1. Kategorie-Label → tax_data-Feld (primär, über CATEGORY_TO_FIELD)
 * 2. Kategorie-Gruppe → tax_data-Feld (Fallback für unbekannte Labels)
 * 3. anlage_v_zeile auf der Transaktion (Legacy-Fallback)
 */

import type { TaxData } from "@/types/tax";

export type TaxCalculationTransaction = {
  id?: string;
  date: string;
  amount: number;
  category: string | null;
  anlage_v_zeile: number | null;
  description?: string | null;
  counterpart?: string | null;
};

type PropertyForTax = {
  kaufpreis: number | null;
  gebaeudewert: number | null;
  grundwert?: number | null;
  inventarwert?: number | null;
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

export type TaxTargetBlock =
  | "income"
  | "allocated_costs"
  | "non_allocated_costs"
  | "financing_costs"
  | "maintenance"
  | "other_expenses"
  | "depreciation"
  | "unmapped";

function normalizeForMatching(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function containsAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

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
  "Hauswart / Hausmeister":           "hoa_fees",
  "Heizung / Wärme":                  "hoa_fees",
  "Allgemeinstrom / Hausbeleuchtung": "hoa_fees",
  "Schornsteinreinigung":             "hoa_fees",

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
  "Verwaltungspauschale":             "property_management",
  "Porto":                            "property_management",
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
  "Verwaltung":      "property_management",
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
  // Einnahmen
  "miete_einnahmen_wohnen":    "rent_income",
  "miete_einnahmen_gewerbe":   "rent_income",
  "nebenkosten_einnahmen":     "operating_costs_income",
  "mietsicherheit_einnahme":   "deposits_received",
  "sonstige_einnahmen":        "other_income",
  // Werbungskosten (steuerlich absetzbar)
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
  // Nicht absetzbar → kein Mapping (werden in resolveField übersprungen)
  // "tilgung_kredit":         → null
  // "mietsicherheit_ausgabe": → null
  // "sonstiges_nicht_absetzbar": → null
};

function inferFieldFromText(
  label: string,
  gruppe?: string | null,
): keyof TaxData | null {
  const haystack = `${normalizeForMatching(label)} ${normalizeForMatching(gruppe)}`.trim();
  if (!haystack) return null;

  if (containsAny(haystack, ["grundsteuer"])) return "property_tax";
  if (containsAny(haystack, ["versicherung", "wohngebaude", "haftpflicht"])) return "insurance";
  if (containsAny(haystack, ["kreditzins", "schuldzins", "zinsdarlehen", "darlehenszins", "hypothekenzins"])) return "loan_interest";
  if (containsAny(haystack, ["kontofuhrung", "bankgebuhr", "kontogebuhr"])) return "bank_fees";
  if (containsAny(haystack, ["wasser", "abwasser", "sewage"])) return "water_sewage";
  if (containsAny(haystack, ["mull", "abfall", "entsorgung"])) return "waste_disposal";
  if (containsAny(haystack, ["hauswart", "hausmeister", "heizung", "warmwasser", "hausbeleuchtung", "allgemeinstrom", "schornstein", "treppenhausreinigung", "strassenreinigung", "strassen reinigung"])) return "hoa_fees";
  if (containsAny(haystack, ["weg kosten", "weg umlage", "hausgeld", "eigentu mergemeinschaft", "eigentumergemeinschaft", "weg"])) return "hoa_fees";
  if (containsAny(haystack, ["porto", "verwaltungspauschale", "verwaltungskosten", "pauschale verwaltung"])) return "property_management";
  if (containsAny(haystack, ["hausverwaltung", "immobilienverwaltung", "objektverwaltung", "ferienhausverwaltung"])) return "property_management";
  if (containsAny(haystack, ["handwerker", "material", "instandhaltung", "instandsetzung", "reparatur", "wartung", "sanierung", "renovierung"])) return "maintenance_costs";
  if (containsAny(haystack, ["nebenkostenerstattung", "umlage"])) return "operating_costs_income";
  if (containsAny(haystack, ["mieteinnahmen", "miete", "ferienvermietung"])) return "rent_income";
  if (containsAny(haystack, ["kaution"])) return "deposits_received";

  if (containsAny(haystack, ["gebaude"])) return "other_expenses";
  if (containsAny(haystack, ["instandhaltung"])) return "maintenance_costs";
  if (containsAny(haystack, ["betriebskosten"])) return "other_expenses";
  if (containsAny(haystack, ["finanzierung"])) return "loan_interest";
  if (containsAny(haystack, ["verwaltung"])) return "other_expenses";
  if (containsAny(haystack, ["einnahmen"])) return "other_income";
  return null;
}

function deriveBuildingBasis(property: PropertyForTax): number {
  if (property.gebaeudewert != null && property.gebaeudewert > 0) {
    return property.gebaeudewert;
  }

  const purchasePrice = property.kaufpreis ?? 0;
  if (purchasePrice <= 0) return 0;

  const landValue = Math.max(0, property.grundwert ?? 0);
  const fixturesValue = Math.max(0, property.inventarwert ?? 0);
  const derivedValue = purchasePrice - landValue - fixturesValue;

  return derivedValue > 0 ? derivedValue : purchasePrice;
}

/**
 * Berechnet AfA basierend auf Property-Daten.
 */
export function calculateDepreciation(property: PropertyForTax): number {
  const afaBasis = deriveBuildingBasis(property);

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
// Explizit nicht-absetzbare Slugs (Altformat) — dürfen nie in die Steuererklärung
const NON_DEDUCTIBLE_SLUGS = new Set([
  "tilgung_kredit",
  "mietsicherheit_ausgabe",
  "mietsicherheit_einnahme",
  "sonstiges_nicht_absetzbar",
  "aufgeteilt",
]);

export function resolveField(
  cat: string,
  anlageVZeile: number | null,
  dbCatMap: Map<string, DbCategory>,
): keyof TaxData | null {
  // 0. Explizit nicht-absetzbare Slugs ausschließen
  if (NON_DEDUCTIBLE_SLUGS.has(cat)) return null;

  // 1. Direkt über Label (hardcoded Mapping)
  if (CATEGORY_TO_FIELD[cat]) return CATEGORY_TO_FIELD[cat];

  // 2. Alte Slugs
  if (OLD_SLUG_TO_FIELD[cat]) return OLD_SLUG_TO_FIELD[cat];

  const dbCat = dbCatMap.get(cat);
  if (dbCat) {
    // "nicht absetzbar" → überspringen
    if (dbCat.anlage_v === "nicht absetzbar") return null;

    const inferredField = inferFieldFromText(dbCat.label, dbCat.gruppe);
    if (inferredField) return inferredField;

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

  const inferredFallback = inferFieldFromText(cat, null);
  if (inferredFallback) return inferredFallback;

  // 5. anlage_v_zeile auf der Transaktion
  if (anlageVZeile && ZEILE_TO_FIELD[anlageVZeile]) {
    return ZEILE_TO_FIELD[anlageVZeile];
  }

  return null;
}

export function mapTaxFieldToTargetBlock(fieldKey: keyof TaxData | null): TaxTargetBlock {
  if (!fieldKey) return "unmapped";
  if (["rent_income", "deposits_received", "rent_prior_year", "operating_costs_income", "other_income"].includes(fieldKey)) {
    return "income";
  }
  if (["property_tax", "insurance", "hoa_fees", "water_sewage", "waste_disposal"].includes(fieldKey)) {
    return "allocated_costs";
  }
  if (["property_management", "bank_fees"].includes(fieldKey)) {
    return "non_allocated_costs";
  }
  if (fieldKey === "loan_interest") return "financing_costs";
  if (fieldKey === "maintenance_costs") return "maintenance";
  if (fieldKey === "depreciation_building" || fieldKey === "depreciation_outdoor" || fieldKey === "depreciation_fixtures") {
    return "depreciation";
  }
  return "other_expenses";
}

/**
 * Berechnet alle tax_data-Felder aus Transaktionen einer Immobilie.
 */
export function calculateTaxFromTransactions(
  transactions: TaxCalculationTransaction[],
  property: PropertyForTax,
  taxYear: number,
  dbCategories?: DbCategory[],
  excludedTransactionIds?: string[],
): Partial<TaxData> {
  const von = `${taxYear}-01-01`;
  const bis = `${taxYear}-12-31`;
  const excludedIds = new Set(excludedTransactionIds ?? []);

  // Nur kategorisierte Transaktionen im Steuerjahr
  const relevant = transactions.filter(
    (t) =>
      t.date >= von &&
      t.date <= bis &&
      t.category != null &&
      t.category !== "aufgeteilt" &&
      !(t.id && excludedIds.has(t.id)),
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
    acquisition_cost_building: deriveBuildingBasis(property) || undefined,
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
