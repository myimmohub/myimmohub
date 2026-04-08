/**
 * Berechnet tax_data-Felder aus vorhandenen Transaktionen.
 *
 * Liest kategorisierte Transaktionen einer Immobilie für ein Steuerjahr
 * und aggregiert sie nach Anlage-V-Zeilen.
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
};

/**
 * Mapping: Anlage-V-Zeile (Nummer) → tax_data-Feld.
 * Mehrere Zeilen können auf dasselbe Feld aggregiert werden.
 */
const ZEILE_TO_INCOME_FIELD: Record<number, keyof TaxData> = {
  9:  "rent_income",
  10: "deposits_received",
  11: "rent_prior_year",
  13: "operating_costs_income",
  14: "other_income",
};

const ZEILE_TO_EXPENSE_FIELD: Record<number, keyof TaxData> = {
  17: "loan_interest",
  19: "property_tax",
  20: "hoa_fees",
  21: "insurance",
  26: "water_sewage",
  28: "waste_disposal",
  35: "property_management",
  37: "bank_fees",
  40: "maintenance_costs",
  45: "insurance",          // Versicherungen auch über Z. 45
  46: "property_management", // Verwaltungskosten auch über Z. 46
  47: "property_tax",       // Grundsteuer auch über Z. 47
  48: "insurance",          // Betriebskosten → Versicherung
  53: "other_expenses",
};

/**
 * Berechnet AfA basierend auf Property-Daten.
 * Nutzt die bestehende Logik: Gebäudewert × AfA-Satz.
 */
export function calculateDepreciation(property: PropertyForTax): number {
  const afaBasis = (property.gebaeudewert != null && property.gebaeudewert > 0)
    ? property.gebaeudewert
    : property.kaufpreis ?? 0;

  if (afaBasis <= 0) return 0;

  // AfA-Satz bestimmen
  let satz = property.afa_satz ?? 0; // dezimal
  if (satz === 0 && property.baujahr) {
    // Fallback: automatisch nach Baujahr (§ 7 Abs. 4 EStG)
    if (property.baujahr < 1925) satz = 0.025;
    else if (property.baujahr <= 2022) satz = 0.02;
    else satz = 0.03;
  }

  return Math.round(afaBasis * satz * 100) / 100;
}

/**
 * Mapping von DB-Kategorie-Label → anlage_v → Zeilen-Nummer.
 * z.B. "Z. 35" → 35, "Z. 9 / 10 / 11" → 9 (erste Zeile).
 */
function parseZeile(anlageV: string | null): number | null {
  if (!anlageV) return null;
  const match = anlageV.match(/Z\.\s*(\d+)/);
  return match ? parseInt(match[1], 10) : null;
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

  // DB-Kategorien als Map: label → Zeile
  const catZeileMap = new Map<string, number>();
  const catTypMap = new Map<string, string>();
  if (dbCategories) {
    for (const cat of dbCategories) {
      const zeile = parseZeile(cat.anlage_v);
      if (zeile) catZeileMap.set(cat.label, zeile);
      catTypMap.set(cat.label, cat.typ);
    }
  }

  // Aggregation
  const result: Record<string, number> = {};

  for (const tx of relevant) {
    const amount = Number(tx.amount);
    const cat = tx.category!;

    // Zeile bestimmen: erst aus Transaktion, dann aus DB-Kategorie
    let zeile = tx.anlage_v_zeile;
    if (!zeile && catZeileMap.has(cat)) {
      zeile = catZeileMap.get(cat)!;
    }
    if (!zeile) continue;

    // Einnahme oder Ausgabe?
    const typ = catTypMap.get(cat);
    const isEinnahme = typ === "einnahme" || amount > 0;

    let fieldKey: string | undefined;
    if (isEinnahme) {
      fieldKey = ZEILE_TO_INCOME_FIELD[zeile] as string | undefined;
    }
    if (!fieldKey) {
      fieldKey = ZEILE_TO_EXPENSE_FIELD[zeile] as string | undefined;
    }
    if (!fieldKey && isEinnahme) {
      fieldKey = "other_income";
    } else if (!fieldKey) {
      fieldKey = "other_expenses";
    }

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
