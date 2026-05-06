/**
 * Unit-Tests für `getActiveTenantSegments`.
 */

import { describe, it, expect } from "vitest";
import {
  getActiveTenantSegments,
  type TenantPeriodsTenantInput,
} from "@/lib/tenants/tenantPeriods";

const tenant = (
  partial: Partial<TenantPeriodsTenantInput> & { id: string; unit_id: string },
): TenantPeriodsTenantInput => ({
  id: partial.id,
  unit_id: partial.unit_id,
  lease_start: partial.lease_start ?? "2024-01-01",
  lease_end: partial.lease_end ?? null,
  status: partial.status ?? "active",
});

describe("getActiveTenantSegments", () => {
  it("Standard: ein Mieter, ganze Periode aktiv → 1 Segment, 366 Tage (Schaltjahr)", () => {
    const segs = getActiveTenantSegments({
      tenants: [tenant({ id: "t1", unit_id: "u1", lease_start: "2023-01-01" })],
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
    });
    expect(segs).toHaveLength(1);
    expect(segs[0].days).toBe(366);
    expect(segs[0].start).toBe("2024-01-01");
    expect(segs[0].end).toBe("2024-12-31");
  });

  it("Mieterwechsel zur Mitte: 2 Mieter, sauberer Übergang", () => {
    const segs = getActiveTenantSegments({
      tenants: [
        tenant({ id: "t1", unit_id: "u1", lease_start: "2023-01-01", lease_end: "2024-06-30" }),
        tenant({ id: "t2", unit_id: "u1", lease_start: "2024-07-01" }),
      ],
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
    });
    expect(segs).toHaveLength(2);
    expect(segs[0].tenant_id).toBe("t1");
    expect(segs[0].days).toBe(182); // Jan-Jun 2024 (31+29+31+30+31+30=182)
    expect(segs[1].tenant_id).toBe("t2");
    expect(segs[1].days).toBe(184); // Jul-Dez 2024 (31+31+30+31+30+31=184)
    // Σ = 366
    expect(segs[0].days + segs[1].days).toBe(366);
  });

  it("Überlappende Mieter (Datenfehler!) → beide kommen zurück, Aufrufer entscheidet", () => {
    const segs = getActiveTenantSegments({
      tenants: [
        tenant({ id: "t1", unit_id: "u1", lease_start: "2024-01-01", lease_end: "2024-08-31" }),
        tenant({ id: "t2", unit_id: "u1", lease_start: "2024-06-01" }),
      ],
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
    });
    expect(segs).toHaveLength(2);
    // t1: Jan-Aug = 244 Tage; t2: Jun-Dez = 214 Tage → Überlappung 92 Tage
    const t1 = segs.find((s) => s.tenant_id === "t1")!;
    const t2 = segs.find((s) => s.tenant_id === "t2")!;
    expect(t1.days).toBe(244);
    expect(t2.days).toBe(214);
  });

  it("Periode komplett vor lease_start → leeres Array", () => {
    const segs = getActiveTenantSegments({
      tenants: [tenant({ id: "t1", unit_id: "u1", lease_start: "2025-01-01" })],
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
    });
    expect(segs).toHaveLength(0);
  });

  it("Periode komplett nach lease_end → leeres Array", () => {
    const segs = getActiveTenantSegments({
      tenants: [
        tenant({ id: "t1", unit_id: "u1", lease_start: "2020-01-01", lease_end: "2022-12-31" }),
      ],
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
    });
    expect(segs).toHaveLength(0);
  });

  it("lease_end == null = unbefristet, wird auf periodEnd geclamped", () => {
    const segs = getActiveTenantSegments({
      tenants: [tenant({ id: "t1", unit_id: "u1", lease_start: "2020-01-01", lease_end: null })],
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
    });
    expect(segs).toHaveLength(1);
    expect(segs[0].end).toBe("2024-12-31");
  });

  it("unitId-Filter beschränkt Ergebnis", () => {
    const segs = getActiveTenantSegments({
      tenants: [
        tenant({ id: "t1", unit_id: "u1", lease_start: "2023-01-01" }),
        tenant({ id: "t2", unit_id: "u2", lease_start: "2023-01-01" }),
      ],
      unitId: "u2",
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
    });
    expect(segs).toHaveLength(1);
    expect(segs[0].tenant_id).toBe("t2");
  });

  it("Mieter beginnt mitten in Periode → Tage werden vom lease_start gezählt", () => {
    const segs = getActiveTenantSegments({
      tenants: [tenant({ id: "t1", unit_id: "u1", lease_start: "2024-04-15" })],
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
    });
    expect(segs).toHaveLength(1);
    expect(segs[0].start).toBe("2024-04-15");
    expect(segs[0].end).toBe("2024-12-31");
    // 15.04 inklusive: 16 (Apr-Rest) + 31+30+31+31+30+31+30+31 = 16+245 = 261
    expect(segs[0].days).toBe(261);
  });

  it("Periode = einzelner Tag → days = 1", () => {
    const segs = getActiveTenantSegments({
      tenants: [tenant({ id: "t1", unit_id: "u1", lease_start: "2020-01-01" })],
      periodStart: "2024-06-15",
      periodEnd: "2024-06-15",
    });
    expect(segs).toHaveLength(1);
    expect(segs[0].days).toBe(1);
  });

  it("Determinismus: stabil sortiert", () => {
    const tenants = [
      tenant({ id: "t-z", unit_id: "u-2", lease_start: "2023-01-01" }),
      tenant({ id: "t-a", unit_id: "u-1", lease_start: "2024-06-01" }),
      tenant({ id: "t-b", unit_id: "u-1", lease_start: "2023-01-01", lease_end: "2024-05-31" }),
    ];
    const segs1 = getActiveTenantSegments({
      tenants,
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
    });
    const segs2 = getActiveTenantSegments({
      tenants: tenants.slice().reverse(),
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
    });
    expect(segs1).toEqual(segs2);
    // Reihenfolge: u-1 (t-b vor t-a, weil start-Datum), dann u-2
    expect(segs1.map((s) => s.tenant_id)).toEqual(["t-b", "t-a", "t-z"]);
  });
});
