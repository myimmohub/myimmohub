/**
 * Goldstandard-Tests für die NKA Verteilungs-Engine `distribute()`.
 *
 * Stellt sicher:
 * - Cent-genaue Summen je Position (Σ tenant_share + vacant = umlagefähig)
 * - Pro-rata-Tagesgewichtung bei Mieterwechsel
 * - HeizkostenV §7 Verbrauchsanteil-Logik (Default 70/30)
 * - Direct-Schlüssel + Mismatch-Warnings
 * - Determinismus (5x identische Ausgabe)
 */

import { describe, it, expect } from "vitest";
import {
  distribute,
  type NkaCostItemInput,
  type NkaDistributeInput,
  type NkaTenantInput,
  type NkaUnitInput,
} from "@/lib/nka/distribute";

// ─── Fixture-Helper ──────────────────────────────────────────────────────────

const TID = (n: number) => `t000000${n}`.padStart(8, "0");
const UID = (n: number) => `u000000${n}`.padStart(8, "0");
const CID = (n: number) => `c000000${n}`.padStart(8, "0");

const PERIOD = { periodStart: "2024-01-01", periodEnd: "2024-12-31" } as const;

function unit(idx: number, area: number, persons = 1): NkaUnitInput {
  return {
    id: UID(idx),
    unit_type: "residential",
    area_sqm: area,
    persons,
    vat_liable: false,
  };
}

function tenant(
  idx: number,
  unitIdx: number,
  leaseStart = "2023-01-01",
  leaseEnd: string | null = null,
  cold = 80000,
  add = 15000,
): NkaTenantInput {
  return {
    id: TID(idx),
    unit_id: UID(unitIdx),
    lease_start: leaseStart,
    lease_end: leaseEnd,
    cold_rent_cents: cold,
    additional_costs_cents: add,
  };
}

function costItem(
  idx: number,
  position: NkaCostItemInput["position"],
  schluessel: NkaCostItemInput["verteilungsschluessel"],
  brutto: number,
  pct = 100,
  extras: Partial<NkaCostItemInput> = {},
): NkaCostItemInput {
  return {
    id: CID(idx),
    position,
    label: null,
    brutto_cents: brutto,
    umlagefaehig_pct: pct,
    verteilungsschluessel: schluessel,
    ...extras,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("distribute() · Test 1: Trivialer Fall (1 Mieter, 1 Position)", () => {
  it("verteilt komplette umlagefähige Summe exakt auf den einen Mieter", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 80)],
      tenants: [tenant(1, 1, "2024-01-01", null)],
      costItems: [costItem(1, "grundsteuer", "sqm", 50000, 100)],
    };
    const out = distribute(input);
    expect(out.tenant_shares).toHaveLength(1);
    expect(out.tenant_shares[0].total_share_cents).toBe(50000);
    expect(out.tenant_shares[0].active_days).toBe(366); // 2024 ist Schaltjahr
    expect(Object.keys(out.unallocated_cents)).toHaveLength(0);
    expect(out.warnings).toHaveLength(0);
  });
});

describe("distribute() · Test 2: 3 Mieter, 2 Positionen, m²-Schlüssel", () => {
  it("verteilt cent-genau und packt Restcent zur größten Einheit", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 50), unit(2, 70), unit(3, 30)],
      tenants: [
        tenant(1, 1, "2024-01-01", null),
        tenant(2, 2, "2024-01-01", null),
        tenant(3, 3, "2024-01-01", null),
      ],
      costItems: [
        costItem(1, "grundsteuer", "sqm", 100001, 100), // unteilbar
        costItem(2, "wasser", "sqm", 30000, 100),
      ],
    };
    const out = distribute(input);
    // Σ tenant_shares = umlagefähig (100001 + 30000)
    const totalShareSum = out.tenant_shares.reduce(
      (s, t) => s + t.total_share_cents,
      0,
    );
    expect(totalShareSum).toBe(100001 + 30000);

    // Restcent geht zur größten Einheit (Mieter 2, 70 m²).
    // Mieter 2 darf in Summe der größte Empfänger sein.
    const m2 = out.tenant_shares.find((t) => t.tenant_id === TID(2));
    const m1 = out.tenant_shares.find((t) => t.tenant_id === TID(1));
    const m3 = out.tenant_shares.find((t) => t.tenant_id === TID(3));
    expect(m2!.total_share_cents).toBeGreaterThan(m1!.total_share_cents);
    expect(m2!.total_share_cents).toBeGreaterThan(m3!.total_share_cents);
  });
});

