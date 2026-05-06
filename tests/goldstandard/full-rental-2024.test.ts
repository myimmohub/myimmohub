/**
 * Goldstandard-Test · 100 % Vermietung · 2024
 *
 * Coverage-Lücke (Auftrag D #2): Kesslerberg hat 17 Eigennutzungs-Tage und
 * eine Vermietungsquote ≈ 95,3 %. Wir hatten keinen Test für den Standardfall
 * 100 % Vermietung — dort darf KEINE Quotelung passieren.
 *
 * Goldstandard fachlich begründet (kein PDF):
 *   - Property: Eigentumswohnung, Baujahr 2010 (Standard 2 % AfA),
 *     Gebäudewert 300.000 EUR → AfA 6.000 EUR p.a.
 *   - Tax-Year 2024: 12.000 EUR Miete, 1.500 EUR Schuldzinsen,
 *     500 EUR Grundsteuer, 800 EUR Versicherung.
 *   - taxSettings: eigennutzung_tage = 0, gesamt_tage = 365 → ratio 1.0
 *
 * Erwartet (alle ohne Quotelung, ratio = 1):
 *   - rent_income            = 12.000
 *   - allocated_costs        =  1.300 (Grundsteuer + Versicherung)
 *   - financing_costs        =  1.500 (Schuldzinsen, KEINE Quotelung)
 *   - depreciation_building  =  6.000
 *   - WK-Summe               ~  ~9.000 (+ ggf. Pauschalen-Fallback)
 *
 * Hauptaussage: rentalSharePct === 1 UND alle Werte sind ungekürzt.
 * Wenn die Engine fälschlich quoteln würde, würden Schuldzinsen z.B. mit
 * 0,953 multipliziert (≈ 1.430 EUR) → Test rot.
 */

import { describe, it, expect } from "vitest";
import {
  runCalculatePipeline,
  type CalculatePipelineDbCategory,
  type CalculatePipelineProperty,
} from "@/lib/tax/pipeline";
import type { TaxCalculationTransaction } from "@/lib/tax/calculateTaxFromTransactions";
import type { TaxDepreciationItem } from "@/types/tax";
import { buildDiffReport, compareLine } from "../util/diffReport";

const TAX_YEAR = 2024;
const PROPERTY_ID = "full-rental-property";

const property: CalculatePipelineProperty = {
  id: PROPERTY_ID,
  name: "Voll vermietete ETW",
  kaufpreis: 350000,
  gebaeudewert: 300000,
  grundwert: 50000,
  inventarwert: 0,
  baujahr: 2010,
  afa_satz: 2.0,
  afa_jahresbetrag: 6000,
  kaufdatum: "2018-04-01",
  address: "Vermietweg 4, 12345 Musterstadt",
  type: "Wohnung",
};

const categories: CalculatePipelineDbCategory[] = [
  { label: "Mieteinnahmen", typ: "einnahme", anlage_v: "Z. 9", gruppe: "Einnahmen" },
  { label: "Schuldzinsen", typ: "ausgabe", anlage_v: "Z. 17", gruppe: "Finanzierung" },
  { label: "Grundsteuer", typ: "ausgabe", anlage_v: "Z. 47", gruppe: "Gebäude" },
  { label: "Hausversicherungen", typ: "ausgabe", anlage_v: "Z. 21", gruppe: "Gebäude" },
];

const transactions: TaxCalculationTransaction[] = [
  {
    id: "income-rent",
    date: "2024-12-15",
    amount: 12000,
    category: "Mieteinnahmen",
    anlage_v_zeile: null,
    // Bewusst KEIN counterpart mit "Müll"-Substring (z.B. "Müller"), weil
    // resolveTransactionTargetBlock() in pipeline.ts auf das Substring "mull"
    // (für "Müllabfuhr") matcht und sonst Mieteinnahmen fälschlich in den
    // allocated_costs-Bucket landen würden — siehe Codex-Briefing zu
    // resolveTransactionTargetBlock-Keyword-Heuristik.
    counterpart: "Hauptmieter",
    description: "Jahresmiete 2024",
    is_tax_deductible: true,
  },
  {
    id: "tx-zinsen",
    date: "2024-12-31",
    amount: -1500,
    category: "Schuldzinsen",
    anlage_v_zeile: null,
    counterpart: "Bank",
    description: "Hypothekenzinsen 2024",
    is_tax_deductible: true,
  },
  {
    id: "tx-grundsteuer",
    date: "2024-02-15",
    amount: -500,
    category: "Grundsteuer",
    anlage_v_zeile: null,
    counterpart: "Stadtkasse",
    description: "Grundsteuer 2024",
    is_tax_deductible: true,
  },
  {
    id: "tx-versicherung",
    date: "2024-03-15",
    amount: -800,
    category: "Hausversicherungen",
    anlage_v_zeile: null,
    counterpart: "Allianz",
    description: "Wohngebäudeversicherung 2024",
    is_tax_deductible: true,
  },
];

const depreciationItems: TaxDepreciationItem[] = [
  {
    id: "dep-building",
    property_id: PROPERTY_ID,
    tax_year: TAX_YEAR,
    item_type: "building",
    label: "Gebäude-AfA Standard",
    gross_annual_amount: 6000,
    apply_rental_ratio: true,
  },
];

