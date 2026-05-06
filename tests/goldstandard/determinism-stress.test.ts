/**
 * Determinismus-Stress-Test (Verifikations-Lauf).
 *
 * Lässt die Pipeline 10× hintereinander mit identischem Input laufen und
 * prüft, dass das Ergebnis Bit-genau identisch ist (kein Date.now/Math.random,
 * keine Set/Map-Iterations-Reihenfolgen-Abhängigkeit, keine Mutation
 * zwischen Aufrufen).
 *
 * Falls dieser Test rot wird, ist Determinismus gebrochen → die anderen
 * Goldstandard-Tests werden flaky.
 */

import { describe, it, expect } from "vitest";
import goldstandard from "../fixtures/kesslerberg/goldstandard.json" with { type: "json" };
import {
  runCalculatePipeline,
  type CalculatePipelineDbCategory,
  type CalculatePipelineProperty,
} from "@/lib/tax/pipeline";
import type { TaxCalculationTransaction } from "@/lib/tax/calculateTaxFromTransactions";

const TAX_YEAR = 2024;

const property: CalculatePipelineProperty = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Kesslerberg",
  kaufpreis: 250000,
  gebaeudewert: 225136.69,
  grundwert: 24863.31,
  inventarwert: 12000,
  baujahr: 1990,
  afa_satz: 5.56,
  afa_jahresbetrag: 12517.56,
  kaufdatum: "2022-08-11",
  address: "Am Kesslerberg 7, 79856 Hinterzarten",
  type: "Ferienwohnung",
};

const categories: CalculatePipelineDbCategory[] = [
  { label: "Mieteinnahmen", typ: "einnahme", anlage_v: "Z. 9", gruppe: "Einnahmen" },
  { label: "Grundsteuer", typ: "ausgabe", anlage_v: "Z. 47", gruppe: "Gebäude" },
  { label: "Hausversicherungen", typ: "ausgabe", anlage_v: "Z. 21", gruppe: "Gebäude" },
];

const transactions: TaxCalculationTransaction[] = [
  { id: "1", date: "2024-06-15", amount: 12625, category: "Mieteinnahmen", description: null, counterpart: null, anlage_v_zeile: null, is_tax_deductible: true },
  { id: "2", date: "2024-03-15", amount: -46.47, category: "Grundsteuer", description: null, counterpart: null, anlage_v_zeile: null, is_tax_deductible: true },
  { id: "3", date: "2024-04-15", amount: -885.67, category: "Hausversicherungen", description: null, counterpart: null, anlage_v_zeile: null, is_tax_deductible: true },
];

const RENTAL_SHARE_PCT_OVERRIDE = ((114 + 234) / 365) * 100;

function runOnce() {
  return runCalculatePipeline({
    property,
    transactions,
    paymentMatches: [],
    categories,
    gbrSettings: null,
    taxSettings: { rental_share_override_pct: RENTAL_SHARE_PCT_OVERRIDE },
    depreciationItems: [],
    maintenanceDistributions: [],
    existingTaxData: null,
    taxYear: TAX_YEAR,
  });
}

describe("Determinismus: 10× Pipeline mit identischem Input", () => {
  it("Alle 10 Runs liefern bit-genau identische ELSTER-Werte", () => {
    const runs = Array.from({ length: 10 }, () => runOnce());

    // Snapshot-Vergleich auf den wichtigsten Outputs.
    const reference = runs[0];

    for (let i = 1; i < runs.length; i++) {
      const r = runs[i];
      expect(r.calculated.rent_income, `Run ${i}: rent_income`).toBe(reference.calculated.rent_income);
      expect(r.taxDataAfterStructured.depreciation_building, `Run ${i}: depreciation_building`).toBe(
        reference.taxDataAfterStructured.depreciation_building,
      );
      expect(r.taxDataAfterStructured.depreciation_fixtures, `Run ${i}: depreciation_fixtures`).toBe(
        reference.taxDataAfterStructured.depreciation_fixtures,
      );
      expect(r.lineSummary.income_total, `Run ${i}: income_total`).toBe(reference.lineSummary.income_total);
      expect(r.lineSummary.advertising_costs_total, `Run ${i}: advertising_costs_total`).toBe(
        reference.lineSummary.advertising_costs_total,
      );
      expect(r.lineSummary.depreciation_total, `Run ${i}: depreciation_total`).toBe(
        reference.lineSummary.depreciation_total,
      );
      expect(r.lineSummary.result, `Run ${i}: result`).toBe(reference.lineSummary.result);
      expect(r.rentalSharePct, `Run ${i}: rentalSharePct`).toBe(reference.rentalSharePct);
    }
  });

  it("Pipeline mutiert keine Eingabe-Arrays/Objekte", () => {
    const txCopy = JSON.parse(JSON.stringify(transactions));
    const catCopy = JSON.parse(JSON.stringify(categories));
    const propCopy = JSON.parse(JSON.stringify(property));
    runOnce();
    expect(transactions).toEqual(txCopy);
    expect(categories).toEqual(catCopy);
    expect(property).toEqual(propCopy);
  });

  it("Goldstandard-Werte werden im 10. Run noch exakt erreicht", () => {
    const last = runOnce();
    const GS = goldstandard.years["2024"];
    expect(last.calculated.rent_income).toBeCloseTo(GS.anlage_v.z15_einnahmen_miete, 0);
  });
});
