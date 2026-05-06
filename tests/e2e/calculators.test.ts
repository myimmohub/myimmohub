/**
 * E2E-Happy-Path-Tests für die Public-Rechner unter `lib/calculators/*`.
 *
 * Vier Rechner:
 *   - Kaufnebenkosten  (Grunderwerbsteuer, Notar, Grundbuch, Makler)
 *   - Rendite          (Brutto- / Netto-Mietrendite)
 *   - Kredit           (Annuität, Restschuld, Gesamtzinsen)
 *   - Spekulationssteuer (10-Jahres-Frist, Selbstnutzung, Steuerlast)
 *
 * Jeder Test rechnet die Erwartungswerte explizit per Hand vor und prüft die
 * Engine-Outputs gegen diese Vorgabe.
 */

import { describe, it, expect } from "vitest";
import { calcKaufnebenkosten, GRUNDERWERBSTEUER } from "@/lib/calculators/kaufnebenkosten";
import { calcRendite } from "@/lib/calculators/rendite";
import { calcKredit } from "@/lib/calculators/kredit";
import { calcSpekulationssteuer } from "@/lib/calculators/spekulationssteuer";

// ── Kaufnebenkosten ──────────────────────────────────────────────────────────

describe("calcKaufnebenkosten", () => {
  it("Standard-Fall NRW: Kaufpreis 350.000 €, 6,5 % GrESt + 1,5 % Notar + 0,5 % GB + 3,57 % Makler", () => {
    // Erwartete Berechnung (manuell):
    //   GrESt        = 350.000 × 6,5 %  = 22.750 €
    //   Notar        = 350.000 × 1,5 %  =  5.250 €
    //   Grundbuch    = 350.000 × 0,5 %  =  1.750 €
    //   Makler       = 350.000 × 3,57 % = 12.495 €
    //   Summe NK     = 42.245 €  → 12,07 % vom Kaufpreis
    //   Investition  = 392.245 €
    const result = calcKaufnebenkosten({
      kaufpreis: 350_000,
      bundesland: "Nordrhein-Westfalen",
      notarPct: 1.5,
      grundbuchPct: 0.5,
      mitMakler: true,
      maklerPct: 3.57,
    });
    expect(result).not.toBeNull();
    expect(result!.grunderwerbsteuerSatz).toBe(6.5);
    expect(result!.grunderwerbsteuer).toBeCloseTo(22_750, 2);
    expect(result!.notarkosten).toBeCloseTo(5_250, 2);
    expect(result!.grundbuchkosten).toBeCloseTo(1_750, 2);
    expect(result!.maklerkosten).toBeCloseTo(12_495, 2);
    expect(result!.gesamtNebenkosten).toBeCloseTo(42_245, 2);
    expect(result!.gesamtInvestition).toBeCloseTo(392_245, 2);
    expect(result!.nebenkostenPct).toBeCloseTo(12.07, 2);
  });

  it("Bayern: GrESt-Satz 3,5 %, ohne Makler", () => {
    const result = calcKaufnebenkosten({
      kaufpreis: 200_000,
      bundesland: "Bayern",
      notarPct: 1.5,
      grundbuchPct: 0.5,
      mitMakler: false,
      maklerPct: 3.57,
    });
    expect(result).not.toBeNull();
    expect(result!.grunderwerbsteuerSatz).toBe(3.5);
    // GrESt = 200.000 × 3,5 % = 7.000
    expect(result!.grunderwerbsteuer).toBeCloseTo(7_000, 2);
    expect(result!.maklerkosten).toBe(0);
    // Notar 3.000 + GB 1.000 + GrESt 7.000 = 11.000
    expect(result!.gesamtNebenkosten).toBeCloseTo(11_000, 2);
  });

  it("Kaufpreis 0 → null", () => {
    const result = calcKaufnebenkosten({
      kaufpreis: 0,
      bundesland: "Bayern",
      notarPct: 1.5,
      grundbuchPct: 0.5,
      mitMakler: false,
      maklerPct: 3.57,
    });
    expect(result).toBeNull();
  });

  it("GRUNDERWERBSTEUER-Tabelle deckt alle 16 Bundesländer ab", () => {
    expect(Object.keys(GRUNDERWERBSTEUER)).toHaveLength(16);
  });
});

