/**
 * Unit-Tests für `parseTenantsCsv`.
 */

import { describe, it, expect } from "vitest";
import { parseTenantsCsv } from "@/lib/tenants/csvImport";

const HEADER = [
  "unit_label",
  "last_name",
  "first_name",
  "email",
  "phone",
  "lease_start",
  "lease_end",
  "cold_rent_eur",
  "additional_costs_eur",
  "deposit_eur",
  "rent_type",
].join(";");

describe("parseTenantsCsv", () => {
  it("Standard: 2 valide Zeilen → 2 ok, 0 errors", () => {
    const csv = [
      HEADER,
      "WHG-1;Müller;Hans;hans@example.com;+49 30 123;2024-01-01;;800,00;150,00;1600,00;fixed",
      "WHG-2;Schmidt;Anna;;;2024-02-01;2025-01-31;750.00;;;index",
    ].join("\n");
    const r = parseTenantsCsv(csv);
    expect(r.ok).toHaveLength(2);
    expect(r.errors).toHaveLength(0);
    expect(r.ok[0]).toMatchObject({
      unit_label: "WHG-1",
      last_name: "Müller",
      first_name: "Hans",
      email: "hans@example.com",
      lease_start: "2024-01-01",
      lease_end: null,
      cold_rent_cents: 80000,
      additional_costs_cents: 15000,
      deposit_cents: 160000,
      rent_type: "fixed",
    });
    expect(r.ok[1]).toMatchObject({
      unit_label: "WHG-2",
      lease_end: "2025-01-31",
      cold_rent_cents: 75000,
      additional_costs_cents: null,
      deposit_cents: null,
      rent_type: "index",
    });
  });

  it("Fehler: unit_label fehlt → error mit row_index", () => {
    const csv = [
      HEADER,
      ";Müller;Hans;;;2024-01-01;;800;;;fixed",
    ].join("\n");
    const r = parseTenantsCsv(csv);
    expect(r.ok).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].row_index).toBe(1);
    expect(r.errors[0].message).toMatch(/unit_label/);
  });

  it("Fehler: lease_start ungültiges Format", () => {
    const csv = [
      HEADER,
      "WHG-1;Müller;Hans;;;01.01.2024;;800;;;fixed",
    ].join("\n");
    const r = parseTenantsCsv(csv);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/lease_start/);
  });

  it("Fehler: cold_rent_eur ungültig", () => {
    const csv = [
      HEADER,
      "WHG-1;Müller;Hans;;;2024-01-01;;abc;;;fixed",
    ].join("\n");
    const r = parseTenantsCsv(csv);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/cold_rent_eur/);
  });

  it("Default rent_type = fixed, wenn unbekannter Wert", () => {
    const csv = [
      HEADER,
      "WHG-1;Müller;Hans;;;2024-01-01;;800;;;weird",
    ].join("\n");
    const r = parseTenantsCsv(csv);
    expect(r.ok).toHaveLength(1);
    expect(r.ok[0].rent_type).toBe("fixed");
  });

  it("Komma-Separator funktioniert ebenso", () => {
    const csv = [
      "unit_label,last_name,first_name,email,phone,lease_start,lease_end,cold_rent_eur,additional_costs_eur,deposit_eur,rent_type",
      "WHG-1,Müller,Hans,,,2024-01-01,,800,,,fixed",
    ].join("\n");
    const r = parseTenantsCsv(csv);
    expect(r.ok).toHaveLength(1);
    expect(r.ok[0].cold_rent_cents).toBe(80000);
  });
});
