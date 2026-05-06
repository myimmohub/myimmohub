/**
 * Unit-Tests für `lib/tax/requestSchemas.ts` (Zod-Validation).
 */

import { describe, it, expect } from "vitest";
import {
  taxCalculateRequestSchema,
  taxImportRequestSchema,
  TAX_YEAR_MIN,
  TAX_YEAR_MAX,
} from "@/lib/tax/requestSchemas";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("taxCalculateRequestSchema", () => {
  it("Akzeptiert gültige UUID + tax_year", () => {
    const r = taxCalculateRequestSchema.safeParse({ property_id: VALID_UUID, tax_year: 2024 });
    expect(r.success).toBe(true);
  });

  it("Lehnt ungültige UUID ab", () => {
    const r = taxCalculateRequestSchema.safeParse({ property_id: "not-a-uuid", tax_year: 2024 });
    expect(r.success).toBe(false);
  });

  it("Lehnt nicht-Integer tax_year ab", () => {
    const r = taxCalculateRequestSchema.safeParse({ property_id: VALID_UUID, tax_year: 2024.5 });
    expect(r.success).toBe(false);
  });

  it(`Lehnt tax_year < ${TAX_YEAR_MIN} ab`, () => {
    const r = taxCalculateRequestSchema.safeParse({ property_id: VALID_UUID, tax_year: 1999 });
    expect(r.success).toBe(false);
  });

  it(`Lehnt tax_year > ${TAX_YEAR_MAX} ab`, () => {
    const r = taxCalculateRequestSchema.safeParse({ property_id: VALID_UUID, tax_year: 2099 });
    expect(r.success).toBe(false);
  });

  it("Lehnt fehlende Felder ab", () => {
    expect(taxCalculateRequestSchema.safeParse({ property_id: VALID_UUID }).success).toBe(false);
    expect(taxCalculateRequestSchema.safeParse({ tax_year: 2024 }).success).toBe(false);
  });
});

describe("taxImportRequestSchema", () => {
  it("Akzeptiert vollständigen Body", () => {
    const r = taxImportRequestSchema.safeParse({
      property_id: VALID_UUID,
      tax_year: 2024,
      pdf_base64: "JVBERi0xLjQKJcfsj6IK", // Mini PDF-Header in base64
      overwrite: true,
    });
    expect(r.success).toBe(true);
  });

  it("overwrite ist optional", () => {
    const r = taxImportRequestSchema.safeParse({
      property_id: VALID_UUID,
      tax_year: 2024,
      pdf_base64: "JVBERi0xLjQK",
    });
    expect(r.success).toBe(true);
  });

  it("Lehnt leeren pdf_base64 ab", () => {
    const r = taxImportRequestSchema.safeParse({
      property_id: VALID_UUID,
      tax_year: 2024,
      pdf_base64: "",
    });
    expect(r.success).toBe(false);
  });
});
