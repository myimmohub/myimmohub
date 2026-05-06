/**
 * Zod-Validation für die NKA-API.
 *
 * Schützt alle Endpoints vor falschen Typen, ungültigen UUIDs und
 * impliziten String→Number-Coercions.
 */

import { z } from "zod";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const uuidSchema = z.string().regex(UUID_REGEX, "muss eine UUID sein");
const isoDateSchema = z.string().regex(ISO_DATE_REGEX, "muss yyyy-mm-dd sein");

const taxYearSchema = z
  .number()
  .int("tax_year muss eine Ganzzahl sein")
  .min(2000)
  .max(2100);

export const nkaPositionSchema = z.enum([
  "grundsteuer",
  "wasser",
  "abwasser",
  "heizung",
  "warmwasser",
  "strassenreinigung",
  "muellabfuhr",
  "gebaeudereinigung",
  "gartenpflege",
  "beleuchtung",
  "schornsteinreinigung",
  "sach_haftpflicht_versicherung",
  "hauswart",
  "gemeinschaftsantenne_kabel",
  "wartung",
  "sonstiges",
]);

export const nkaSchluesselSchema = z.enum([
  "direct",
  "sqm",
  "units",
  "persons",
  "consumption",
]);

// ─── Periode ─────────────────────────────────────────────────────────────────

export const nkaPeriodCreateSchema = z
  .object({
    property_id: uuidSchema,
    tax_year: taxYearSchema,
    period_start: isoDateSchema,
    period_end: isoDateSchema,
    note: z.string().max(2000).optional().nullable(),
  })
  .refine((d) => d.period_start <= d.period_end, {
    message: "period_end darf nicht vor period_start liegen",
    path: ["period_end"],
  });

export const nkaPeriodUpdateSchema = z
  .object({
    period_start: isoDateSchema.optional(),
    period_end: isoDateSchema.optional(),
    note: z.string().max(2000).optional().nullable(),
    status: z.enum(["draft", "distributed", "sent", "closed"]).optional(),
  })
  .refine(
    (d) =>
      !(
        d.period_start !== undefined &&
        d.period_end !== undefined &&
        d.period_start > d.period_end
      ),
    {
      message: "period_end darf nicht vor period_start liegen",
      path: ["period_end"],
    },
  );

// ─── Kostenpositionen ────────────────────────────────────────────────────────

const directSharesSchema = z.record(
  uuidSchema,
  z.number().int("direct_share-Wert muss eine Ganzzahl sein"),
);

const consumptionSchema = z.record(
  uuidSchema,
  z.object({ from: z.number(), to: z.number() }),
);

export const nkaCostItemCreateSchema = z.object({
  position: nkaPositionSchema,
  label: z.string().max(200).optional().nullable(),
  brutto_cents: z.number().int("brutto_cents muss eine Ganzzahl sein"),
  umlagefaehig_pct: z
    .number()
    .min(0, "umlagefaehig_pct ≥ 0")
    .max(100, "umlagefaehig_pct ≤ 100"),
  verteilungsschluessel: nkaSchluesselSchema,
  direct_shares: directSharesSchema.optional().nullable(),
  consumption: consumptionSchema.optional().nullable(),
  heizkosten_verbrauchsanteil_pct: z.number().min(0).max(100).optional().nullable(),
  transaction_id: uuidSchema.optional().nullable(),
  document_id: uuidSchema.optional().nullable(),
});

export const nkaCostItemUpdateSchema = nkaCostItemCreateSchema.partial();

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type NkaPeriodCreateRequest = z.infer<typeof nkaPeriodCreateSchema>;
export type NkaPeriodUpdateRequest = z.infer<typeof nkaPeriodUpdateSchema>;
export type NkaCostItemCreateRequest = z.infer<typeof nkaCostItemCreateSchema>;
export type NkaCostItemUpdateRequest = z.infer<typeof nkaCostItemUpdateSchema>;
