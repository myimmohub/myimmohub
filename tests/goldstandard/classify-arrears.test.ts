/**
 * Goldstandard-Tests für classifyArrears (pure function).
 */

import { describe, it, expect } from "vitest";
import {
  classifyArrears,
  type ArrearsClassifyInput,
  type ArrearsTenant,
} from "@/lib/tenants/classifyArrears";

const tenant = (
  id: string,
  overrides: Partial<ArrearsTenant> = {},
): ArrearsTenant => ({
  id,
  property_id: "prop-" + id,
  cold_rent_cents: 80000,
  additional_costs_cents: 12000,
  lease_start: "2024-01-01",
  lease_end: null,
  status: "active",
  ...overrides,
});

describe("classifyArrears — Goldstandard", () => {
  it("Standardfall: Erinnerung (Level 0) bei 10+ Tagen Verzug", () => {
    const input: ArrearsClassifyInput = {
      tenants: [tenant("t1")],
      payments: [],
      existing_events: [],
      asOfDate: "2024-02-15", // 45 Tage seit 2024-01-01
    };
    const r = classifyArrears(input);
    // 45 Tage → Level 1 (≥30), nicht Level 0
    // Februar (1.2.) → 14 Tage Verzug → Level 0
    // Januar (1.1.) → 45 Tage Verzug → Level 1
    const jan = r.events_to_create.find((e) => e.arrear_month === "2024-01");
    const feb = r.events_to_create.find((e) => e.arrear_month === "2024-02");
    expect(jan?.level).toBe(1);
    expect(feb?.level).toBe(0);
  });

  it("Eskalation: Level 2 bei 60+ Tagen", () => {
    const r = classifyArrears({
      tenants: [tenant("t1", { lease_start: "2024-01-01" })],
      payments: [],
      existing_events: [],
      asOfDate: "2024-03-05", // 64 Tage seit 2024-01-01
    });
    const jan = r.events_to_create.find((e) => e.arrear_month === "2024-01");
    expect(jan?.level).toBe(2);
  });

  it("Eskalation: Level 3 (letztmalig) bei 90+ Tagen", () => {
    const r = classifyArrears({
      tenants: [tenant("t1", { lease_start: "2024-01-01" })],
      payments: [],
      existing_events: [],
      asOfDate: "2024-04-05", // 95 Tage
    });
    const jan = r.events_to_create.find((e) => e.arrear_month === "2024-01");
    expect(jan?.level).toBe(3);
  });

  it("Idempotenz: bereits gleiches Level emittiert → skip, kein neues Event", () => {
    const r = classifyArrears({
      tenants: [tenant("t1", { lease_start: "2024-01-01" })],
      payments: [],
      existing_events: [
        { tenant_id: "t1", arrear_month: "2024-01", level: 1, status: "sent" },
      ],
      asOfDate: "2024-02-10", // 40 Tage → Level 1 (already_emitted)
    });
    const jan = r.events_to_create.find(
      (e) => e.arrear_month === "2024-01" && e.level === 1,
    );
    expect(jan).toBeUndefined();
    expect(r.skipped.find((s) => s.arrear_month === "2024-01")).toBeTruthy();
  });

  it("Eskalation: bereits Level 0 emittiert → bei Level 1 wird neues Event erzeugt", () => {
    const r = classifyArrears({
      tenants: [tenant("t1", { lease_start: "2024-01-01" })],
      payments: [],
      existing_events: [
        { tenant_id: "t1", arrear_month: "2024-01", level: 0, status: "sent" },
      ],
      asOfDate: "2024-02-10", // 40 Tage → Level 1
    });
    const jan = r.events_to_create.find(
      (e) => e.arrear_month === "2024-01",
    );
    expect(jan?.level).toBe(1);
  });

  it("Mieter mit lease_end (vergangen) → keine Monate nach Ende", () => {
    const r = classifyArrears({
      tenants: [
        tenant("t1", {
          lease_start: "2024-01-01",
          lease_end: "2024-02-29",
          status: "ended",
        }),
      ],
      payments: [],
      existing_events: [],
      asOfDate: "2024-06-01",
    });
    // status=ended → kein Event überhaupt
    expect(r.events_to_create).toHaveLength(0);
  });

  it("Teilzahlung: Soll 92000, Ist 50000 → Event mit Differenz 42000", () => {
    const r = classifyArrears({
      tenants: [tenant("t1", { lease_start: "2024-01-01" })],
      payments: [
        { tenant_id: "t1", period_month: "2024-01", amount_cents: 50000 },
      ],
      existing_events: [],
      asOfDate: "2024-02-15", // 45 Tage → Level 1 für Jan
    });
    const jan = r.events_to_create.find((e) => e.arrear_month === "2024-01");
    expect(jan?.arrear_amount_cents).toBe(42000);
    expect(jan?.level).toBe(1);
  });

  it("Komplettzahlung: Ist >= Soll → kein Event", () => {
    const r = classifyArrears({
      tenants: [tenant("t1", { lease_start: "2024-01-01" })],
      payments: [
        { tenant_id: "t1", period_month: "2024-01", amount_cents: 92000 },
      ],
      existing_events: [],
      asOfDate: "2024-02-15",
    });
    expect(r.events_to_create.find((e) => e.arrear_month === "2024-01")).toBeUndefined();
  });

  it("Threshold-Override: kürzere Schwellen wirken", () => {
    const r = classifyArrears({
      tenants: [tenant("t1", { lease_start: "2024-01-01" })],
      payments: [],
      existing_events: [],
      asOfDate: "2024-01-08", // 7 Tage Verzug
      thresholds: { reminder: 5, mahnung1: 30, mahnung2: 60, mahnung3: 90 },
    });
    const jan = r.events_to_create.find((e) => e.arrear_month === "2024-01");
    expect(jan?.level).toBe(0);
  });

  it("Determinismus: gleicher Input → gleicher Output (sortierte Reihenfolge)", () => {
    const input: ArrearsClassifyInput = {
      tenants: [
        tenant("t-z", { lease_start: "2024-01-01" }),
        tenant("t-a", { lease_start: "2024-01-01" }),
      ],
      payments: [],
      existing_events: [],
      asOfDate: "2024-02-15",
    };
    const r1 = classifyArrears(input);
    const r2 = classifyArrears(input);
    expect(r1).toEqual(r2);
    // Erste Events sortiert nach tenant_id ascending
    expect(r1.events_to_create[0].tenant_id).toBe("t-a");
  });

  it("Mehrere Mieter: jeder wird unabhängig klassifiziert", () => {
    const r = classifyArrears({
      tenants: [
        tenant("t1", { lease_start: "2024-01-01" }),
        tenant("t2", { lease_start: "2024-01-01" }),
      ],
      payments: [
        // t2 hat bezahlt
        { tenant_id: "t2", period_month: "2024-01", amount_cents: 92000 },
        { tenant_id: "t2", period_month: "2024-02", amount_cents: 92000 },
      ],
      existing_events: [],
      asOfDate: "2024-02-15",
    });
    // t1 sollte mind. ein Event haben, t2 nicht
    expect(r.events_to_create.some((e) => e.tenant_id === "t1")).toBe(true);
    expect(r.events_to_create.some((e) => e.tenant_id === "t2")).toBe(false);
  });

  it("Asof < threshold → kein Event (Verzug zu kurz)", () => {
    const r = classifyArrears({
      tenants: [tenant("t1", { lease_start: "2024-01-01" })],
      payments: [],
      existing_events: [],
      asOfDate: "2024-01-05", // nur 4 Tage
    });
    expect(r.events_to_create).toHaveLength(0);
  });
});