describe("distribute() · Test 3: m²-Schlüssel mit Leerstand 2 Monate", () => {
  it("packt Leerstand-Anteil in unallocated_cents", () => {
    // Unit 2 ist nur 10 Monate vermietet (Mieter ab 2024-03-01).
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 50), unit(2, 50)],
      tenants: [
        tenant(1, 1, "2024-01-01", null),
        tenant(2, 2, "2024-03-01", null),
      ],
      costItems: [costItem(1, "grundsteuer", "sqm", 100000, 100)],
    };
    const out = distribute(input);
    expect(out.unallocated_cents[CID(1)]).toBeGreaterThan(0);
    // Mieter-Σ + Leerstand = umlagefähig
    const tenantSum = out.tenant_shares.reduce(
      (s, t) => s + t.total_share_cents,
      0,
    );
    expect(tenantSum + (out.unallocated_cents[CID(1)] ?? 0)).toBe(100000);
  });
});

describe("distribute() · Test 4: Mieterwechsel zur Mitte (1.7.)", () => {
  it("verteilt nach exakter Tagesgewichtung", () => {
    // Mieter A bis 30.06., Mieter B ab 01.07. — beide in derselben Einheit.
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 100)],
      tenants: [
        tenant(1, 1, "2023-01-01", "2024-06-30"),
        tenant(2, 1, "2024-07-01", null),
      ],
      costItems: [costItem(1, "grundsteuer", "sqm", 36600, 100)], // 366 Tage * 100
    };
    const out = distribute(input);
    const a = out.tenant_shares.find((t) => t.tenant_id === TID(1))!;
    const b = out.tenant_shares.find((t) => t.tenant_id === TID(2))!;
    // 2024 hat 366 Tage. 1.1. - 30.6. = 31+29+31+30+31+30 = 182 Tage.
    expect(a.active_days).toBe(182);
    expect(b.active_days).toBe(184);
    expect(a.total_share_cents + b.total_share_cents).toBe(36600);
    // Faktor 100 ¢/Tag → A: 18200, B: 18400
    expect(a.total_share_cents).toBe(18200);
    expect(b.total_share_cents).toBe(18400);
  });
});

describe("distribute() · Test 5: Wohnungen-Schlüssel", () => {
  it("verteilt gleichmäßig", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 50), unit(2, 70), unit(3, 30)],
      tenants: [
        tenant(1, 1, "2024-01-01", null),
        tenant(2, 2, "2024-01-01", null),
        tenant(3, 3, "2024-01-01", null),
      ],
      costItems: [costItem(1, "muellabfuhr", "units", 30000, 100)],
    };
    const out = distribute(input);
    const sum = out.tenant_shares.reduce(
      (s, t) => s + t.total_share_cents,
      0,
    );
    expect(sum).toBe(30000);
    // Jeder Mieter sollte ~10000 ¢ haben (Rundungsdifferenz max 1 ¢)
    for (const t of out.tenant_shares) {
      expect(Math.abs(t.total_share_cents - 10000)).toBeLessThanOrEqual(1);
    }
  });
});

describe("distribute() · Test 6: Personen-Schlüssel mit unterschiedlicher persons", () => {
  it("gewichtet nach unit.persons", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 50, 1), unit(2, 50, 3)], // 1 vs 3 Personen
      tenants: [
        tenant(1, 1, "2024-01-01", null),
        tenant(2, 2, "2024-01-01", null),
      ],
      costItems: [costItem(1, "wasser", "persons", 40000, 100)],
    };
    const out = distribute(input);
    const m1 = out.tenant_shares.find((t) => t.tenant_id === TID(1))!;
    const m2 = out.tenant_shares.find((t) => t.tenant_id === TID(2))!;
    expect(m1.total_share_cents + m2.total_share_cents).toBe(40000);
    // Verhältnis 1:3 → m1 = 10000, m2 = 30000
    expect(m1.total_share_cents).toBe(10000);
    expect(m2.total_share_cents).toBe(30000);
  });
});