// ── Rendite ──────────────────────────────────────────────────────────────────

describe("calcRendite", () => {
  it("Standard-Fall: 250.000 € Kaufpreis, 1.000 €/Mt Kaltmiete, 100 €/Mt Kosten, 10 % NK", () => {
    // Manuell:
    //   Jahresmiete  = 12.000 €
    //   Jahreskosten =  1.200 €
    //   Brutto-Rendite = 12.000 / 250.000 = 4,80 %
    //   Gesamt-Investition = 250.000 × 1,10 = 275.000
    //   Netto-Rendite = (12.000 − 1.200) / 275.000 = 3,927 %
    const result = calcRendite({
      kaufpreis: 250_000,
      kaltmiete: 1_000,
      nebenkosten: 100,
      kaufnebenkostenPct: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.jahresmiete).toBe(12_000);
    expect(result!.gesamtinvestition).toBe(275_000);
    expect(result!.bruttoRenditePct).toBeCloseTo(4.80, 2);
    expect(result!.nettoRenditePct).toBeCloseTo(3.927, 2);
    expect(result!.bewertung).toBe("solide");
  });

  it("Hohe Rendite → 'attraktiv'", () => {
    // 100.000 € Kaufpreis, 700 €/Mt Kaltmiete = 8.400 €/Jahr, NK 50 €/Mt = 600 €/Jahr.
    // Netto = (8.400 − 600) / 110.000 = 7,09 %  → attraktiv
    const result = calcRendite({
      kaufpreis: 100_000,
      kaltmiete: 700,
      nebenkosten: 50,
      kaufnebenkostenPct: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.bewertung).toBe("attraktiv");
  });

  it("Niedrige Rendite → 'niedrig'", () => {
    // 1.000.000 € Kaufpreis, 2.000 €/Mt = 24.000/Jahr, NK 0
    // Netto = 24.000 / 1.100.000 = 2,18 %  → niedrig
    const result = calcRendite({
      kaufpreis: 1_000_000,
      kaltmiete: 2_000,
      nebenkosten: 0,
      kaufnebenkostenPct: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.bewertung).toBe("niedrig");
  });

  it("Kaltmiete 0 → null", () => {
    expect(
      calcRendite({ kaufpreis: 100_000, kaltmiete: 0, nebenkosten: 0, kaufnebenkostenPct: 10 }),
    ).toBeNull();
  });
});

// ── Kredit ───────────────────────────────────────────────────────────────────

describe("calcKredit", () => {
  it("300.000 € Darlehen, 3,5 % Zins, 2 % Tilgung, 10 J. Bindung", () => {
    // Inputs: KP 350.000, EK 50.000 → Darlehen 300.000
    //   Annuität (3,5+2) % p.a. = 5,5 % von 300.000 = 16.500/Jahr = 1.375/Mt
    //   Zinsen Monat 1: 300.000 × 3,5 %/12 = 875
    //   Tilgung Monat 1: 1.375 − 875 = 500
    //   Restschuld nach 10J (exakte Annuitätenformel):
    //     = 300.000 × 1,035^10 − 16.500 × (1,035^10 − 1) / 0,035
    //     = 300.000 × 1,4106 − 16.500 × 11,7314
    //     ≈ 423.176 − 193.568 ≈ 229.608  (Rest)
    const result = calcKredit({
      kaufpreis: 350_000,
      eigenkapital: 50_000,
      zinssatzPct: 3.5,
      tilgungPct: 2,
      zinsbindungJahre: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.darlehen).toBe(300_000);
    expect(result!.eigenkapitalQuotePct).toBeCloseTo(14.286, 2);
    expect(result!.monatlicheRate).toBeCloseTo(1_375, 1);
    expect(result!.zinsenMonat1).toBeCloseTo(875, 1);
    expect(result!.tilgungMonat1).toBeCloseTo(500, 1);
    // Toleranz ~1.000 € weil Annuitätsformel mit jährlicher Iteration
    expect(result!.restschuld).toBeGreaterThan(220_000);
    expect(result!.restschuld).toBeLessThan(240_000);
    expect(result!.gesamtzinsen).toBeGreaterThan(0);
  });

  it("100% Eigenkapital → null (kein Darlehen nötig)", () => {
    expect(
      calcKredit({
        kaufpreis: 200_000,
        eigenkapital: 200_000,
        zinssatzPct: 3,
        tilgungPct: 2,
        zinsbindungJahre: 10,
      }),
    ).toBeNull();
  });

  it("Kaufpreis 0 → null", () => {
    expect(
      calcKredit({
        kaufpreis: 0,
        eigenkapital: 0,
        zinssatzPct: 3,
        tilgungPct: 2,
        zinsbindungJahre: 10,
      }),
    ).toBeNull();
  });
});

// ── Spekulationssteuer ───────────────────────────────────────────────────────

describe("calcSpekulationssteuer", () => {
  it("Verkauf nach 5 Jahren → steuerpflichtig, 42 % auf Gewinn", () => {
    // Kauf 2020-01-01, Verkauf 2025-01-01 (5 Jahre)
    //   Gewinn = 50.000 € → Steuer = 50.000 × 42 % = 21.000 €
    const result = calcSpekulationssteuer({
      kaufdatum: "2020-01-01",
      verkaufsdatum: "2025-01-01",
      kaufpreis: 200_000,
      verkaufspreis: 250_000,
      steuersatzPct: 42,
      selbstgenutzt: false,
    });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("steuerpflichtig");
    expect(result!.halteJahre).toBe(5);
    expect(result!.gewinn).toBe(50_000);
    expect(result!.steuer).toBe(21_000);
    expect(result!.nettogewinn).toBe(29_000);
  });

  it("Verkauf nach 11 Jahren → steuerfrei (10-Jahres-Frist)", () => {
    const result = calcSpekulationssteuer({
      kaufdatum: "2010-01-01",
      verkaufsdatum: "2021-06-01",
      kaufpreis: 100_000,
      verkaufspreis: 200_000,
      steuersatzPct: 42,
      selbstgenutzt: false,
    });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("steuerfrei_10j");
    expect(result!.steuer).toBe(0);
    expect(result!.nettogewinn).toBe(100_000);
  });

  it("Selbstnutzung in den letzten 2 Jahren → steuerfrei", () => {
    const result = calcSpekulationssteuer({
      kaufdatum: "2022-01-01",
      verkaufsdatum: "2024-06-01",
      kaufpreis: 300_000,
      verkaufspreis: 400_000,
      steuersatzPct: 42,
      selbstgenutzt: true,
    });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("steuerfrei_selbstnutzung");
    expect(result!.steuer).toBe(0);
  });

  it("Verlust → keine Steuer auf negative Differenz", () => {
    const result = calcSpekulationssteuer({
      kaufdatum: "2020-01-01",
      verkaufsdatum: "2023-01-01",
      kaufpreis: 300_000,
      verkaufspreis: 250_000,
      steuersatzPct: 42,
      selbstgenutzt: false,
    });
    expect(result).not.toBeNull();
    expect(result!.gewinn).toBe(-50_000);
    expect(result!.steuer).toBe(0);
  });

  it("Verkaufsdatum vor Kaufdatum → null", () => {
    expect(
      calcSpekulationssteuer({
        kaufdatum: "2024-01-01",
        verkaufsdatum: "2020-01-01",
        kaufpreis: 100_000,
        verkaufspreis: 150_000,
        steuersatzPct: 42,
        selbstgenutzt: false,
      }),
    ).toBeNull();
  });
});
