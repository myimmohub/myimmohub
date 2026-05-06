/**
 * Unit-Tests für `lib/tax/afa.ts` (Auftrag C).
 *
 * Die Helper konsolidieren drei vorher separate Implementierungen:
 *   - `lib/calculateAfA.ts` (Wrapper, weiterhin getestet in calculate-afa.test.ts)
 *   - `lib/tax/structuredTaxLogic.ts:deriveBuildingAfaRate`
 *   - `lib/tax/rentalTaxEngineBridge.ts:deriveBuildingRate`
 *
 * Alle drei rufen jetzt `resolveBuildingAfaRate` auf — wenn die Switches hier
 * grün sind, sind sie überall grün.
 *
 * Quellen:
 *   - § 7 Abs. 4 Nr. 1 EStG: Wohngebäude vor 1925 → 2,5 %.
 *   - § 7 Abs. 4 Nr. 2 EStG: Wohngebäude 1925..2022 → 2,0 %.
 *   - JStG 2022 / § 7 Abs. 4 Nr. 2 Buchst. a EStG: Wohngebäude ≥ 2023 → 3,0 %.
 */

import { describe, it, expect } from "vitest";
import { resolveBuildingAfaRate, resolveMovableAssetAfaRate } from "@/lib/tax/afa";

describe("resolveBuildingAfaRate · Baujahr-Grenzen", () => {
  it("Baujahr 1900 (Altbau) → 2,5 %", () => {
    expect(resolveBuildingAfaRate({ baujahr: 1900 })).toBe(0.025);
  });

  it("Grenzfall 1924 → 2,5 %", () => {
    expect(resolveBuildingAfaRate({ baujahr: 1924 })).toBe(0.025);
  });

  it("Grenzfall 1925 → 2,0 %", () => {
    expect(resolveBuildingAfaRate({ baujahr: 1925 })).toBe(0.02);
  });

  it("Standard-Baujahr 1990 → 2,0 %", () => {
    expect(resolveBuildingAfaRate({ baujahr: 1990 })).toBe(0.02);
  });

  it("Grenzfall 2022 → 2,0 % (JStG-2022 greift erst ab Fertigstellung 2023)", () => {
    expect(resolveBuildingAfaRate({ baujahr: 2022 })).toBe(0.02);
  });

  it("Grenzfall 2023 → 3,0 % (Neubau nach JStG 2022)", () => {
    expect(resolveBuildingAfaRate({ baujahr: 2023 })).toBe(0.03);
  });

  it("Baujahr 2024 → 3,0 %", () => {
    expect(resolveBuildingAfaRate({ baujahr: 2024 })).toBe(0.03);
  });

  it("Baujahr null/undefined → fallback 2,0 %", () => {
    expect(resolveBuildingAfaRate({ baujahr: null })).toBe(0.02);
    expect(resolveBuildingAfaRate({ baujahr: undefined })).toBe(0.02);
  });

  it("kaufdatum als zusätzliches Argument ändert die Rate NICHT (Rate folgt nur dem Baujahr)", () => {
    // Wir bauen eine Property mit Baujahr 2010, aber spätem Kaufdatum.
    // Die Rate hängt am Baujahr, nicht am Kaufdatum.
    expect(
      resolveBuildingAfaRate({ baujahr: 2010, kaufdatum: "2024-01-15" }),
    ).toBe(0.02);
  });

  it("propertyType-Hint wird aktuell ignoriert (Wohngebäude-Default), s. Code-Kommentar", () => {
    // Bewusste Doku: Wirtschaftsgebäude-Sondersätze sind nicht implementiert,
    // Verhalten muss daher mit Default-Pfad identisch sein.
    expect(
      resolveBuildingAfaRate({ baujahr: 2010, propertyType: "wirtschaftsgebaude" }),
    ).toBe(0.02);
  });
});

describe("resolveMovableAssetAfaRate · Inventar / Einbauküche", () => {
  it("Default 10 Jahre → 10 %", () => {
    expect(resolveMovableAssetAfaRate({})).toBeCloseTo(0.1, 6);
  });

  it("Explizite Nutzungsdauer 5 Jahre → 20 %", () => {
    expect(resolveMovableAssetAfaRate({ nutzungsdauerJahre: 5 })).toBeCloseTo(0.2, 6);
  });

  it("Custom Default 15 Jahre", () => {
    expect(resolveMovableAssetAfaRate({ defaultJahre: 15 })).toBeCloseTo(1 / 15, 6);
  });

  it("Garbage (0 / negativ / NaN) fällt auf Default zurück", () => {
    expect(resolveMovableAssetAfaRate({ nutzungsdauerJahre: 0 })).toBeCloseTo(0.1, 6);
    expect(resolveMovableAssetAfaRate({ nutzungsdauerJahre: -3 })).toBeCloseTo(0.1, 6);
    expect(resolveMovableAssetAfaRate({ nutzungsdauerJahre: NaN })).toBeCloseTo(0.1, 6);
  });

  it("Explizite Nutzungsdauer überschreibt defaultJahre", () => {
    expect(
      resolveMovableAssetAfaRate({ nutzungsdauerJahre: 8, defaultJahre: 15 }),
    ).toBeCloseTo(0.125, 6);
  });
});