describe("distribute() · Test 7: Verbrauch-Schlüssel + Validation to<from", () => {
  it("verteilt nach Verbrauchsdifferenz", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 50), unit(2, 50)],
      tenants: [
        tenant(1, 1, "2024-01-01", null),
        tenant(2, 2, "2024-01-01", null),
      ],
      costItems: [
        costItem(1, "wasser", "consumption", 10000, 100, {
          consumption: {
            [UID(1)]: { from: 100, to: 140 }, // 40
            [UID(2)]: { from: 200, to: 260 }, // 60
          },
        }),
      ],
    };
    const out = distribute(input);
    const m1 = out.tenant_shares.find((t) => t.tenant_id === TID(1))!;
    const m2 = out.tenant_shares.find((t) => t.tenant_id === TID(2))!;
    expect(m1.total_share_cents + m2.total_share_cents).toBe(10000);
    expect(m1.total_share_cents).toBe(4000);
    expect(m2.total_share_cents).toBe(6000);
  });

  it("erzeugt Warning bei to < from", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 50)],
      tenants: [tenant(1, 1, "2024-01-01", null)],
      costItems: [
        costItem(1, "wasser", "consumption", 5000, 100, {
          consumption: { [UID(1)]: { from: 200, to: 100 } },
        }),
      ],
    };
    const out = distribute(input);
    expect(out.warnings.some((w) => w.code === "consumption_negative")).toBe(true);
    // Nicht verteilbar → unallocated
    expect(out.unallocated_cents[CID(1)]).toBe(5000);
  });
});

describe("distribute() · Test 8: Heizung mit consumption (HeizkostenV 70/30)", () => {
  it("rechnet 70 % Verbrauch + 30 % m² korrekt", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 50), unit(2, 50)], // gleiche Fläche
      tenants: [
        tenant(1, 1, "2024-01-01", null),
        tenant(2, 2, "2024-01-01", null),
      ],
      costItems: [
        costItem(1, "heizung", "consumption", 100000, 100, {
          consumption: {
            [UID(1)]: { from: 0, to: 30 }, // 30
            [UID(2)]: { from: 0, to: 70 }, // 70
          },
        }),
      ],
    };
    const out = distribute(input);
    expect(out.warnings.filter((w) => w.code.startsWith("heiz_"))).toHaveLength(0);

    const m1 = out.tenant_shares.find((t) => t.tenant_id === TID(1))!;
    const m2 = out.tenant_shares.find((t) => t.tenant_id === TID(2))!;
    expect(m1.total_share_cents + m2.total_share_cents).toBe(100000);
    // Verbrauch: 70 % von 100k = 70000 → 30:70 → m1=21000, m2=49000
    // Fläche:   30 % von 100k = 30000 → 50:50 → 15000 / 15000
    // m1 = 21000 + 15000 = 36000
    // m2 = 49000 + 15000 = 64000
    expect(m1.total_share_cents).toBe(36000);
    expect(m2.total_share_cents).toBe(64000);
  });
});

describe("distribute() · Test 9: Heizung OHNE consumption → Fallback m²", () => {
  it("erzeugt Warning und verteilt 100 % nach m²", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 60), unit(2, 40)],
      tenants: [
        tenant(1, 1, "2024-01-01", null),
        tenant(2, 2, "2024-01-01", null),
      ],
      costItems: [
        costItem(1, "heizung", "sqm", 50000, 100, {
          /* keine consumption */
        }),
      ],
    };
    const out = distribute(input);
    expect(
      out.warnings.some((w) => w.code === "heiz_no_consumption_fallback_sqm"),
    ).toBe(true);
    const m1 = out.tenant_shares.find((t) => t.tenant_id === TID(1))!;
    const m2 = out.tenant_shares.find((t) => t.tenant_id === TID(2))!;
    expect(m1.total_share_cents + m2.total_share_cents).toBe(50000);
    expect(m1.total_share_cents).toBe(30000); // 60 % von 50000
    expect(m2.total_share_cents).toBe(20000);
  });
});

