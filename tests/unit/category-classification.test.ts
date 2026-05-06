/**
 * Regression-Tests für die Transaktions-Klassifikations-Heuristik in
 * `lib/tax/pipeline.ts:resolveTransactionTargetBlock`.
 *
 * Hintergrund: Frühere Version nutzte `text.includes("mull")` und
 * routete dadurch Mieter-Counterparts wie "Müller" oder "Schmöller"
 * fälschlich in `allocated_costs` (Müllabfuhr-Bucket).
 * Fix in `containsAnyWord`-Helper.
 */

import { describe, it, expect } from "vitest";
import { runCalculatePipeline, type CalculatePipelineInput } from "@/lib/tax/pipeline";
import type { TaxCalculationTransaction } from "@/lib/tax/calculateTaxFromTransactions";

const baseProperty: CalculatePipelineInput["property"] = {
  id: "p-test",
  name: "Test",
  kaufpreis: 200000,
  gebaeudewert: 180000,
  grundwert: 20000,
  inventarwert: null,
  baujahr: 1990,
  afa_satz: 2,
  afa_jahresbetrag: 3600,
  kaufdatum: "2020-01-01",
  address: "Teststr. 1",
  type: "Wohnung",
};

function buildInput(transactions: TaxCalculationTransaction[]): CalculatePipelineInput {
  return {
    property: baseProperty,
    transactions,
    paymentMatches: [],
    categories: [],
    gbrSettings: null,
    taxSettings: null,
    depreciationItems: [],
    maintenanceDistributions: [],
    existingTaxData: null,
    taxYear: 2024,
  };
}

function findReconciliationItem(out: ReturnType<typeof runCalculatePipeline>, label: string) {
  return out.reconciliation.items.find((item) => item.label.includes(label));
}

describe("Klassifikation: Müll vs. Müller (Mieter-Counterpart-Bug)", () => {
  it("Mieter mit Counterpart 'Müller' wird NICHT als allocated_costs (Müllabfuhr) klassifiziert", () => {
    const tx: TaxCalculationTransaction = {
      id: "tx-rent",
      date: "2024-06-15",
      amount: 800,
      category: "Mieteinnahmen",
      counterpart: "Hans Müller",
      description: "Miete Juni 2024",
      is_tax_deductible: null,
      anlage_v_zeile: null,
    };
    const out = runCalculatePipeline(buildInput([tx]));
    const item = findReconciliationItem(out, "Müller");
    // Mieteinnahme darf NICHT in einem Werbungskosten-Bucket landen.
    expect(item?.target_block, "Müller darf nicht zu allocated_costs").not.toBe("allocated_costs");
  });

  it("Counterpart 'Schmöller' (Mieter) löst KEINE Müllabfuhr-Klassifikation aus", () => {
    const tx: TaxCalculationTransaction = {
      id: "tx-2",
      date: "2024-06-15",
      amount: 950,
      category: "Mieteinnahmen",
      counterpart: "Familie Schmöller",
      description: "Miete",
      is_tax_deductible: null,
      anlage_v_zeile: null,
    };
    const out = runCalculatePipeline(buildInput([tx]));
    const item = findReconciliationItem(out, "Schmöller");
    expect(item?.target_block).not.toBe("allocated_costs");
  });

  it("Echter Counterpart 'Müllabfuhr Stadtwerke' WIRD als allocated_costs klassifiziert", () => {
    const tx: TaxCalculationTransaction = {
      id: "tx-3",
      date: "2024-03-15",
      amount: -120,
      category: "Müllabfuhr",
      counterpart: "Stadtwerke Müllabfuhr",
      description: "Müllgebühr 2024",
      is_tax_deductible: null,
      anlage_v_zeile: null,
    };
    const out = runCalculatePipeline(buildInput([tx]));
    const item = findReconciliationItem(out, "Müllabfuhr");
    expect(item?.target_block).toBe("allocated_costs");
  });

  it("Counterpart 'Wasserversorgung' wird allocated_costs (echtes Wort)", () => {
    const tx: TaxCalculationTransaction = {
      id: "tx-4",
      date: "2024-03-15",
      amount: -70,
      category: "Nebenkosten",
      counterpart: "Wasserversorgung Hinterzarten",
      description: "",
      is_tax_deductible: null,
      anlage_v_zeile: null,
    };
    const out = runCalculatePipeline(buildInput([tx]));
    const item = findReconciliationItem(out, "Wasserversorgung");
    expect(item?.target_block).toBe("allocated_costs");
  });

  it("Counterpart 'Müllerstraße GbR' (Eigenname) wird NICHT als Müllabfuhr klassifiziert", () => {
    const tx: TaxCalculationTransaction = {
      id: "tx-5",
      date: "2024-04-15",
      amount: -350,
      category: "Sonstige Werbungskosten",
      counterpart: "Müllerstraße GbR",
      description: "Verwalterhonorar",
      is_tax_deductible: null,
      anlage_v_zeile: null,
    };
    const out = runCalculatePipeline(buildInput([tx]));
    const item = findReconciliationItem(out, "Müllerstraße");
    expect(item?.target_block, "Müllerstraße darf nicht zu allocated_costs").not.toBe("allocated_costs");
  });
});
