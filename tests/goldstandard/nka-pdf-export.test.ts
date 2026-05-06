/**
 * Goldstandard-Test: NKA-PDF-Export.
 *
 * PDF-Output ist binär und damit nicht ideal für direkte Snapshot-Tests
 * (Render-Datum, Font-Subsetting → byteweise Differenz). Wir testen daher
 * die Vor-Render-Datenstruktur (`buildNkaPdfRenderData`), die als reiner
 * Builder fungiert und alle Geschäftslogik enthält. Der Renderer selbst
 * wird im 4. Test einmal vollständig gefahren, um zumindest eine
 * Roundtrip-Smoke-Prüfung zu haben (gibt ein PDF zurück, fängt mit %PDF an).
 */

import { describe, expect, it } from "vitest";
import { buildNkaPdfRenderData, renderNkaPdf } from "@/lib/nka/pdf";
import type { NkaShareLine } from "@/lib/nka/distribute";

const sampleBreakdown: NkaShareLine[] = [
  {
    cost_item_id: "ci-1",
    position: "grundsteuer",
    label: "Grundsteuer",
    schluessel: "sqm",
    base_brutto_cents: 60000,
    umlagefaehig_cents: 60000,
    tenant_share_cents: 30000,
    note: null,
  },
  {
    cost_item_id: "ci-2",
    position: "muellabfuhr",
    label: "Müllabfuhr",
    schluessel: "units",
    base_brutto_cents: 36000,
    umlagefaehig_cents: 36000,
    tenant_share_cents: 12000,
    note: null,
  },
];

describe("buildNkaPdfRenderData · Standardfall", () => {
  it("Snapshot · korrekte Struktur und €-Strings für 1 Mieter", () => {
    const data = buildNkaPdfRenderData({
      property: { name: "Kesslerberg", address: "Am Kesslerberg 7, 79856 Hinterzarten" },
      tenant: { name: "Anna Müller", address: "Mietweg 12, 79856 Hinterzarten" },
      period: { period_start: "2024-01-01", period_end: "2024-12-31" },
      breakdown: sampleBreakdown,
      total_share_cents: 42000,
      total_paid_advance_cents: 36000,
      active_days: 366,
      ort: "Hinterzarten",
      datum_iso: "2025-03-15",
    });
    // Wir vergleichen Felder einzeln statt via toMatchInlineSnapshot, weil
    // Intl.NumberFormat dt. Locale ein NBSP (U+00A0) zwischen Betrag und €
    // einfügt, was Inline-Snapshots schwer lesbar macht.
    expect(data.active_days).toBe(366);
    expect(data.period).toEqual({ start: "01.01.2024", end: "31.12.2024" });
    expect(data.property).toEqual({
      name: "Kesslerberg",
      address: "Am Kesslerberg 7, 79856 Hinterzarten",
    });
    expect(data.tenant).toEqual({
      name: "Anna Müller",
      address: "Mietweg 12, 79856 Hinterzarten",
    });
    expect(data.lines).toHaveLength(2);
    expect(data.lines[0].label).toBe("Grundsteuer");
    expect(data.lines[0].schluessel).toBe("sqm");
    expect(data.lines[0].brutto_eur_str).toMatch(/^600,00\s€$/);
    expect(data.lines[0].umlagefaehig_eur_str).toMatch(/^600,00\s€$/);
    expect(data.lines[0].tenant_share_eur_str).toMatch(/^300,00\s€$/);
    expect(data.lines[1].label).toBe("Müllabfuhr");
    expect(data.lines[1].tenant_share_eur_str).toMatch(/^120,00\s€$/);
    expect(data.total_share_eur_str).toMatch(/^420,00\s€$/);
    expect(data.total_paid_advance_eur_str).toMatch(/^360,00\s€$/);
    expect(data.saldo_label).toMatch(/Nachzahlung/);
    expect(data.saldo_eur_str).toMatch(/^60,00\s€$/);
    expect(data.ort_datum).toBe("Hinterzarten, 15.03.2025");
    expect(data.hinweis_text).toContain("§ 556 Abs. 3 BGB");
    expect(data.hinweis_text).toContain("MyImmoHub");
  });
});

describe("buildNkaPdfRenderData · Saldo-Text-Variation", () => {
  it("Nachzahlung: total_share > total_paid → 'Nachzahlung'", () => {
    const data = buildNkaPdfRenderData({
      property: { name: "X", address: null },
      tenant: { name: "Y", address: null },
      period: { period_start: "2024-01-01", period_end: "2024-12-31" },
      breakdown: [],
      total_share_cents: 50000,
      total_paid_advance_cents: 30000,
      active_days: 366,
      ort: "Test",
      datum_iso: "2025-01-01",
    });
    expect(data.saldo_label).toMatch(/Nachzahlung/);
    expect(data.saldo_eur_str).toMatch(/^200,00\s€$/);
  });

  it("Guthaben: total_share < total_paid → 'Guthaben'", () => {
    const data = buildNkaPdfRenderData({
      property: { name: "X", address: null },
      tenant: { name: "Y", address: null },
      period: { period_start: "2024-01-01", period_end: "2024-12-31" },
      breakdown: [],
      total_share_cents: 30000,
      total_paid_advance_cents: 50000,
      active_days: 366,
      ort: "Test",
      datum_iso: "2025-01-01",
    });
    expect(data.saldo_label).toMatch(/Guthaben/);
    expect(data.saldo_eur_str).toMatch(/^200,00\s€$/);
  });

  it("Ausgeglichen: total_share == total_paid", () => {
    const data = buildNkaPdfRenderData({
      property: { name: "X", address: null },
      tenant: { name: "Y", address: null },
      period: { period_start: "2024-01-01", period_end: "2024-12-31" },
      breakdown: [],
      total_share_cents: 40000,
      total_paid_advance_cents: 40000,
      active_days: 366,
      ort: "Test",
      datum_iso: "2025-01-01",
    });
    expect(data.saldo_label).toBe("Ausgeglichen");
    expect(data.saldo_eur_str).toMatch(/^0,00\s€$/);
  });
});

describe("buildNkaPdfRenderData · Aktive Tage bei Mieterwechsel", () => {
  it("Mieter mit 181 Tagen (Halbjahr) wird korrekt durchgereicht", () => {
    const data = buildNkaPdfRenderData({
      property: { name: "X", address: null },
      tenant: { name: "Mieter Halbjahr", address: null },
      period: { period_start: "2024-01-01", period_end: "2024-12-31" },
      breakdown: [],
      total_share_cents: 0,
      total_paid_advance_cents: 0,
      active_days: 181,
      ort: "Test",
      datum_iso: "2025-01-01",
    });
    expect(data.active_days).toBe(181);
  });
});

describe("renderNkaPdf · Smoke-Test (Bytes-Roundtrip)", () => {
  it("liefert ein gültiges PDF (Magic-Bytes %PDF)", async () => {
    const data = buildNkaPdfRenderData({
      property: { name: "Test", address: "Teststr. 1" },
      tenant: { name: "Mieter Test", address: null },
      period: { period_start: "2024-01-01", period_end: "2024-12-31" },
      breakdown: sampleBreakdown,
      total_share_cents: 42000,
      total_paid_advance_cents: 36000,
      active_days: 366,
      ort: "Test",
      datum_iso: "2025-03-15",
    });
    const bytes = await renderNkaPdf(data);
    expect(bytes.byteLength).toBeGreaterThan(500);
    const head = String.fromCharCode(...bytes.slice(0, 4));
    expect(head).toBe("%PDF");
  });
});
