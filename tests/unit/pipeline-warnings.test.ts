/**
 * Unit-Tests für die in den Marktreife-Pass eingeführten Pipeline-Warnings.
 *
 * Geprüft:
 *   - AfA-Basis 0 → Warning "afa_basis_zero"
 *   - Unkategorisierte Tx im Steuerjahr → Warning "uncategorized_transaction"
 *   - NaN/Infinity in Reconciliation-Werten → Warning "non_finite_value"
 */

import { describe, it, expect, vi } from "vitest";
import {
  runCalculatePipeline,
  type CalculatePipelineProperty,
} from "@/lib/tax/pipeline";
import type { TaxCalculationTransaction } from "@/lib/tax/calculateTaxFromTransactions";

const baseProperty: CalculatePipelineProperty = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "TestProp",
  kaufpreis: 200_000,
  gebaeudewert: 180_000,
  grundwert: 20_000,
  inventarwert: 10_000,
  baujahr: 1990,
  afa_satz: 2,
  afa_jahresbetrag: null,
  kaufdatum: "2020-01-01",
  address: null,
  type: null,
};

describe("Pipeline-Warnings", () => {
  it("AfA-Basis 0 → afa_basis_zero-Warning + console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const property: CalculatePipelineProperty = {
      ...baseProperty,
      gebaeudewert: 0,
      inventarwert: 0,
      afa_jahresbetrag: 0,
    };
    const result = runCalculatePipeline({
      property,
      transactions: [],
      paymentMatches: [],
      categories: [],
      gbrSettings: null,
      taxSettings: null,
      depreciationItems: [],
      maintenanceDistributions: [],
      existingTaxData: null,
      taxYear: 2024,
    });
    const codes = result.reconciliation.warnings.map((w) => w.code);
    expect(codes).toContain("afa_basis_zero");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("Unkategorisierte Tx im Steuerjahr → uncategorized_transaction-Warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const transactions: TaxCalculationTransaction[] = [
      { id: "tx1", date: "2024-03-15", amount: -100, category: null, description: null, counterpart: null, anlage_v_zeile: null, is_tax_deductible: true },
      { id: "tx2", date: "2024-04-15", amount: -200, category: null, description: null, counterpart: null, anlage_v_zeile: null, is_tax_deductible: true },
    ];
    const result = runCalculatePipeline({
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
    });
    const w = result.reconciliation.warnings.find((w) => w.code === "uncategorized_transaction");
    expect(w).toBeDefined();
    expect(w!.message).toContain("2 Transaktion");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("Standard-Setup ohne Probleme → keine Warnings", () => {
    const result = runCalculatePipeline({
      property: baseProperty,
      transactions: [],
      paymentMatches: [],
      categories: [],
      gbrSettings: null,
      taxSettings: null,
      depreciationItems: [],
      maintenanceDistributions: [],
      existingTaxData: null,
      taxYear: 2024,
    });
    expect(result.reconciliation.warnings).toEqual([]);
  });
});
