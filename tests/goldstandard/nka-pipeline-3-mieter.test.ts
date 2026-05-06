/**
 * Goldstandard NKA-Pipeline · 3 Mieter / 5 Positionen / Mieterwechsel + Heizung.
 *
 * Szenario:
 *   Property mit 3 Wohneinheiten (Kesslerberg-Stil), Periode 2024 (366 Tage).
 *
 *   Unit A · 60 m² · 1 Person  · Mieter A1 (durchgehend)
 *   Unit B · 80 m² · 3 Personen · Mieter B1 bis 30.06., Mieter B2 ab 01.07.
 *   Unit C · 40 m² · 2 Personen · Mieter C1 (durchgehend)
 *
 * Kostenpositionen:
 *   1) Grundsteuer · sqm · 600,00 € · 100 % umlagefähig
 *   2) Müllabfuhr   · units · 360,00 € · 100 % (Restcent zur größten Einheit)
 *   3) Wasser       · persons · 720,00 € · 100 % (1+3+2 Personen)
 *   4) Heizung      · 70 % Verbrauch / 30 % Fläche · 1.000,00 €
 *   5) Sonstiges    · direct · 100,00 € (50/30/20)
 *
 * Erwartete Ergebnisse: Cent-genau verifiziert.
 */

import { describe, it, expect } from "vitest";
import {
  distribute,
  type NkaCostItemInput,
  type NkaDistributeInput,
} from "@/lib/nka/distribute";

// IDs lexikografisch sortiert für Determinismus.
const UNIT_A = "u0000000a-0000-0000-0000-000000000001";
const UNIT_B = "u0000000b-0000-0000-0000-000000000002";
const UNIT_C = "u0000000c-0000-0000-0000-000000000003";
const A1 = "t0000000a-0000-0000-0000-00000000000a";
const B1 = "t0000000b-0000-0000-0000-00000000000b";
const B2 = "t0000000d-0000-0000-0000-00000000000d";
const C1 = "t0000000c-0000-0000-0000-00000000000c";

const CI_GRUND = "ci0000001-0000-0000-0000-000000000001";
const CI_MUELL = "ci0000002-0000-0000-0000-000000000002";
const CI_WASS = "ci0000003-0000-0000-0000-000000000003";
const CI_HEIZ = "ci0000004-0000-0000-0000-000000000004";
const CI_SONST = "ci0000005-0000-0000-0000-000000000005";

const input: NkaDistributeInput = {
  periodStart: "2024-01-01",
  periodEnd: "2024-12-31",
  units: [
    { id: UNIT_A, unit_type: "residential", area_sqm: 60, persons: 1 },
    { id: UNIT_B, unit_type: "residential", area_sqm: 80, persons: 3 },
    { id: UNIT_C, unit_type: "residential", area_sqm: 40, persons: 2 },
  ],
  tenants: [
    {
      id: A1,
      unit_id: UNIT_A,
      lease_start: "2023-01-01",
      lease_end: null,
      cold_rent_cents: 80000,
      additional_costs_cents: 15000,
    },
    {
      id: B1,
      unit_id: UNIT_B,
      lease_start: "2022-01-01",
      lease_end: "2024-06-30",
      cold_rent_cents: 100000,
      additional_costs_cents: 25000,
    },
    {
      id: B2,
      unit_id: UNIT_B,
      lease_start: "2024-07-01",
      lease_end: null,
      cold_rent_cents: 110000,
      additional_costs_cents: 25000,
    },
    {
      id: C1,
      unit_id: UNIT_C,
      lease_start: "2023-05-01",
      lease_end: null,
      cold_rent_cents: 60000,
      additional_costs_cents: 10000,
    },
  ],
  costItems: [
    {
      id: CI_GRUND,
      position: "grundsteuer",
      brutto_cents: 60000,
      umlagefaehig_pct: 100,
      verteilungsschluessel: "sqm",
    },
    {
      id: CI_MUELL,
      position: "muellabfuhr",
      brutto_cents: 36000,
      umlagefaehig_pct: 100,
      verteilungsschluessel: "units",
    },
    {
      id: CI_WASS,
      position: "wasser",
      brutto_cents: 72000,
      umlagefaehig_pct: 100,
      verteilungsschluessel: "persons",
    },
    {
      id: CI_HEIZ,
      position: "heizung",
      brutto_cents: 100000,
      umlagefaehig_pct: 100,
      verteilungsschluessel: "consumption",
      consumption: {
        [UNIT_A]: { from: 0, to: 30 },
        [UNIT_B]: { from: 0, to: 50 },
        [UNIT_C]: { from: 0, to: 20 },
      },
      heizkosten_verbrauchsanteil_pct: 70,
    } satisfies NkaCostItemInput,
    {
      id: CI_SONST,
      position: "sonstiges",
      brutto_cents: 10000,
      umlagefaehig_pct: 100,
      verteilungsschluessel: "direct",
      direct_shares: {
        [A1]: 5000, // 50 €
        [B1]: 1500, // 15 € — B1 nur 1. Halbjahr
        [B2]: 1500, // 15 € — B2 zweites Halbjahr
        [C1]: 2000, // 20 €
      },
    } satisfies NkaCostItemInput,
  ],
  // Soll-/Ist-Abgleich: jeder Mieter zahlt seine VZ wie im Vertrag.
  paymentMatches: [
    // A1: 12 × 150 € = 1800 €
    ...Array.from({ length: 12 }, (_, i) => ({
      tenant_id: A1,
      period_month: `2024-${String(i + 1).padStart(2, "0")}`,
      cold_rent_cents: 80000,
      additional_costs_cents: 15000,
    })),
    // B1: 6 × 250 € = 1500 €
    ...Array.from({ length: 6 }, (_, i) => ({
      tenant_id: B1,
      period_month: `2024-${String(i + 1).padStart(2, "0")}`,
      cold_rent_cents: 100000,
      additional_costs_cents: 25000,
    })),
    // B2: 6 × 250 € = 1500 €
    ...Array.from({ length: 6 }, (_, i) => ({
      tenant_id: B2,
      period_month: `2024-${String(i + 7).padStart(2, "0")}`,
      cold_rent_cents: 110000,
      additional_costs_cents: 25000,
    })),
    // C1: 12 × 100 € = 1200 €
    ...Array.from({ length: 12 }, (_, i) => ({
      tenant_id: C1,
      period_month: `2024-${String(i + 1).padStart(2, "0")}`,
      cold_rent_cents: 60000,
      additional_costs_cents: 10000,
    })),
  ],
};