/**
 * Helper: Frischer Pipeline-Run pro Test, damit nichts zwischen `it`'s
 * geteilt wird (kein potentielles Mutation-Crosstalk auf gemeinsamen
 * Result-Objekten).
 */
function runDefault() {
  return runCalculatePipeline({
    property,
    transactions: transactions.map((t) => ({ ...t })),
    paymentMatches: [],
    categories,
    gbrSettings: null,
    taxSettings: {
      eigennutzung_tage: 0,
      gesamt_tage: 365,
      rental_share_override_pct: null,
    },
    depreciationItems,
    maintenanceDistributions: [],
    existingTaxData: null,
    taxYear: TAX_YEAR,
  });
}

describe("Full-Rental 2024 (100 % Vermietung) — keine Quotelung", () => {
  it("rentalSharePct = 1.0 (eigennutzung_tage = 0)", () => {
    const out = runDefault();
    expect(out.rentalSharePct).toBe(1);
  });

  it("Variante mit explizitem rental_share_override_pct = 100 ergibt ebenfalls 1.0", () => {
    const out2 = runCalculatePipeline({
      property,
      transactions,
      paymentMatches: [],
      categories,
      gbrSettings: null,
      taxSettings: {
        eigennutzung_tage: null,
        gesamt_tage: null,
        rental_share_override_pct: 100,
      },
      depreciationItems,
      maintenanceDistributions: [],
      existingTaxData: null,
      taxYear: TAX_YEAR,
    });
    expect(out2.rentalSharePct).toBe(1);
  });

  it("Mieteinnahmen 12.000 ungekürzt", () => {
    const out = runDefault();
    expect(Number(out.calculated.rent_income ?? 0)).toBe(12000);
  });

  it("AfA Gebäude 6.000 ungekürzt (Baujahr 2010, 2 %)", () => {
    const out = runDefault();
    expect(Number(out.taxDataAfterStructured.depreciation_building ?? 0)).toBe(6000);
  });

  it("Schuldzinsen werden NICHT quoteliert (Bucket financing_costs = 1.500)", () => {
    const out = runDefault();
    const bucket = out.lineSummary.expense_buckets.find((b) => b.key === "financing_costs");
    expect(bucket, "financing_costs bucket muss existieren").toBeDefined();
    expect(bucket!.amount).toBeCloseTo(1500, -1);
  });

  it("allocated_costs (Grundsteuer + Versicherung) ≈ 1.300 ungekürzt", () => {
    const out = runDefault();
    const bucket = out.lineSummary.expense_buckets.find((b) => b.key === "allocated_costs");
    expect(bucket).toBeDefined();
    expect(bucket!.amount).toBeCloseTo(1300, -1);
  });

  it("Sanity: Wenn die Engine quoteln würde (ratio≠1), wären Schuldzinsen <1.500", () => {
    // Negativtest: Stellt sicher, dass wir bei manuell gesetztem Override
    // 95% wirklich kürzen — als Beweis, dass der „kein Quoteln"-Pfad oben kein
    // Schein-OK ist.
    const outQuoted = runCalculatePipeline({
      property,
      transactions,
      paymentMatches: [],
      categories,
      gbrSettings: null,
      taxSettings: {
        eigennutzung_tage: 18,
        gesamt_tage: 365,
        rental_share_override_pct: null,
      },
      depreciationItems,
      maintenanceDistributions: [],
      existingTaxData: null,
      taxYear: TAX_YEAR,
    });
    expect(outQuoted.rentalSharePct).toBeLessThan(1);
    const financingQuoted = outQuoted.lineSummary.expense_buckets.find((b) => b.key === "financing_costs");
    expect(financingQuoted!.amount).toBeLessThan(1500);
  });

  it("Übersichts-Diff: Full-Rental 2024", () => {
    const out = runDefault();
    const allocBucket = out.lineSummary.expense_buckets.find((b) => b.key === "allocated_costs");
    const finBucket = out.lineSummary.expense_buckets.find((b) => b.key === "financing_costs");
    const rows = [
      compareLine({ key: "rent_income", zeile: "Z.15", label: "Mieteinnahmen (12.000)", soll: 12000 }, Number(out.calculated.rent_income ?? 0), 2),
      compareLine({ key: "afa_gebaeude", zeile: "Z.35", label: "AfA Gebäude (6.000, 2 %)", soll: 6000 }, Number(out.taxDataAfterStructured.depreciation_building ?? 0), 2),
      compareLine({ key: "allocated_costs", zeile: "Z.75", label: "Umlagefähige Kosten (1.300)", soll: 1300 }, allocBucket?.amount ?? 0, 2),
      compareLine({ key: "financing_costs", zeile: "Z.78", label: "Finanzierung (1.500, ungekürzt)", soll: 1500 }, finBucket?.amount ?? 0, 2),
    ];
    console.log(buildDiffReport(rows, "Full-Rental 2024 (100 % Vermietung)"));
    expect(rows.length).toBeGreaterThan(0);
  });
});
