/**
 * Unit-Tests für `lib/calculateAfA.ts`.
 *
 * Pure Function: Baujahr → AfA-Satz lookup nach § 7 Abs. 4 EStG:
 *   - Baujahr  < 1925 → 2,5 %  (Altbau)
 *   - 1925 ≤ Baujahr ≤ 2022 → 2,0 %  (Standard, vor JStG 2022)
 *   - Baujahr  > 2022 → 3,0 %  (Neubau ab 01.01.2023, JStG 2022)
 */

import { describe, it, expect } from "vitest";
import { calculateAfA } from "@/lib/calculateAfA";

describe("calculateAfA", () => {
  it("Altbau vor 1925 → 2,5 %", () => {
    const r = calculateAfA(1900, 200_000);
    expect(r.satz).toBe(0.025);
    expect(r.jahresbetrag).toBe(5_000);
  });

  it("Grenzfall 1924 → 2,5 %", () => {
    const r = calculateAfA(1924, 100_000);
    expect(r.satz).toBe(0.025);
    expect(r.jahresbetrag).toBe(2_500);
  });

  it("Grenzfall 1925 → 2,0 %", () => {
    const r = calculateAfA(1925, 100_000);
    expect(r.satz).toBe(0.02);
    expect(r.jahresbetrag).toBe(2_000);
  });

  it("Standard 1990 → 2,0 %", () => {
    const r = calculateAfA(1990, 250_000);
    expect(r.satz).toBe(0.02);
    expect(r.jahresbetrag).toBe(5_000);
  });

  it("Grenzfall 2022 → 2,0 %", () => {
    const r = calculateAfA(2022, 300_000);
    expect(r.satz).toBe(0.02);
    expect(r.jahresbetrag).toBe(6_000);
  });

  it("Neubau 2023 → 3,0 %  (JStG 2022)", () => {
    const r = calculateAfA(2023, 400_000);
    expect(r.satz).toBe(0.03);
    expect(r.jahresbetrag).toBe(12_000);
  });

  it("Neubau 2024 → 3,0 %", () => {
    const r = calculateAfA(2024, 500_000);
    expect(r.satz).toBe(0.03);
    expect(r.jahresbetrag).toBe(15_000);
  });

  it("Kaufpreis 0 → Jahresbetrag 0", () => {
    const r = calculateAfA(2000, 0);
    expect(r.satz).toBe(0.02);
    expect(r.jahresbetrag).toBe(0);
  });

  it("Property-Beispiel: Ferienwohnung Baujahr 1990, 225_136,69 € Gebäudewert", () => {
    const r = calculateAfA(1990, 225_136.69);
    expect(r.satz).toBe(0.02);
    // 225.136,69 × 0,02 = 4502.7338
    expect(r.jahresbetrag).toBeCloseTo(4_502.73, 2);
  });
});
