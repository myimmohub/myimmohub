/**
 * Unit-Tests für lib/nka/buildVersandPayload.
 */

import { describe, expect, it } from "vitest";
import {
  buildVersandPayload,
  type VersandPayloadInput,
} from "@/lib/nka/buildVersandPayload";

function baseInput(
  overrides: Partial<VersandPayloadInput> = {},
): VersandPayloadInput {
  return {
    property: { name: "Hinterzartenstraße 8 GbR", address: "Hinterzartenstraße 8, 79856 Hinterzarten" },
    period: { period_start: "2024-01-01", period_end: "2024-12-31" },
    tenant: { first_name: "Anna", last_name: "Müller", email: "anna.mueller@example.com" },
    unit: { label: "EG links" },
    share: {
      total_share_cents: 120000,
      total_paid_advance_cents: 100000,
      balance_cents: -20000,
    },
    ...overrides,
  };
}

describe("buildVersandPayload", () => {
  it("Nachzahlung: Saldo negativ → Wort 'Nachzahlung' + Betrag erscheint", () => {
    const out = buildVersandPayload(baseInput());
    expect(out.recipient_email).toBe("anna.mueller@example.com");
    expect(out.subject).toContain("Nebenkostenabrechnung");
    expect(out.subject).toContain("01.01.2024");
    expect(out.subject).toContain("31.12.2024");
    expect(out.body_text).toMatch(/Nachzahlung/);
    expect(out.body_text).toContain("200,00");
    expect(out.body_text).toMatch(/Sehr geehrte\/r Anna Müller,/);
    expect(out.body_text).toContain("§ 556 Abs. 3 BGB");
    expect(out.body_text).toContain("Mit freundlichen Grüßen");
    expect(out.body_text).toContain("Hinterzartenstraße 8 GbR");
    expect(out.body_html).toContain("<p>");
  });

  it("Guthaben: Saldo positiv → Wort 'Guthaben' + Betrag erscheint", () => {
    const out = buildVersandPayload(
      baseInput({
        share: { total_share_cents: 80000, total_paid_advance_cents: 100000, balance_cents: 20000 },
      }),
    );
    expect(out.body_text).toMatch(/Guthaben/);
    expect(out.body_text).toContain("200,00");
    expect(out.body_text).toMatch(/zu Ihren Gunsten/);
  });

  it("Ausgeglichen: Saldo 0 → 'Ausgeglichen' + 'weder Nachzahlung noch Guthaben'", () => {
    const out = buildVersandPayload(
      baseInput({
        share: { total_share_cents: 100000, total_paid_advance_cents: 100000, balance_cents: 0 },
      }),
    );
    expect(out.body_text).toMatch(/Ausgeglichen/);
    expect(out.body_text).toMatch(/weder eine Nachzahlung noch ein Guthaben/);
  });

  it("Mieter ohne Vorname: Anrede fällt auf Nachname zurück", () => {
    const out = buildVersandPayload(
      baseInput({
        tenant: { first_name: null, last_name: "Müller", email: "m@example.com" },
      }),
    );
    expect(out.body_text).toMatch(/Sehr geehrte\/r Müller,/);
    expect(out.body_text).not.toMatch(/^Sehr geehrte\/r Anna/);
  });

  it("Leerer Address-String wird ohne Komma im Body gerendert", () => {
    const out = buildVersandPayload(
      baseInput({
        property: { name: "Test GbR", address: "" },
      }),
    );
    // Adresse leer → kein zweiter Komma-Abschnitt nach "EG links"
    expect(out.body_text).toMatch(/Wohneinheit "EG links"\./);
    // Subject behält Property-Name
    expect(out.subject).toContain("Test GbR");
  });

  it("Determinismus: gleiche Eingabe → gleiches Ergebnis", () => {
    const a = buildVersandPayload(baseInput());
    const b = buildVersandPayload(baseInput());
    expect(a).toEqual(b);
  });

  it("HTML-Body escaped Sonderzeichen im Property-Namen", () => {
    const out = buildVersandPayload(
      baseInput({
        property: { name: "Test & <Co.>", address: null },
      }),
    );
    expect(out.body_html).toContain("Test &amp; &lt;Co.&gt;");
    // Plain-Text bleibt unverändert
    expect(out.body_text).toContain("Test & <Co.>");
  });

  it("Subject enthält Wohneinheits-Label und Property", () => {
    const out = buildVersandPayload(
      baseInput({
        property: { name: "Kesslerberg 12", address: null },
        unit: { label: "OG rechts" },
      }),
    );
    expect(out.subject).toContain("Kesslerberg 12");
    expect(out.subject).toContain("OG rechts");
  });
});
