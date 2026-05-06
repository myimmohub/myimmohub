/**
 * E2E-Test Profitability/Cashflow (`lib/calculations/profitability.ts`).
 *
 * Pure Function: Berechnet Cashflow + AfA + steuerliches Ergebnis aus
 * (Transaktionen, Property, DateRange).
 *
 * Hier mit synthetischen Transaktionen statt CSV-Parsing:
 *   - 12 Mieteinnahmen à 1.000 €
 *   - 12 Schuldzinsen à -652 €
 *   - 1 Versicherung -845 €
 *   - 1 Grundsteuer -45 €
 * Property: 250.000 € Kaufpreis, 225.000 € Gebäudewert, 2 % AfA → 4.500 € p.a.
 */

import { describe, it, expect } from "vitest";
import {
  calculateProfitability,
  type ProfitabilityTransaction,
  type ProfitabilityDbCategory,
} from "@/lib/calculations/profitability";

const dbCategories: ProfitabilityDbCategory[] = [
  { label: "Mieteinnahmen", typ: "einnahme", anlage_v: "Z. 9", gruppe: "Einnahmen" },
  { label: "Schuldzinsen", typ: "ausgabe", anlage_v: "Z. 35", gruppe: "Finanzierung" },
  { label: "Hausversicherungen", typ: "ausgabe", anlage_v: "Z. 21", gruppe: "Gebäude" },
  { label: "Grundsteuer", typ: "ausgabe", anlage_v: "Z. 47", gruppe: "Gebäude" },
];

function buildYearTransactions(): ProfitabilityTransaction[] {
  const txs: ProfitabilityTransaction[] = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    txs.push({ date: `2024-${mm}-01`, amount: 1_000, category: "Mieteinnahmen" });
    txs.push({ date: `2024-${mm}-05`, amount: -652, category: "Schuldzinsen" });
  }
  txs.push({ date: "2024-03-15", amount: -845, category: "Hausversicherungen" });
  txs.push({ date: "2024-02-15", amount: -45, category: "Grundsteuer" });
  return txs;
}

describe("calculateProfitability", () => {
  it("12 Monate Cashflow + AfA + steuerliches Ergebnis (250k Kaufpreis, 225k Gebäude)", () => {
    const result = calculateProfitability(
      buildYearTransactions(),
      {
        kaufpreis: 250_000,
        gebaeudewert: 225_000,
        afa_satz: 2.0,
      },
      { von: "2024-01-01", bis: "2024-12-31" },
      dbCategories,
    );

    // 12 × 1000 = 12.000 €
    expect(result.einnahmen).toBe(12_000);
    // 12 × 652 + 845 + 45 = 7.824 + 890 = 8.714
    expect(result.ausgaben).toBe(8_714);
    // 12.000 − 8.714 = 3.286
    expect(result.cashflow_brutto).toBe(3_286);
    // Schuldzinsen: 12 × 652 = 7.824
    expect(result.zinsen).toBe(7_824);
    // AfA: 225.000 × 2 % = 4.500 (12 Monate)
    expect(result.afa_jahresbetrag).toBe(4_500);
    expect(result.afa_periodenanteil).toBe(4_500);
    // Steuerlicher Gewinn: 3.286 − 4.500 = -1.214
    expect(result.steuerlicher_gewinn_verlust).toBe(-1_214);
    // Brutto-Rendite: 12.000 / 250.000 = 4,8 %
    expect(result.rendite_brutto).toBeCloseTo(4.8, 2);
    // Netto-Cashflow-Rendite: 3.286 / 250.000 ≈ 1,3144 %
    expect(result.rendite_netto).toBeCloseTo(1.3144, 2);
    expect(result.anzahl_monate).toBe(12);
  });

  it("Halbjahr (6 Monate) → AfA Pro-Rata", () => {
    const result = calculateProfitability(
      buildYearTransactions(),
      { kaufpreis: 250_000, gebaeudewert: 225_000, afa_satz: 2.0 },
      { von: "2024-01-01", bis: "2024-06-30" },
      dbCategories,
    );
    // 6 Mieten + Versicherung + Grundsteuer + 6 Zinsen
    expect(result.anzahl_monate).toBe(6);
    expect(result.einnahmen).toBe(6_000);
    expect(result.afa_periodenanteil).toBe(2_250); // 4.500 / 12 × 6
    // Annualisierung: 6.000 × (12/6) = 12.000 → Brutto-Rendite 4,8 %
    expect(result.rendite_brutto).toBeCloseTo(4.8, 2);
  });

  it("Keine Transaktionen → 0er-Werte (kein NaN)", () => {
    const result = calculateProfitability(
      [],
      { kaufpreis: 250_000, gebaeudewert: 225_000, afa_satz: 2.0 },
      { von: "2024-01-01", bis: "2024-12-31" },
      dbCategories,
    );
    expect(result.einnahmen).toBe(0);
    expect(result.ausgaben).toBe(0);
    expect(result.cashflow_brutto).toBe(0);
    // AfA wird trotzdem gerechnet (gehört nicht zu Transaktionen)
    expect(result.afa_periodenanteil).toBe(4_500);
    expect(result.steuerlicher_gewinn_verlust).toBe(-4_500);
    // Keine NaN-Werte irgendwo
    for (const v of Object.values(result)) {
      expect(Number.isFinite(v) || v === 0).toBe(true);
    }
  });

  it("Kesslerberg-Profil: 12.625 € Mieteinnahmen, 348-Tage-Vermietungsquote sichtbar", () => {
    // Kesslerberg 2024: 12 Monatsmieten = 12.625 €
    // (Goldstandard rent_income = 12.625)
    const txs: ProfitabilityTransaction[] = [
      ...Array.from({ length: 12 }, (_, i) => ({
        date: `2024-${String(i + 1).padStart(2, "0")}-15`,
        amount: 12_625 / 12,
        category: "Mieteinnahmen",
      })),
      // Schuldzinsen: 7.822 € lt. testdateien-PDF
      { date: "2024-06-30", amount: -7_822, category: "Schuldzinsen" },
    ];

    const result = calculateProfitability(
      txs,
      { kaufpreis: 250_000, gebaeudewert: 225_136.69, afa_satz: 5.56 },
      { von: "2024-01-01", bis: "2024-12-31" },
      dbCategories,
    );

    expect(result.einnahmen).toBeCloseTo(12_625, 0);
    expect(result.zinsen).toBe(7_822);
    // AfA = 225.136,69 × 5,56 % ≈ 12.517,60
    expect(result.afa_periodenanteil).toBeCloseTo(12_517.60, 1);
    // Steuerliches Ergebnis ≈ 12.625 − 7.822 − 12.517,60 ≈ -7.714,60
    expect(result.steuerlicher_gewinn_verlust).toBeCloseTo(-7_714.60, 1);
  });

  it("Unkategorisierte Transaktionen werden ignoriert (kein NaN durch null-Category)", () => {
    const txs: ProfitabilityTransaction[] = [
      { date: "2024-01-15", amount: 1_000, category: "Mieteinnahmen" },
      { date: "2024-01-16", amount: -500, category: null }, // unkategorisiert
      { date: "2024-01-17", amount: -100, category: "aufgeteilt" }, // Split-Origin
    ];
    const result = calculateProfitability(
      txs,
      { kaufpreis: 100_000, gebaeudewert: 90_000, afa_satz: 2.0 },
      { von: "2024-01-01", bis: "2024-12-31" },
      dbCategories,
    );
    expect(result.einnahmen).toBe(1_000);
    expect(result.ausgaben).toBe(0);
    expect(result.cashflow_brutto).toBe(1_000);
  });
});
