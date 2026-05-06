/**
 * Unit-Tests für buildArrearsPayload (pure function).
 *
 * Mindestens 4 Tests je Level.
 */

import { describe, it, expect } from "vitest";
import {
  buildArrearsPayload,
  type ArrearsPayloadLevel,
} from "@/lib/tenants/buildArrearsPayload";

const baseInput = (
  level: ArrearsPayloadLevel,
  overrides: Partial<Parameters<typeof buildArrearsPayload>[0]> = {},
) => ({
  property: { name: "Hinterzartenstr. 8 GbR", address: "Hinterzartenstr. 8, 79856 Hinterzarten" },
  tenant: { first_name: "Anna", last_name: "Müller", email: "anna@example.com" },
  unit: { label: "EG links" },
  arrear: { arrear_month: "2024-03", amount_cents: 92000 },
  level,
  ...overrides,
});

describe("buildArrearsPayload — Level 0 (Erinnerung)", () => {
  it("Subject enthält 'Zahlungserinnerung'", () => {
    const r = buildArrearsPayload(baseInput(0));
    expect(r.subject).toContain("Zahlungserinnerung");
  });
  it("body_text enthält den Betrag in DE-Format", () => {
    const r = buildArrearsPayload(baseInput(0));
    expect(r.body_text).toContain("920,00");
  });
  it("body_text Ton: 'freundlich' / 'Versehen'", () => {
    const r = buildArrearsPayload(baseInput(0));
    expect(r.body_text).toMatch(/Versehen|freundlich/);
  });
  it("body_html enthält salutation als <p>", () => {
    const r = buildArrearsPayload(baseInput(0));
    expect(r.body_html).toContain("<p>Sehr geehrte/r Anna Müller,</p>");
  });
});

describe("buildArrearsPayload — Level 1 (1. Mahnung)", () => {
  it("Subject enthält '1. Mahnung'", () => {
    const r = buildArrearsPayload(baseInput(1));
    expect(r.subject).toContain("1. Mahnung");
  });
  it("body_text enthält 'verbindlich' (formaler Ton)", () => {
    const r = buildArrearsPayload(baseInput(1));
    expect(r.body_text).toContain("verbindlich");
  });
  it("body_text enthält 'unverzüglich'", () => {
    const r = buildArrearsPayload(baseInput(1));
    expect(r.body_text).toContain("unverzüglich");
  });
  it("Empfänger-Email wird übernommen", () => {
    const r = buildArrearsPayload(baseInput(1));
    expect(r.recipient_email).toBe("anna@example.com");
  });
});

describe("buildArrearsPayload — Level 2 (2. Mahnung)", () => {
  it("Subject enthält '2. Mahnung'", () => {
    const r = buildArrearsPayload(baseInput(2));
    expect(r.subject).toContain("2. Mahnung");
  });
  it("body_text enthält Hinweis auf §543 Abs. 2 Nr. 3 BGB", () => {
    const r = buildArrearsPayload(baseInput(2));
    expect(r.body_text).toContain("§ 543 Abs. 2 Nr. 3 BGB");
  });
  it("body_text enthält 'Nachfrist'", () => {
    const r = buildArrearsPayload(baseInput(2));
    expect(r.body_text).toContain("Nachfrist");
  });
  it("body_html escaped HTML-Sonderzeichen im Property-Namen", () => {
    const r = buildArrearsPayload(
      baseInput(2, { property: { name: "M & K GbR", address: null } }),
    );
    expect(r.body_html).toContain("M &amp; K GbR");
  });
});

describe("buildArrearsPayload — Level 3 (Letztmalig)", () => {
  it("Subject enthält 'Letztmalige Mahnung'", () => {
    const r = buildArrearsPayload(baseInput(3));
    expect(r.subject).toContain("Letztmalige Mahnung");
  });
  it("body_text enthält 'letztmalig'", () => {
    const r = buildArrearsPayload(baseInput(3));
    expect(r.body_text).toMatch(/letztmalig/i);
  });
  it("body_text erwähnt rechtliche Schritte / Kündigung", () => {
    const r = buildArrearsPayload(baseInput(3));
    expect(r.body_text).toMatch(/rechtliche Schritte|Kündigung/);
  });
  it("body_text fordert Reaktion innerhalb 7 Tagen", () => {
    const r = buildArrearsPayload(baseInput(3));
    expect(r.body_text).toMatch(/7 Tage/);
  });
});

describe("buildArrearsPayload — gemeinsame Eigenschaften", () => {
  it("Salutation Fallback ohne Vornamen", () => {
    const r = buildArrearsPayload(
      baseInput(0, { tenant: { first_name: null, last_name: "Müller", email: "x@y" } }),
    );
    expect(r.body_text).toContain("Sehr geehrte/r Müller,");
  });
  it("Empfänger-Email wird übernommen", () => {
    const r = buildArrearsPayload(baseInput(0));
    expect(r.recipient_email).toBe("anna@example.com");
  });
});