describe("distribute() · Test 10: Direct-Schlüssel passt", () => {
  it("ergibt 0 Differenz, keine Warning", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 50), unit(2, 50)],
      tenants: [
        tenant(1, 1, "2024-01-01", null),
        tenant(2, 2, "2024-01-01", null),
      ],
      costItems: [
        costItem(1, "sonstiges", "direct", 30000, 100, {
          direct_shares: { [TID(1)]: 12000, [TID(2)]: 18000 },
        }),
      ],
    };
    const out = distribute(input);
    expect(out.warnings).toHaveLength(0);
    expect(out.tenant_shares.find((t) => t.tenant_id === TID(1))!.total_share_cents).toBe(12000);
    expect(out.tenant_shares.find((t) => t.tenant_id === TID(2))!.total_share_cents).toBe(18000);
    expect(out.unallocated_cents[CID(1)] ?? 0).toBe(0);
  });
});

describe("distribute() · Test 11: Direct-Schlüssel mismatch", () => {
  it("erzeugt Warning + packt Differenz in unallocated", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 50), unit(2, 50)],
      tenants: [
        tenant(1, 1, "2024-01-01", null),
        tenant(2, 2, "2024-01-01", null),
      ],
      costItems: [
        costItem(1, "sonstiges", "direct", 30000, 100, {
          direct_shares: { [TID(1)]: 12000, [TID(2)]: 15000 }, // -3000
        }),
      ],
    };
    const out = distribute(input);
    expect(out.warnings.some((w) => w.code === "direct_shares_mismatch")).toBe(true);
    expect(out.unallocated_cents[CID(1)]).toBe(3000);
  });
});

describe("distribute() · Test 12: Soll-/Ist-Abgleich (paymentMatches)", () => {
  it("berechnet balance_cents = paid - share", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 100)],
      tenants: [tenant(1, 1, "2024-01-01", null, 80000, 12500)],
      costItems: [costItem(1, "grundsteuer", "sqm", 150000, 100)],
      paymentMatches: [
        // 12 × 100 € VZ = 120 000 ¢
        ...Array.from({ length: 12 }, (_, i) => ({
          tenant_id: TID(1),
          period_month: `2024-${String(i + 1).padStart(2, "0")}`,
          cold_rent_cents: 80000,
          additional_costs_cents: 10000, // 100 € VZ
        })),
      ],
    };
    const out = distribute(input);
    const t = out.tenant_shares[0];
    expect(t.total_share_cents).toBe(150000); // 1500 €
    expect(t.total_paid_advance_cents).toBe(120000); // 1200 €
    expect(t.balance_cents).toBe(120000 - 150000); // -30000 = 300 € Nachzahlung
  });
});

describe("distribute() · Test 13: Determinismus", () => {
  it("liefert bei 5 Aufrufen mit gleichem Input identische Ausgaben", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 47), unit(2, 83), unit(3, 22)],
      tenants: [
        tenant(1, 1, "2024-01-01", null),
        tenant(2, 2, "2024-04-15", "2024-09-30"),
        tenant(3, 3, "2024-01-01", null),
        tenant(4, 2, "2024-10-01", null),
      ],
      costItems: [
        costItem(1, "grundsteuer", "sqm", 99977, 100),
        costItem(2, "muellabfuhr", "units", 24000, 100),
        costItem(3, "wasser", "persons", 30000, 100),
        costItem(4, "heizung", "consumption", 80000, 100, {
          consumption: {
            [UID(1)]: { from: 0, to: 33 },
            [UID(2)]: { from: 0, to: 41 },
            [UID(3)]: { from: 0, to: 26 },
          },
        }),
      ],
    };
    const a = JSON.stringify(distribute(input));
    for (let i = 0; i < 4; i++) {
      const b = JSON.stringify(distribute(input));
      expect(b).toBe(a);
    }
  });
});

describe("distribute() · Bonus: 0 % umlagefähig", () => {
  it("verteilt 0 €, jeder Mieter erhält Eintrag mit 0 ¢", () => {
    const input: NkaDistributeInput = {
      ...PERIOD,
      units: [unit(1, 50)],
      tenants: [tenant(1, 1, "2024-01-01", null)],
      costItems: [costItem(1, "wartung", "sqm", 50000, 0)],
    };
    const out = distribute(input);
    expect(out.tenant_shares[0].total_share_cents).toBe(0);
    expect(out.tenant_shares[0].shares).toHaveLength(1);
    expect(out.tenant_shares[0].shares[0].umlagefaehig_cents).toBe(0);
  });
});
