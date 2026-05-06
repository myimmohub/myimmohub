/**
 * Zod-Validation für Tax-API-Requests.
 *
 * Stellt sicher, dass property_id eine gültige UUID ist und tax_year eine
 * Ganzzahl im plausiblen Bereich. Verhindert Injection / falsche Typen, die
 * sonst tief in die Pipeline durchreichen würden.
 */

import { z } from "zod";

// UUID-Regex (Standard, alle Versionen 1-5).
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Plausibler Bereich für Steuerjahre. */
export const TAX_YEAR_MIN = 2010;
export const TAX_YEAR_MAX = 2030;

const propertyIdSchema = z
  .string()
  .regex(UUID_REGEX, "property_id muss eine UUID sein");

const taxYearSchema = z
  .number()
  .int("tax_year muss eine Ganzzahl sein")
  .min(TAX_YEAR_MIN, `tax_year muss ≥ ${TAX_YEAR_MIN} sein`)
  .max(TAX_YEAR_MAX, `tax_year muss ≤ ${TAX_YEAR_MAX} sein`);

export const taxCalculateRequestSchema = z.object({
  property_id: propertyIdSchema,
  tax_year: taxYearSchema,
});

export const taxImportRequestSchema = z.object({
  property_id: propertyIdSchema,
  tax_year: taxYearSchema,
  pdf_base64: z.string().min(1, "pdf_base64 darf nicht leer sein"),
  overwrite: z.boolean().optional(),
});

/**
 * Schema für Sonderwerbungskosten / Sondereinnahmen je GbR-Beteiligten.
 * Tabelle: gbr_partner_special_expenses.
 */
export const sonderWkClassificationSchema = z.enum([
  "special_income",
  "special_expense_interest",
  "special_expense_other",
]);

export const sonderWkCreateRequestSchema = z.object({
  property_id: propertyIdSchema,
  gbr_partner_id: z
    .string()
    .regex(UUID_REGEX, "gbr_partner_id muss eine UUID sein"),
  tax_year: taxYearSchema,
  label: z
    .string()
    .trim()
    .min(1, "label darf nicht leer sein")
    .max(200, "label maximal 200 Zeichen"),
  amount: z.number().refine(Number.isFinite, "amount muss eine Zahl sein"),
  classification: sonderWkClassificationSchema,
  note: z.string().max(2000).optional().nullable(),
});

export const sonderWkUpdateRequestSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "label darf nicht leer sein")
    .max(200, "label maximal 200 Zeichen")
    .optional(),
  amount: z
    .number()
    .refine(Number.isFinite, "amount muss eine Zahl sein")
    .optional(),
  classification: sonderWkClassificationSchema.optional(),
  note: z.string().max(2000).optional().nullable(),
});

export type TaxCalculateRequest = z.infer<typeof taxCalculateRequestSchema>;
export type TaxImportRequest = z.infer<typeof taxImportRequestSchema>;
export type SonderWkCreateRequest = z.infer<typeof sonderWkCreateRequestSchema>;
export type SonderWkUpdateRequest = z.infer<typeof sonderWkUpdateRequestSchema>;
