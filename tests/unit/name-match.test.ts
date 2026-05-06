/**
 * Unit-Tests für `counterpartMatchesLastName`.
 *
 * Stellt sicher, dass der Müller/Müll-Bug nicht mehr auftritt und dass
 * Compound-Worte ("Müllerstraße", "Müllabfuhr") nicht falsch matchen.
 */

import { describe, it, expect } from "vitest";
import {
  counterpartMatchesLastName,
  normalizeForNameMatch,
} from "@/lib/banking/nameMatch";

describe("counterpartMatchesLastName", () => {
  it('"Hans Müller" matched für lastName "Müller"', () => {
    expect(counterpartMatchesLastName("Hans Müller", "Müller")).toBe(true);
  });

  it('"Hans Müller" matched NICHT für lastName "Müll" (Substring)', () => {
    expect(counterpartMatchesLastName("Hans Müller", "Müll")).toBe(false);
  });

  it('"Müllerstraße 12" matched NICHT für lastName "Müller" (Compound)', () => {
    expect(counterpartMatchesLastName("Müllerstraße 12", "Müller")).toBe(false);
  });

  it('"Müllabfuhr Köln" matched NICHT für lastName "Müll" (Compound)', () => {
    expect(counterpartMatchesLastName("Müllabfuhr Köln", "Müll")).toBe(false);
  });

  it('"Müll" als reiner Counterpart matched für lastName "Müll"', () => {
    // Edge-Case: wenn ein Mieter wirklich "Müll" heißt
    expect(counterpartMatchesLastName("Müll", "Müll")).toBe(true);
    expect(counterpartMatchesLastName("Hans Müll", "Müll")).toBe(true);
  });

  it("Case-insensitive: lowercase und uppercase gleich", () => {
    expect(counterpartMatchesLastName("HANS MÜLLER", "müller")).toBe(true);
    expect(counterpartMatchesLastName("hans müller", "MÜLLER")).toBe(true);
  });

  it("Sonderzeichen / Komma als Wortgrenze", () => {
    expect(counterpartMatchesLastName("Müller, Hans", "Müller")).toBe(true);
    expect(counterpartMatchesLastName("Hans-Müller", "Müller")).toBe(true);
    expect(counterpartMatchesLastName("Hans.Müller", "Müller")).toBe(true);
  });

  it("ß-Normalisierung: 'Strauß' matched 'Strauss'", () => {
    expect(counterpartMatchesLastName("Hans Strauß", "Strauss")).toBe(true);
    expect(counterpartMatchesLastName("Hans Strauss", "Strauß")).toBe(true);
  });

  it("Umlaut-Normalisierung: 'Schäfer' matched 'Schaefer' nicht (heuristisch nicht)", () => {
    // Achtung: NFD entfernt Akzente — "ä" → "a", aber "ae" bleibt "ae".
    // Daher matched 'Schäfer' (→ 'schafer') NICHT 'Schaefer' (→ 'schaefer').
    // Das ist akzeptierte Limitation; wir testen den umlautlosen Fall.
    expect(counterpartMatchesLastName("Hans Müller", "Mueller")).toBe(false);
    // ä → a normalisiert beide
    expect(counterpartMatchesLastName("Hans Schäfer", "Schäfer")).toBe(true);
    expect(counterpartMatchesLastName("Hans Schafer", "Schäfer")).toBe(true);
  });

  it("Leere oder null Eingaben → false (kein Match)", () => {
    expect(counterpartMatchesLastName("", "Müller")).toBe(false);
    expect(counterpartMatchesLastName(null, "Müller")).toBe(false);
    expect(counterpartMatchesLastName("Hans Müller", "")).toBe(false);
    expect(counterpartMatchesLastName("Hans Müller", null)).toBe(false);
    expect(counterpartMatchesLastName(null, null)).toBe(false);
  });

  it("Extrem kurze Namen 'Li', 'Ng' funktionieren mit Wortgrenze", () => {
    expect(counterpartMatchesLastName("Hans Li", "Li")).toBe(true);
    expect(counterpartMatchesLastName("Wei Ng", "Ng")).toBe(true);
    // KEIN Match: "Li" in "Lifestyle" oder "Lieferung"
    expect(counterpartMatchesLastName("Lifestyle GmbH", "Li")).toBe(false);
    expect(counterpartMatchesLastName("Lieferung Köln", "Li")).toBe(false);
    expect(counterpartMatchesLastName("Bringt Lifestyle", "Li")).toBe(false);
  });

  it("Mehrere Wörter im Counterpart, exakter Match in der Mitte", () => {
    expect(
      counterpartMatchesLastName("Mietzahlung Hans Müller November 2024", "Müller"),
    ).toBe(true);
  });

  it("normalizeForNameMatch: Hilfsfunktion korrekt", () => {
    expect(normalizeForNameMatch("Müller")).toBe("muller");
    expect(normalizeForNameMatch("STRAUß")).toBe("strauss");
    expect(normalizeForNameMatch(null)).toBe("");
    expect(normalizeForNameMatch("Hans-Müller")).toBe("hans muller");
  });
});
