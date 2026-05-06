/**
 * Goldstandard-Tests für `activateStaffelEntries`.
 *
 * Idempotenz, Konflikt-Erkennung, Sortierung, Determinismus.
 */

import { describe, it, expect } from "vitest";
import {
  activateStaffelEntries,
  type StaffelActivatorInput,
} from "@/lib/tenants/staffelActivator";

const TID = "tenant-1";

describe("activateStaffelEntries — Goldstandard", () => {
  it("Trivial: 1 Past-Entry, leeres existing → 1 to_insert", () => {
    const input: StaffelActivatorInput = {
      tenant_id: TID,
      staffel_entries: [
        { effective_date: "2024-01-01", cold_rent_cents: 80000 },
      ],
      existing_rent_adjustments: [],
      asOfDate: "2024-06-01",
    };
    const r = activateStaffelEntries(input);
    expect(r.to_insert).toHaveLength(1);
    expect(r.to_insert[0]).toMatchObject({
      tenant_id: TID,
      effective_date: "2024-01-01",
      cold_rent_cents: 80000,
      additional_costs_cents: null,
      adjustment_type: "stepped",
      note: null,
    });
    expect(r.skipped).toHaveLength(0);
  });

  it("Idempotenz: zweiter Lauf nach Persistierung liefert 0 to_insert", () => {
    const entries = [
      { effective_date: "2024-01-01", cold_rent_cents: 80000 },
      { effective_date: "2025-01-01", cold_rent_cents: 82000 },
    ];
    const r1 = activateStaffelEntries({
      tenant_id: TID,
      staffel_entries: entries,
      existing_rent_adjustments: [],
      asOfDate: "2025-06-01",
    });
    expect(r1.to_insert).toHaveLength(2);

    // Persistieren: existing nun = to_insert (mit existierendem adjustment_type)
    const existing = r1.to_insert.map((row) => ({
      effective_date: row.effective_date,
      cold_rent_cents: row.cold_rent_cents,
      additional_costs_cents: row.additional_costs_cents,
      adjustment_type: row.adjustment_type,
    }));
    const r2 = activateStaffelEntries({
      tenant_id: TID,
      staffel_entries: entries,
      existing_rent_adjustments: existing,
      asOfDate: "2025-06-01",
    });
    expect(r2.to_insert).toHaveLength(0);
    expect(r2.skipped).toHaveLength(2);
    expect(r2.skipped.every((s) => s.reason === "already_active")).toBe(true);
  });

  it("Future-Entry → skipped 'future'", () => {
    const r = activateStaffelEntries({
      tenant_id: TID,
      staffel_entries: [
        { effective_date: "2030-01-01", cold_rent_cents: 99000 },
      ],
      existing_rent_adjustments: [],
      asOfDate: "2024-06-01",
    });
    expect(r.to_insert).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toBe("future");
  });

  it("Mehrere Entries, gemischt past/future → nur past in to_insert", () => {
    const r = activateStaffelEntries({
      tenant_id: TID,
      staffel_entries: [
        { effective_date: "2023-01-01", cold_rent_cents: 78000 },
        { effective_date: "2024-01-01", cold_rent_cents: 80000 },
        { effective_date: "2026-01-01", cold_rent_cents: 84000 },
        { effective_date: "2027-01-01", cold_rent_cents: 86000 },
      ],
      existing_rent_adjustments: [],
      asOfDate: "2024-12-31",
    });
    expect(r.to_insert.map((x) => x.effective_date)).toEqual([
      "2023-01-01",
      "2024-01-01",
    ]);
    expect(r.skipped.map((x) => x.entry.effective_date)).toEqual([
      "2026-01-01",
      "2027-01-01",
    ]);
  });

  it("Konflikt: existing mit gleichem Datum aber anderem Betrag → skip 'conflict'", () => {
    const r = activateStaffelEntries({
      tenant_id: TID,
      staffel_entries: [
        { effective_date: "2024-01-01", cold_rent_cents: 80000 },
      ],
      existing_rent_adjustments: [
        {
          effective_date: "2024-01-01",
          cold_rent_cents: 81500, // manuell höher gesetzt
          additional_costs_cents: null,
          adjustment_type: "manual",
        },
      ],
      asOfDate: "2024-06-01",
    });
    expect(r.to_insert).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toBe("conflict");
  });

  it("Sortierung: to_insert nach effective_date ASC, auch wenn Eingabe unsortiert", () => {
    const r = activateStaffelEntries({
      tenant_id: TID,
      staffel_entries: [
        { effective_date: "2024-06-01", cold_rent_cents: 81000 },
        { effective_date: "2023-01-01", cold_rent_cents: 78000 },
        { effective_date: "2024-01-01", cold_rent_cents: 80000 },
      ],
      existing_rent_adjustments: [],
      asOfDate: "2024-12-31",
    });
    expect(r.to_insert.map((x) => x.effective_date)).toEqual([
      "2023-01-01",
      "2024-01-01",
      "2024-06-01",
    ]);
  });

  it("Note + additional_costs_cents werden durchgereicht", () => {
    const r = activateStaffelEntries({
      tenant_id: TID,
      staffel_entries: [
        {
          effective_date: "2024-01-01",
          cold_rent_cents: 80000,
          additional_costs_cents: 16000,
          note: "Vertraglich vereinbarte Stufe 2",
        },
      ],
      existing_rent_adjustments: [],
      asOfDate: "2024-06-01",
    });
    expect(r.to_insert[0]).toMatchObject({
      additional_costs_cents: 16000,
      note: "Vertraglich vereinbarte Stufe 2",
    });
  });

  it("Determinismus: 5x gleiche Eingabe → 5x identisches Ergebnis", () => {
    const input: StaffelActivatorInput = {
      tenant_id: TID,
      staffel_entries: [
        { effective_date: "2023-01-01", cold_rent_cents: 78000 },
        { effective_date: "2024-01-01", cold_rent_cents: 80000 },
        { effective_date: "2025-01-01", cold_rent_cents: 82000 },
      ],
      existing_rent_adjustments: [
        {
          effective_date: "2023-01-01",
          cold_rent_cents: 78000,
          additional_costs_cents: null,
          adjustment_type: "stepped",
        },
      ],
      asOfDate: "2024-12-31",
    };
    const results = Array.from({ length: 5 }, () => activateStaffelEntries(input));
    for (const r of results) {
      expect(r).toEqual(results[0]);
    }
  });

  it("Skipped 'already_active' bei identischem Datum + Betrag (egal ob manual oder stepped)", () => {
    const r = activateStaffelEntries({
      tenant_id: TID,
      staffel_entries: [
        { effective_date: "2024-01-01", cold_rent_cents: 80000 },
      ],
      existing_rent_adjustments: [
        {
          effective_date: "2024-01-01",
          cold_rent_cents: 80000,
          additional_costs_cents: null,
          adjustment_type: "manual",
        },
      ],
      asOfDate: "2024-06-01",
    });
    expect(r.to_insert).toHaveLength(0);
    expect(r.skipped[0].reason).toBe("already_active");
  });
});
