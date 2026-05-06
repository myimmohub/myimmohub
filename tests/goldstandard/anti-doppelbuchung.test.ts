/**
 * Goldstandard-Test: Anti-Doppelbuchung Anlage V ↔ NKA (Spec §12.3).
 *
 * Szenario:
 *   Property 2024. Eine Wasserversorgung-Transaktion über 264,00 EUR taucht
 *   in der Tax-Pipeline regulär als Werbungskosten (water_sewage) auf.
 *   Gleichzeitig existiert eine NKA-Periode 2024 mit Position "wasser",
 *   brutto 264,00 EUR, 100 % umlagefähig.
 *
 *   Erwartung: Die Pipeline kürzt `calculated.water_sewage` um den umlagefähigen
 *   Anteil. Bei 100 % bleibt 0 EUR übrig.
 *
 * Edge-Cases:
 *   - 50 % umlagefähig → halbe Kürzung (132 EUR bleiben).
 *   - keine NKA-Periode → keine Korrektur, bestehende Logik.
 */

import { describe, it, expect } from "vitest";
import {
  runCalculatePipeline,
  type CalculatePipelineDbCategory,
  type CalculatePipelineNkaUmlage,
  type CalculatePipelineProperty,
} from "@/lib/tax/pipeline";
import type { TaxCalculationTransaction } from "@/lib/tax/calculateTaxFromTransactions";

const TAX_YEAR = 2024;
const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";

const property: CalculatePipelineProperty = {
  id: PROPERTY_ID,
  name: "Anti-Doppelbuchung-Test",
  kaufpreis: 250000,
  gebaeudewert: 200000,
  grundwert: 50000,
  inventarwert: 0,
  baujahr: 1995,
  afa_satz: 2,
  afa_jahresbetrag: 4000,
  kaufdatum: "2020-01-01",
  address: "Teststr. 1",
  type: "Mehrfamilienhaus",
};

const categories: CalculatePipelineDbCategory[] = [
  { label: "Mieteinnahmen", typ: "einnahme", anlage_v: "Z. 9", gruppe: "Einnahmen" },
  { label: "Wasserversorgung", typ: "ausgabe", anlage_v: "Z. 26", gruppe: "Betriebskosten" },
];

const baseTransactions: TaxCalculationTransaction[] = [
  {
    id: "tx-rent",
    date: "2024-06-01",
    amount: 12000,
    category: "Mieteinnahmen",
    anlage_v_zeile: null,
    counterpart: "Mieter",
    description: "Miete 2024",
    is_tax_deductible: true,
  },
  {
    id: "tx-wasser",
    date: "2024-03-15",
    amount: -264,
    category: "Wasserversorgung",
    anlage_v_zeile: null,
    counterpart: "Stadtwerke",
    description: "Wasser 2024",
    is_tax_deductible: true,
  },
];

function runWith(nkaUmlagen: CalculatePipelineNkaUmlage[]) {
  return runCalculatePipeline({
    property,
    transactions: baseTransactions,
    paymentMatches: [],
    categories,
    gbrSettings: null,
    taxSettings: { rental_share_override_pct: 100 },
    depreciationItems: [],
    maintenanceDistributions: [],
    existingTaxData: null,
    taxYear: TAX_YEAR,
    nkaUmlagen,
  });
}

describe("Anti-Doppelbuchung Anlage V ↔ NKA", () => {
  it("Goldstandard: Wasser 264 € · 100 % umlagefähig → calculated.water_sewage = 0", () => {
    const out = runWith([
      {
        transaction_id: null,
        position: "wasser",
        brutto_cents: 26400,
        umlagefaehig_cents: 26400,
        period_year: TAX_YEAR,
      },
    ]);
    // Ohne Korrektur wäre water_sewage = 264 (Brutto, da rental_share=100%
    // erst beim Buckets-Aggregieren prorated wird; calculated.* enthält Roh-EUR).
    // Mit 100 % NKA-Umlage: water_sewage = 264 - 264 = 0.
    expect(Number(out.calculated.water_sewage ?? 0)).toBeCloseTo(0, 2);
    expect(out.reconciliation.nka_corrections.length).toBe(1);
    expect(out.reconciliation.nka_corrections[0]).toMatchObject({
      position: "wasser",
      subtracted_cents: 26400,
    });
  });

  it("Edge-Case: 50 % umlagefähig → halbe Kürzung", () => {
    const out = runWith([
      {
        transaction_id: null,
        position: "wasser",
        brutto_cents: 26400,
        // 50 % von 26400 cents = 13200 cents = 132 EUR
        umlagefaehig_cents: 13200,
        period_year: TAX_YEAR,
      },
    ]);
    // 264 - 132 = 132
    expect(Number(out.calculated.water_sewage ?? 0)).toBeCloseTo(132, 2);
    expect(out.reconciliation.nka_corrections[0].subtracted_cents).toBe(13200);
  });

  it("Edge-Case: keine NKA-Periode → keine Korrektur, bestehende Logik", () => {
    const out = runWith([]);
    expect(Number(out.calculated.water_sewage ?? 0)).toBeCloseTo(264, 2);
    expect(out.reconciliation.nka_corrections).toHaveLength(0);
  });

  it("Folgejahr-Schutz: NKA-Periode für 2023 darf 2024 nicht kürzen", () => {
    const out = runWith([
      {
        transaction_id: null,
        position: "wasser",
        brutto_cents: 26400,
        umlagefaehig_cents: 26400,
        period_year: 2023,
      },
    ]);
    expect(Number(out.calculated.water_sewage ?? 0)).toBeCloseTo(264, 2);
    expect(out.reconciliation.nka_corrections).toHaveLength(0);
  });
});