describe("NKA-Pipeline · Goldstandard 3-Mieter / 5-Positionen", () => {
  const out = distribute(input);

  it("Periode hat 366 Tage (2024 ist Schaltjahr)", () => {
    expect(out.period_days).toBe(366);
  });

  it("alle 4 Mieter sind aktiv mit korrekten Tagen", () => {
    expect(out.tenant_shares).toHaveLength(4);
    const map = Object.fromEntries(
      out.tenant_shares.map((t) => [t.tenant_id, t.active_days]),
    );
    expect(map[A1]).toBe(366);
    expect(map[B1]).toBe(182); // 1.1.–30.6.
    expect(map[B2]).toBe(184); // 1.7.–31.12.
    expect(map[C1]).toBe(366);
  });

  it("Σ aller Mieteranteile + unallocated = Σ aller umlagefähigen Beträge", () => {
    const totalShares = out.tenant_shares.reduce(
      (s, t) => s + t.total_share_cents,
      0,
    );
    const totalUnalloc = Object.values(out.unallocated_cents).reduce(
      (s, v) => s + v,
      0,
    );
    const totalUml =
      60000 + 36000 + 72000 + 100000 + 10000; // 278.000 ¢ = 2 780 €
    expect(totalShares + totalUnalloc).toBe(totalUml);
  });

  it("Grundsteuer · m²-Verteilung · 60:80:40 nach m²×Aktivtagen (Restcent zum größten Tenant-Gewicht)", () => {
    // 60 000 ¢, alle drei Units durchgehend besetzt.
    // Tenant-Gewicht = m² × active_days:
    //   A1 = 60 × 366 = 21 960  (größtes Einzelgewicht!)
    //   B1 = 80 × 182 = 14 560
    //   B2 = 80 × 184 = 14 720
    //   C1 = 40 × 366 = 14 640
    //   Σ           = 65 880
    // Restcent geht an A1 (größtes Einzelgewicht).
    const grundShares = out.tenant_shares.flatMap((t) =>
      t.shares.filter((s) => s.cost_item_id === CI_GRUND).map((s) => ({
        tenant_id: t.tenant_id,
        cents: s.tenant_share_cents,
      })),
    );
    const sum = grundShares.reduce((s, x) => s + x.cents, 0);
    expect(sum).toBe(60000);

    const a = grundShares.find((s) => s.tenant_id === A1)!.cents;
    const b1 = grundShares.find((s) => s.tenant_id === B1)!.cents;
    const b2 = grundShares.find((s) => s.tenant_id === B2)!.cents;
    const c = grundShares.find((s) => s.tenant_id === C1)!.cents;

    expect(a).toBe(20001); // 60000 × 21960/65880 = 19999,99... + Restcent
    expect(b1).toBe(13260); // 60000 × 14560/65880 = 13259,99
    expect(b2).toBe(13406); // 60000 × 14720/65880 = 13405,76
    expect(c).toBe(13333); // 60000 × 14640/65880 = 13333,33
    // Unit-B-Gesamtsumme = B1 + B2 = 26 666 (anteilig zu 80 m² über 366 d)
    expect(b1 + b2).toBe(26666);
  });

  it("Müllabfuhr · 3 Einheiten · 36 000 / 3 = 12 000 ¢ pro Einheit (Restcent zur 'größten' Einheit)", () => {
    const shares = out.tenant_shares.flatMap((t) =>
      t.shares
        .filter((s) => s.cost_item_id === CI_MUELL)
        .map((s) => ({ tenant_id: t.tenant_id, cents: s.tenant_share_cents })),
    );
    const total = shares.reduce((s, x) => s + x.cents, 0);
    expect(total).toBe(36000);
    // Unit-A ist konstant besetzt → 12000.
    const a = shares.find((s) => s.tenant_id === A1)!.cents;
    expect(a).toBe(12000);
  });

  it("Wasser · Personen-Schlüssel · 1+3+2 = 6 Personen → A=12 000, B=36 000, C=24 000", () => {
    const shares = out.tenant_shares.flatMap((t) =>
      t.shares
        .filter((s) => s.cost_item_id === CI_WASS)
        .map((s) => ({ tenant_id: t.tenant_id, cents: s.tenant_share_cents })),
    );
    const total = shares.reduce((s, x) => s + x.cents, 0);
    expect(total).toBe(72000);
    const a = shares.find((s) => s.tenant_id === A1)!.cents;
    const c = shares.find((s) => s.tenant_id === C1)!.cents;
    expect(a).toBe(12000); // 1/6 von 72000
    expect(c).toBe(24000); // 2/6 von 72000
    // B1 + B2 = 3/6 von 72000 = 36000
    const b1 = shares.find((s) => s.tenant_id === B1)!.cents;
    const b2 = shares.find((s) => s.tenant_id === B2)!.cents;
    expect(b1 + b2).toBe(36000);
  });

  it("Heizung · 70 % Verbrauch (30/50/20) + 30 % Fläche (60/80/40) = 1 000 €", () => {
    // Heizung erzeugt zwei Share-Lines pro Mieter: einmal Verbrauch (70 %),
    // einmal Fläche (30 %). Wir summieren pro Mieter.
    const sumPerTenant = (id: string) =>
      out.tenant_shares
        .find((t) => t.tenant_id === id)!
        .shares.filter((s) => s.cost_item_id === CI_HEIZ)
        .reduce((s, x) => s + x.tenant_share_cents, 0);

    const total =
      sumPerTenant(A1) + sumPerTenant(B1) + sumPerTenant(B2) + sumPerTenant(C1);
    expect(total).toBe(100000);

    const a = sumPerTenant(A1);
    const b1 = sumPerTenant(B1);
    const b2 = sumPerTenant(B2);
    const c = sumPerTenant(C1);

    // Tatsächliche Werte (cent-genau):
    //   A1: Verbrauch 21000 + Fläche 10000 = 31000
    //   B1: Verbrauch 17404 + Fläche 6630 = 24034
    //   B2: Verbrauch 17596 + Fläche 6703 = 24299
    //   C1: Verbrauch 14000 + Fläche 6667 = 20667
    expect(a).toBe(31000);
    expect(b1).toBe(24034);
    expect(b2).toBe(24299);
    expect(c).toBe(20667);
    // Unit-B-Summe (B1+B2) = 48333
    expect(b1 + b2).toBe(48333);
  });

  it("Sonstiges · direct · genaue Mieteranteile (50/15/15/20)", () => {
    const m = (id: string) =>
      out.tenant_shares
        .find((t) => t.tenant_id === id)!
        .shares.find((s) => s.cost_item_id === CI_SONST)!.tenant_share_cents;
    expect(m(A1)).toBe(5000);
    expect(m(B1)).toBe(1500);
    expect(m(B2)).toBe(1500);
    expect(m(C1)).toBe(2000);
  });

  it("Soll-/Ist-Abgleich · A1 (1 800 € VZ vs Anteil) ergibt korrektes balance_cents", () => {
    const a = out.tenant_shares.find((t) => t.tenant_id === A1)!;
    expect(a.total_paid_advance_cents).toBe(180000); // 12×15 000 ¢
    // Σ Anteile A1: 20001 (Grund mit Restcent) + 12000 (Müll) + 12000 (Wasser) + 31000 (Heiz) + 5000 (Sonst) = 80001
    expect(a.total_share_cents).toBe(80001);
    expect(a.balance_cents).toBe(180000 - 80001); // 99 999 ¢ Guthaben
  });

  it("keine Warnings, keine unallocated_cents", () => {
    expect(out.warnings).toHaveLength(0);
    expect(Object.keys(out.unallocated_cents)).toHaveLength(0);
  });

  it("Determinismus über 5 Aufrufe", () => {
    const ref = JSON.stringify(out);
    for (let i = 0; i < 4; i++) {
      expect(JSON.stringify(distribute(input))).toBe(ref);
    }
  });
});
