/**
 * Goldstandard-Tests für `calculateIndexedRent` (lib/tenants/indexRent.ts).
 *
 * Diese Tests verwenden KEINE PDFs, sondern handgerechnete Erwartungswerte.
 * Begründungen siehe je `it()`-Header.
 *
 * Cent-Rundung: half-up symmetrisch.
 * pct_change: float, auf 4 Stellen gerundet.
 */

import { describe, it, expect } from "vitest";
import { calculateIndexedRent } from "@/lib/tenants/indexRent";

describe("calculateIndexedRent — Goldstandard", () => {
  it("Standardfall: +5 % bei 24 Monaten Mindestabstand → eligible", () => {
    // base 800,00 EUR, base_index 100, current_index 105.
    // pct_change = (105-100)/100 = 0.05
    // new = 80000 * 1.05 = 84000 cent (= 840,00 EUR)
    const r = calculateIndexedRent({
      base_value_cents: 80000,
      base_date: "2022-01-01",
      base_index: 100,
      current_index: 105,
      current_date: "2024-01-01",
      interval_months: 12,
    });
    expect(r.new_value_cents).toBe(84000);
    expect(r.delta_cents).toBe(4000);
    expect(r.pct_change).toBe(0.05);
    expect(r.is_eligible).toBe(true);
    expect(r.next_eligible_date).toBe("2025-01-01");
    expect(r.warnings.find((w) => w.code === "index_decrease")).toBeUndefined();
  });

  it("Indexrückgang: current_index < base_index → -5 %, Warning", () => {
    // pct = (95-100)/100 = -0.05; new = 80000 * 0.95 = 76000
    const r = calculateIndexedRent({
      base_value_cents: 80000,
      base_date: "2022-01-01",
      base_index: 100,
      current_index: 95,
      current_date: "2024-01-01",
    });
    expect(r.new_value_cents).toBe(76000);
    expect(r.delta_cents).toBe(-4000);
    expect(r.pct_change).toBe(-0.05);
    expect(r.warnings.some((w) => w.code === "index_decrease")).toBe(true);
  });

  it("Mindestlaufzeit nicht erreicht (11 Monate) → not eligible", () => {
    // base_date 2023-01-01, current_date 2023-12-01 → 11 Monate (Tag-Korrektur)
    const r = calculateIndexedRent({
      base_value_cents: 80000,
      base_date: "2023-01-01",
      base_index: 100,
      current_index: 110,
      current_date: "2023-12-01",
      interval_months: 12,
    });
    expect(r.is_eligible).toBe(false);
    expect(r.warnings.some((w) => w.code === "min_interval_not_met")).toBe(true);
    // next_eligible_date = current_date + 12M = 2024-12-01
    expect(r.next_eligible_date).toBe("2024-12-01");
  });

  it("Mindestlaufzeit grenzwertig: genau 12 Monate → eligible", () => {
    // base_date 2023-01-01, current_date 2024-01-01 → 12 Monate
    const r = calculateIndexedRent({
      base_value_cents: 80000,
      base_date: "2023-01-01",
      base_index: 100,
      current_index: 110,
      current_date: "2024-01-01",
      interval_months: 12,
    });
    expect(r.is_eligible).toBe(true);
  });

  it("Cent-genau half-up: 1234,56 EUR + 3,7 % handgerechnet", () => {
    // base 123456 cent, pct 0.037
    // 123456 * 1.037 = 128023.872 → half-up → 128024 cent
    const r = calculateIndexedRent({
      base_value_cents: 123456,
      base_date: "2022-01-01",
      base_index: 100,
      current_index: 103.7,
      current_date: "2024-01-01",
    });
    expect(r.new_value_cents).toBe(128024);
    expect(r.delta_cents).toBe(4568);
    expect(r.pct_change).toBe(0.037);
  });

  it("Sehr kleine Differenz (current 100.001) → Mini-Anpassung", () => {
    // pct = 0.00001 → 80000 * 1.00001 = 80000.8 → half-up → 80001
    const r = calculateIndexedRent({
      base_value_cents: 80000,
      base_date: "2022-01-01",
      base_index: 100,
      current_index: 100.001,
      current_date: "2024-01-01",
    });
    expect(r.new_value_cents).toBe(80001);
    expect(r.pct_change).toBe(0); // gerundet auf 4 Stellen
  });

  it("interval_months = 6 → Warning 'unter §557b-Mindest'", () => {
    const r = calculateIndexedRent({
      base_value_cents: 80000,
      base_date: "2023-01-01",
      base_index: 100,
      current_index: 105,
      current_date: "2023-08-01",
      interval_months: 6,
    });
    expect(r.warnings.some((w) => w.code === "interval_below_minimum")).toBe(true);
    expect(r.is_eligible).toBe(true); // 7 Monate > interval 6 → erfüllt
  });

  it("last_adjustment_date != base_date — zweite Anpassung", () => {
    // base war 2020, letzte Anpassung 2023-01-01, neuer Stichtag 2024-01-01.
    // monthsBetween(2023-01-01, 2024-01-01) = 12 → eligible.
    const r = calculateIndexedRent({
      base_value_cents: 80000,
      base_date: "2020-01-01",
      base_index: 100,
      current_index: 110,
      current_date: "2024-01-01",
      last_adjustment_date: "2023-01-01",
      interval_months: 12,
    });
    expect(r.is_eligible).toBe(true);
    // Aber: nur 6 Monate seit letzter Anpassung → nicht eligible
    const r2 = calculateIndexedRent({
      base_value_cents: 80000,
      base_date: "2020-01-01",
      base_index: 100,
      current_index: 110,
      current_date: "2023-07-01",
      last_adjustment_date: "2023-01-01",
      interval_months: 12,
    });
    expect(r2.is_eligible).toBe(false);
  });

  it("base_index = 0 → Warning 'invalid_base_index', new_value = base_value", () => {
    const r = calculateIndexedRent({
      base_value_cents: 80000,
      base_date: "2022-01-01",
      base_index: 0,
      current_index: 105,
      current_date: "2024-01-01",
    });
    expect(r.new_value_cents).toBe(80000);
    expect(r.delta_cents).toBe(0);
    expect(r.warnings.some((w) => w.code === "invalid_base_index")).toBe(true);
  });

  it("current_date < base_date → Warning 'current_before_base'", () => {
    const r = calculateIndexedRent({
      base_value_cents: 80000,
      base_date: "2024-01-01",
      base_index: 100,
      current_index: 105,
      current_date: "2023-01-01",
    });
    expect(r.warnings.some((w) => w.code === "current_before_base")).toBe(true);
  });

  it("Determinismus: 5x identische Eingabe → 5x identische Ausgabe", () => {
    const input = {
      base_value_cents: 95000,
      base_date: "2022-06-01",
      base_index: 110.4,
      current_index: 119.7,
      current_date: "2024-06-01",
      interval_months: 12,
    };
    const results = Array.from({ length: 5 }, () => calculateIndexedRent(input));
    for (const r of results) {
      expect(r).toEqual(results[0]);
    }
  });

  it("CPI-Realwert: base 800, base 113.5 (Jan 2022), current 122.7 (Jan 2024)", () => {
    // pct = (122.7 - 113.5) / 113.5 = 0.08105726872... → 4 Stellen 0.0811
    // new = 80000 * 1.08105726872... = 86484.58... → half-up 86485
    const r = calculateIndexedRent({
      base_value_cents: 80000,
      base_date: "2022-01-01",
      base_index: 113.5,
      current_index: 122.7,
      current_date: "2024-01-01",
      interval_months: 12,
    });
    expect(r.new_value_cents).toBe(86485);
    expect(r.delta_cents).toBe(6485);
    expect(r.pct_change).toBe(0.0811);
    expect(r.is_eligible).toBe(true);
  });
});
