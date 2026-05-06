/**
 * E2E/Goldstandard-Test für `lib/tenants/effectiveRent.ts`.
 *
 * Hintergrund: Anlage V, NKA und `rent-arrears` sollen denselben
 * Mietzins für ein gegebenes Datum berechnen. Heute überschreibt
 * `app/api/rent-adjustments/route.ts` direkt `tenants.cold_rent_cents`,
 * sobald `effective_date <= heute` — historische Auswertungen verlieren
 * also den Kontext. `effectiveRentAt` ist die zentrale Pure Function,
 * die ohne DB-Zugriff aus Stamm + History den korrekten Wert ermittelt.
 *
 * Diese Tests fixieren das Verhalten als Goldstandard.
 */

import { describe, it, expect } from "vitest";
import {
  effectiveRentAt,
  pendingStaffelAdjustments,
  type RentAdjustment,
  type TenantBase,
} from "@/lib/tenants/effectiveRent";

const tenant: TenantBase = {
  id: "tenant-1",
  lease_start: "2023-04-01",
  cold_rent_cents: 80000, // 800,00 €
  additional_costs_cents: 15000, // 150,00 €
};

describe("effectiveRentAt — Stammdatensatz ohne Adjustments", () => {
  it("liefert Stamm bei leerer Adjustment-Liste, applied=true", () => {
    const r = effectiveRentAt(tenant, [], "2024-06-15");
    expect(r.cold_rent_cents).toBe(80000);
    expect(r.additional_costs_cents).toBe(15000);
    expect(r.source).toBe("base");
    expect(r.applied).toBe(true);
    expect(r.effective_from).toBe("2023-04-01");
  });

  it("applied=false wenn asOfDate vor lease_start", () => {
    const r = effectiveRentAt(tenant, [], "2023-03-31");
    expect(r.applied).toBe(false);
    expect(r.cold_rent_cents).toBe(80000);
  });

  it("akzeptiert auch null bei additional_costs (legt 0 fest)", () => {
    const noNk: TenantBase = { ...tenant, additional_costs_cents: null };
    const r = effectiveRentAt(noNk, [], "2024-01-01");
    expect(r.additional_costs_cents).toBe(0);
  });
});

describe("effectiveRentAt — Adjustments respektieren Datum", () => {
  const adjustments: RentAdjustment[] = [
    { effective_date: "2024-01-01", cold_rent_cents: 85000, additional_costs_cents: 16000, adjustment_type: "stepped" },
    { effective_date: "2025-01-01", cold_rent_cents: 90000, additional_costs_cents: 18000, adjustment_type: "stepped" },
  ];

  it("vor erstem Adjustment → Stamm", () => {
    const r = effectiveRentAt(tenant, adjustments, "2023-12-31");
    expect(r.cold_rent_cents).toBe(80000);
    expect(r.source).toBe("base");
  });

  it("zwischen den Adjustments → erstes Adjustment greift", () => {
    const r = effectiveRentAt(tenant, adjustments, "2024-12-31");
    expect(r.cold_rent_cents).toBe(85000);
    expect(r.additional_costs_cents).toBe(16000);
    expect(r.source).toBe("adjustment");
    expect(r.effective_from).toBe("2024-01-01");
  });

  it("nach zweitem Adjustment → zweites Adjustment greift", () => {
    const r = effectiveRentAt(tenant, adjustments, "2026-01-01");
    expect(r.cold_rent_cents).toBe(90000);
    expect(r.effective_from).toBe("2025-01-01");
  });

  it("genau am effective_date → bereits aktiv (>=, nicht >)", () => {
    const r = effectiveRentAt(tenant, adjustments, "2024-01-01");
    expect(r.cold_rent_cents).toBe(85000);
  });

  it("Reihenfolge der Eingabeliste ist egal — wir sortieren intern", () => {
    const reordered: RentAdjustment[] = [adjustments[1], adjustments[0]];
    const r = effectiveRentAt(tenant, reordered, "2024-12-31");
    expect(r.cold_rent_cents).toBe(85000);
  });

  it("Zukunfts-Adjustment wird ignoriert", () => {
    const future: RentAdjustment[] = [
      { effective_date: "2030-01-01", cold_rent_cents: 999999, additional_costs_cents: 0 },
    ];
    const r = effectiveRentAt(tenant, future, "2024-06-15");
    expect(r.cold_rent_cents).toBe(80000);
    expect(r.source).toBe("base");
  });
});

describe("effectiveRentAt — Robustheit gegenüber Indexmiete", () => {
  it("Indexmiete als manual gespeichert → wird korrekt aufgelöst", () => {
    const adjustments: RentAdjustment[] = [
      { effective_date: "2024-07-01", cold_rent_cents: 82500, additional_costs_cents: 15000, adjustment_type: "index" },
    ];
    const r = effectiveRentAt(tenant, adjustments, "2024-08-01");
    expect(r.cold_rent_cents).toBe(82500);
    expect(r.source).toBe("adjustment");
  });

  it("Wirft bei nicht-ISO-Datum", () => {
    expect(() => effectiveRentAt(tenant, [], "15.06.2024")).toThrow();
  });
});

describe("pendingStaffelAdjustments — Idempotenz", () => {
  const staffel = [
    { effective_date: "2024-01-01", cold_rent_cents: 85000, additional_costs_cents: 16000 },
    { effective_date: "2025-01-01", cold_rent_cents: 90000, additional_costs_cents: 18000 },
    { effective_date: "2026-01-01", cold_rent_cents: 95000, additional_costs_cents: 20000 },
  ];

  it("liefert nur Staffeln vor/auf Stichtag, die noch nicht in History sind", () => {
    const existing: RentAdjustment[] = [];
    const out = pendingStaffelAdjustments({
      tenantId: "tenant-1",
      staffelEntries: staffel,
      existingAdjustments: existing,
      asOfDate: "2025-06-01",
    });
    // Erwarten: 2024-01-01 + 2025-01-01, NICHT 2026-01-01
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.effective_date)).toEqual(["2024-01-01", "2025-01-01"]);
    expect(out[0].adjustment_type).toBe("stepped");
  });

  it("schon vorhandene Adjustments werden nicht dupliziert", () => {
    const existing: RentAdjustment[] = [
      { effective_date: "2024-01-01", cold_rent_cents: 85000, additional_costs_cents: 16000 },
    ];
    const out = pendingStaffelAdjustments({
      tenantId: "tenant-1",
      staffelEntries: staffel,
      existingAdjustments: existing,
      asOfDate: "2025-06-01",
    });
    expect(out).toHaveLength(1);
    expect(out[0].effective_date).toBe("2025-01-01");
  });

  it("ein zweiter Lauf nach Persistenz liefert leeres Array (Idempotenz)", () => {
    let existing: RentAdjustment[] = [];
    const first = pendingStaffelAdjustments({
      tenantId: "tenant-1",
      staffelEntries: staffel,
      existingAdjustments: existing,
      asOfDate: "2025-06-01",
    });
    existing = [...existing, ...first];
    const second = pendingStaffelAdjustments({
      tenantId: "tenant-1",
      staffelEntries: staffel,
      existingAdjustments: existing,
      asOfDate: "2025-06-01",
    });
    expect(second).toEqual([]);
  });

  it("Zukünftige Staffeln werden erst bei späteren Stichtagen aktiv", () => {
    const out = pendingStaffelAdjustments({
      tenantId: "tenant-1",
      staffelEntries: staffel,
      existingAdjustments: [],
      asOfDate: "2026-01-01",
    });
    expect(out).toHaveLength(3);
  });
});
