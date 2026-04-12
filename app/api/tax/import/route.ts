/**
 * POST /api/tax/import
 *
 * PDF-Upload → Claude API Extraktion → tax_data Speicherung.
 * Extrahiert Anlage-V-, FE- und FB-relevante Felder aus hochgeladenem
 * Steuerbescheid oder ELSTER-PDF.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { normalizePartnerName } from "@/lib/tax/partnerNormalization";
import type { ImportedExpenseBlockMetadata, TaxImportConfidenceMap } from "@/types/tax";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `Du bist ein Steuerformular-Extraktor fuer deutsche Steuerunterlagen zu Vermietung und GbR.
Extrahiere alle erkennbaren Felder aus dem hochgeladenen PDF fuer Anlage V, Anlage FE und Anlage FB.
Antworte ausschliesslich mit einem JSON-Objekt -- kein Text davor oder danach.
Verwende exakt diese Feldnamen (snake_case, siehe unten).
Felder die du nicht erkennst: setze den Wert auf null.
Fuer jedes extrahierte Feld setze im Objekt 'confidence' den gleichen
Schluessel mit dem Wert 'high', 'medium' oder 'low'.

Wenn das Dokument Werte als strukturierte Objekte besser ausdrueckt, verwende
fuer einzelne Felder optional das Format { "value": ..., "confidence": "high|medium|low" }.
Bei Partnern nutze ein Array.

Feldnamen: tax_year, tax_ref, ownership_share_pct, property_type,
build_year, acquisition_date, acquisition_cost_building,
rent_income, deposits_received, rent_prior_year,
operating_costs_income, other_income, loan_interest,
property_tax, hoa_fees, insurance, water_sewage,
waste_disposal, property_management, bank_fees,
maintenance_costs, other_expenses,
depreciation_building, depreciation_outdoor, depreciation_fixtures,
special_deduction_7b, special_deduction_renovation,
gbr_name, gbr_steuernummer, gbr_finanzamt, feststellungserklaerung,
teilweise_eigennutzung, eigennutzung_tage, gesamt_tage, rental_share_override_pct,
partners, expense_blocks, depreciation_items, maintenance_distributions

Wichtig:
- Datumswerte immer als exaktes Kalenderdatum ausgeben, bevorzugt DD.MM.YYYY oder YYYY-MM-DD. Keine Uhrzeiten oder ISO-Timestamps mit Zeitzonen ausgeben.
- maintenance_costs nur fuer sofort abzugsfaehigen Erhaltungsaufwand verwenden.
- Auf mehrere Jahre verteilte Erhaltungsaufwaende nach §§ 11a, 11b EStG / § 82b EStDV immer in maintenance_distributions abbilden.
- special_deduction_renovation nur fuer echte steuerliche Sonderabschreibungen / Sonderabzuege verwenden, NICHT fuer verteilten Erhaltungsaufwand aus Vorjahren oder dem aktuellen Jahr.
- Wenn Zeilen wie "davon abzuziehen", "Werbungskosten aus 2022" oder "auf bis zu 5 Jahre zu verteilende Erhaltungsaufwendungen" vorkommen, gehoeren diese in maintenance_distributions.
- Fuer jeden sichtbaren Vorjahresblock wie "aus 2022" oder "aus 2023" bitte einen eigenen maintenance_distributions-Eintrag erzeugen.

partners ist ein Array von Objekten mit:
name, anteil_pct, email, special_expenses, note

expense_blocks ist ein Array von Objekten mit:
key, label, amount, detail

Bei expense_blocks bitte moeglichst offizielle ELSTER-Kostenbloecke getrennt erfassen, z. B.:
- allocated_costs / umgelegte_kosten
- non_allocated_costs / nicht_umgelegte_kosten
- other_expenses / sonstige_kosten
- maintenance_current_year
- maintenance_prior_year_2022
- maintenance_prior_year_2023

depreciation_items ist ein Array von Objekten mit:
label, item_type, gross_annual_amount, apply_rental_ratio

maintenance_distributions ist ein Array von Objekten mit:
label, source_year, total_amount, classification, deduction_mode, distribution_years, current_year_share_override, apply_rental_ratio, note

Wenn konkrete AfA-Positionen oder verteilte Erhaltungsaufwände erkennbar sind, befülle diese Arrays.
Wenn das Dokument dafür keine belastbare Aufteilung enthält, lasse die Arrays leer statt zu raten.`;

const TEXT_FALLBACK_PROMPT = `Extrahiere aus dem folgenden OCR-/PDF-Text dieselben Steuerfelder wie zuvor.
Antworte ausschließlich mit einem JSON-Objekt und denselben Feldnamen.
Wenn etwas nicht sicher erkennbar ist, setze es auf null.
Gib zusätzlich ein Objekt confidence zurück.`;

type ImportRequest = {
  property_id: string;
  tax_year: number;
  pdf_base64: string;
  overwrite?: boolean;
};

type ImportedPartner = {
  name: string;
  anteil_pct: number | null;
  email: string | null;
  special_expenses: number | null;
  note: string | null;
};

type ImportedExpenseBlock = {
  key: string;
  label: string;
  amount: number | null;
  detail: string | null;
};

type ImportedDepreciationItem = {
  label: string;
  item_type: "building" | "outdoor" | "movable_asset";
  gross_annual_amount: number | null;
  apply_rental_ratio: boolean;
};

type ImportedMaintenanceDistribution = {
  label: string;
  source_year: number | null;
  total_amount: number | null;
  classification: "maintenance_expense" | "production_cost" | "depreciation";
  deduction_mode: "immediate" | "distributed";
  distribution_years: number | null;
  current_year_share_override: number | null;
  apply_rental_ratio: boolean;
  note: string | null;
};

type ImportedSupplementalData = {
  gbr_name: string | null;
  gbr_steuernummer: string | null;
  gbr_finanzamt: string | null;
  feststellungserklaerung: boolean | null;
  teilweise_eigennutzung: boolean | null;
  eigennutzung_tage: number | null;
  gesamt_tage: number | null;
  rental_share_override_pct: number | null;
  partners: ImportedPartner[];
  expense_blocks: ImportedExpenseBlock[];
  depreciation_items: ImportedDepreciationItem[];
  maintenance_distributions: ImportedMaintenanceDistribution[];
  import_notes: string[];
};

function normalizeDepreciationItemType(value: unknown): ImportedDepreciationItem["item_type"] | null {
  const raw = asNullableString(value);
  if (!raw) return null;

  const normalized = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (
    [
      "building",
      "gebaude",
      "afa_gebaude",
      "abschreibung_gebaude",
      "immovable_asset",
    ].includes(normalized)
  ) {
    return "building";
  }

  if (["outdoor", "aussenanlagen", "aussenanlage", "outdoor_assets"].includes(normalized)) {
    return "outdoor";
  }

  if (
    [
      "movable_asset",
      "movable",
      "fixtures",
      "inventory",
      "inventar",
      "ausstattung",
      "einbaukuche",
      "einbaukueche",
      "mobiliar",
      "equipment",
      "furniture",
      "kitchen",
    ].includes(normalized)
  ) {
    return "movable_asset";
  }

  return null;
}

function unwrapExtractedValue(value: unknown): unknown {
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return (value as Record<string, unknown>).value;
  }
  return value;
}

function asNullableString(value: unknown): string | null {
  const unwrapped = unwrapExtractedValue(value);
  if (unwrapped == null || unwrapped === "") return null;
  return String(unwrapped);
}

function asNullableNumber(value: unknown): number | null {
  const unwrapped = unwrapExtractedValue(value);
  if (unwrapped == null || unwrapped === "") return null;
  if (typeof unwrapped === "number") return Number.isFinite(unwrapped) ? unwrapped : null;
  if (typeof unwrapped === "string") {
    const normalized = unwrapped
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asNullableInteger(value: unknown): number | null {
  const num = asNullableNumber(value);
  return num == null ? null : Math.trunc(num);
}

function asNullableBoolean(value: unknown): boolean | null {
  const unwrapped = unwrapExtractedValue(value);
  if (unwrapped == null || unwrapped === "") return null;
  if (typeof unwrapped === "boolean") return unwrapped;
  if (typeof unwrapped === "number") return unwrapped !== 0;
  if (typeof unwrapped === "string") {
    const normalized = unwrapped.trim().toLowerCase();
    if (["true", "ja", "yes", "1"].includes(normalized)) return true;
    if (["false", "nein", "no", "0"].includes(normalized)) return false;
  }
  return null;
}

function asNullableDateString(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const deMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (deMatch) {
    const day = deMatch[1].padStart(2, "0");
    const month = deMatch[2].padStart(2, "0");
    return `${deMatch[3]}-${month}-${day}`;
  }

  const isoDateTimeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoDateTimeMatch) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const formatter = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return formatter.format(parsed);
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(parsed);
}

function asObjectArray(value: unknown) {
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function extractJsonText(raw: string) {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    }
    throw new Error("Antwort enthielt kein parsebares JSON.");
  }
}

async function callAnthropicJsonFromPdf(args: {
  pdfBase64: string;
  apiKey: string;
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: args.pdfBase64,
              },
            },
            {
              type: "text",
              text:
                "Extrahiere alle erkennbaren Steuerdaten aus diesem Dokument als JSON. Berücksichtige Anlage V, FE/FB sowie AfA-Komponenten. Wenn AfA fuer Inventar, Ausstattung, Einbaukueche oder sonstige bewegliche Wirtschaftsgueter erkennbar ist, liefere diese ausdruecklich sowohl im Feld depreciation_fixtures als auch - falls moeglich - in depreciation_items.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API ${response.status}: ${errorBody || response.statusText}`);
  }

  const result = (await response.json()) as {
    content: { type: string; text?: string }[];
  };

  const textBlock = result.content.find((c) => c.type === "text");
  if (!textBlock?.text) throw new Error("Keine Textantwort von Claude.");
  return extractJsonText(textBlock.text);
}

async function callAnthropicTextFromPdf(args: {
  pdfBase64: string;
  apiKey: string;
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: args.pdfBase64,
              },
            },
            {
              type: "text",
              text: "Lies den Text aus diesem Steuerdokument vollständig aus. Gib nur den erkannten Text zurück.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude OCR ${response.status}: ${errorBody || response.statusText}`);
  }

  const result = (await response.json()) as {
    content: { type: string; text?: string }[];
  };
  const text = result.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("OCR-Fallback lieferte keinen Text.");
  return text;
}

async function callAnthropicJsonFromText(args: {
  text: string;
  apiKey: string;
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${TEXT_FALLBACK_PROMPT}\n\nDokumenttext:\n${args.text.slice(0, 120000)}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude Text-Analyse ${response.status}: ${errorBody || response.statusText}`);
  }

  const result = (await response.json()) as {
    content: { type: string; text?: string }[];
  };
  const textBlock = result.content.find((c) => c.type === "text");
  if (!textBlock?.text) throw new Error("Text-Fallback lieferte keine JSON-Antwort.");
  return extractJsonText(textBlock.text);
}

function inferMaintenanceSourceYear(
  item: ImportedMaintenanceDistribution,
  taxYear: number,
) {
  if (item.source_year != null) return item.source_year;
  const haystack = `${item.label} ${item.note ?? ""}`.toLowerCase();
  const yearMatch = haystack.match(/\baus\s+(20\d{2})\b/);
  if (yearMatch) return Number(yearMatch[1]);
  return taxYear;
}

function normalizeImportedMaintenanceDistribution(
  item: ImportedMaintenanceDistribution,
  taxYear: number,
): ImportedMaintenanceDistribution {
  const sourceYear = inferMaintenanceSourceYear(item, taxYear);
  const looksDistributed = item.deduction_mode === "distributed" || sourceYear < taxYear;
  const minimumYearsForCarryForward = Math.max(1, taxYear - sourceYear + 1);
  const distributionYears = looksDistributed
    ? Math.min(5, Math.max(Math.max(2, minimumYearsForCarryForward), item.distribution_years ?? 3))
    : 1;

  return {
    ...item,
    source_year: sourceYear,
    deduction_mode: looksDistributed ? "distributed" : "immediate",
    distribution_years: distributionYears,
  };
}

function inferDistributionYearsFromText(value: string, fallback: number) {
  const match = value.match(/verteilt\s+auf\s+(\d+)\s+jahre/i);
  if (!match) return fallback;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildFallbackMaintenanceDistributionsFromExpenseBlocks(args: {
  blocks: ImportedExpenseBlock[];
  taxYear: number;
  existing: ImportedMaintenanceDistribution[];
}) {
  const seenYears = new Set(args.existing.map((item) => item.source_year).filter((value): value is number => value != null));

  return args.blocks.reduce<ImportedMaintenanceDistribution[]>((acc, block) => {
    const normalizedKey = normalizePartnerName(block.key).replace(/\s+/g, "_");
    const combined = `${block.key} ${block.label} ${block.detail ?? ""}`;
    const isMaintenanceLike =
      normalizedKey.includes("maintenance") ||
      normalizedKey.includes("erhaltungsaufwand") ||
      /erhaltungsaufwand/i.test(combined);

    if (!isMaintenanceLike || block.amount == null || block.amount <= 0) return acc;

    const yearFromKey = `${block.key} ${block.label}`.match(/\b(20\d{2})\b/);
    const sourceYear = yearFromKey ? Number(yearFromKey[1]) : args.taxYear;
    if (seenYears.has(sourceYear)) return acc;

    const minimumYears = Math.max(1, args.taxYear - sourceYear + 1);
    const distributionYears = inferDistributionYearsFromText(combined, sourceYear < args.taxYear ? minimumYears : 3);

    acc.push({
      label: block.label,
      source_year: sourceYear,
      total_amount: round2(block.amount),
      classification: "maintenance_expense",
      deduction_mode: "distributed",
      distribution_years: distributionYears,
      current_year_share_override: round2(block.amount),
      apply_rental_ratio: false,
      note: block.detail ?? "Aus ELSTER-Kostenblock abgeleitet",
    });
    seenYears.add(sourceYear);
    return acc;
  }, []);
}

function reconcileMaintenanceDistributionsWithExpenseBlocks(args: {
  blocks: ImportedExpenseBlock[];
  taxYear: number;
  distributions: ImportedMaintenanceDistribution[];
}) {
  const blockByYear = new Map<number, ImportedExpenseBlock>();

  for (const block of args.blocks) {
    const combined = `${block.key} ${block.label} ${block.detail ?? ""}`;
    if (!/erhaltungsaufwand|maintenance/i.test(combined)) continue;
    const yearMatch = combined.match(/\b(20\d{2})\b/);
    const sourceYear = yearMatch ? Number(yearMatch[1]) : args.taxYear;
    if (block.amount == null || block.amount <= 0) continue;
    blockByYear.set(sourceYear, block);
  }

  return args.distributions.map((item) => {
    const block = item.source_year != null ? blockByYear.get(item.source_year) : null;
    if (!block || block.amount == null || block.amount <= 0) return item;
    return {
      ...item,
      current_year_share_override: round2(block.amount),
      apply_rental_ratio: false,
      note: [item.note, "ELSTER-Jahresbetrag aus Kostenblock übernommen"].filter(Boolean).join(" · "),
    };
  });
}

export async function POST(request: Request) {
  // Env check
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Server nicht korrekt konfiguriert." }, { status: 500 });
  }

  // Parse body
  let body: ImportRequest;
  try {
    body = (await request.json()) as ImportRequest;
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const { property_id, tax_year, pdf_base64, overwrite } = body;

  if (!property_id || !tax_year || !pdf_base64) {
    return NextResponse.json({ error: "property_id, tax_year und pdf_base64 sind erforderlich." }, { status: 400 });
  }

  // Check PDF size (~10 MB base64 ≈ 13.3 MB)
  if (pdf_base64.length > 14_000_000) {
    return NextResponse.json({ error: "PDF zu groß (max. 10 MB)." }, { status: 400 });
  }

  // Supabase auth
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
    },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  // Verify property ownership
  const { data: prop } = await supabase
    .from("properties")
    .select("id")
    .eq("id", property_id)
    .eq("user_id", user.id)
    .single();

  if (!prop) {
    return NextResponse.json({ error: "Immobilie nicht gefunden oder kein Zugriff." }, { status: 403 });
  }

  // Check for existing entry
  if (!overwrite) {
    const { data: existing } = await supabase
      .from("tax_data")
      .select("id")
      .eq("property_id", property_id)
      .eq("tax_year", tax_year)
      .single();

    if (existing) {
      return NextResponse.json({
        error: `Für ${tax_year} existiert bereits ein Eintrag. Mit overwrite: true überschreiben.`,
        existing_id: existing.id,
      }, { status: 409 });
    }
  }

  // Call Claude API with PDF
  let extractedFields: Record<string, unknown>;
  let confidence: Record<string, string> = {};

  try {
    const parsed = await callAnthropicJsonFromPdf({
      pdfBase64: pdf_base64,
      apiKey: ANTHROPIC_API_KEY,
    });
    confidence = (parsed.confidence ?? {}) as Record<string, string>;
    delete parsed.confidence;
    extractedFields = parsed;
  } catch (directError) {
    console.error("Direct PDF tax import failed, trying OCR fallback:", directError);
    try {
      const extractedText = await callAnthropicTextFromPdf({
        pdfBase64: pdf_base64,
        apiKey: ANTHROPIC_API_KEY,
      });
      const parsed = await callAnthropicJsonFromText({
        text: extractedText,
        apiKey: ANTHROPIC_API_KEY,
      });
      confidence = (parsed.confidence ?? {}) as Record<string, string>;
      delete parsed.confidence;
      extractedFields = parsed;
    } catch (fallbackError) {
      console.error("PDF import fallback error:", fallbackError);
      const detail = fallbackError instanceof Error ? fallbackError.message : "Unbekannter Fehler.";
      return NextResponse.json(
        {
          error: "Fehler bei der KI-Analyse.",
          details: detail,
        },
        { status: 500 },
      );
    }
  }

  if (!extractedFields) {
    return NextResponse.json({ error: "Extraktion fehlgeschlagen." }, { status: 500 });
  }

  // Build tax_data record
  const taxData = {
    property_id,
    tax_year: asNullableInteger(extractedFields.tax_year) ?? tax_year,
    tax_ref: asNullableString(extractedFields.tax_ref),
    ownership_share_pct: asNullableNumber(extractedFields.ownership_share_pct),
    property_type: asNullableString(extractedFields.property_type),
    build_year: asNullableInteger(extractedFields.build_year),
    acquisition_date: asNullableDateString(extractedFields.acquisition_date),
    acquisition_cost_building: asNullableNumber(extractedFields.acquisition_cost_building),
    rent_income: asNullableNumber(extractedFields.rent_income),
    deposits_received: asNullableNumber(extractedFields.deposits_received),
    rent_prior_year: asNullableNumber(extractedFields.rent_prior_year),
    operating_costs_income: asNullableNumber(extractedFields.operating_costs_income),
    other_income: asNullableNumber(extractedFields.other_income),
    loan_interest: asNullableNumber(extractedFields.loan_interest),
    property_tax: asNullableNumber(extractedFields.property_tax),
    hoa_fees: asNullableNumber(extractedFields.hoa_fees),
    insurance: asNullableNumber(extractedFields.insurance),
    water_sewage: asNullableNumber(extractedFields.water_sewage),
    waste_disposal: asNullableNumber(extractedFields.waste_disposal),
    property_management: asNullableNumber(extractedFields.property_management),
    bank_fees: asNullableNumber(extractedFields.bank_fees),
    maintenance_costs: asNullableNumber(extractedFields.maintenance_costs),
    other_expenses: asNullableNumber(extractedFields.other_expenses),
    depreciation_building: asNullableNumber(extractedFields.depreciation_building),
    depreciation_outdoor: asNullableNumber(extractedFields.depreciation_outdoor),
    depreciation_fixtures: asNullableNumber(extractedFields.depreciation_fixtures),
    special_deduction_7b: asNullableNumber(extractedFields.special_deduction_7b),
    special_deduction_renovation: asNullableNumber(extractedFields.special_deduction_renovation),
    import_source: "pdf_import",
    import_confidence: confidence as TaxImportConfidenceMap,
  };

  const supplementalData: ImportedSupplementalData = {
    gbr_name: asNullableString(extractedFields.gbr_name),
    gbr_steuernummer: asNullableString(extractedFields.gbr_steuernummer),
    gbr_finanzamt: asNullableString(extractedFields.gbr_finanzamt),
    feststellungserklaerung: asNullableBoolean(extractedFields.feststellungserklaerung),
    teilweise_eigennutzung: asNullableBoolean(extractedFields.teilweise_eigennutzung),
    eigennutzung_tage: asNullableInteger(extractedFields.eigennutzung_tage),
    gesamt_tage: asNullableInteger(extractedFields.gesamt_tage),
    rental_share_override_pct: (() => {
      const value = asNullableNumber(extractedFields.rental_share_override_pct);
      if (value == null) return null;
      return value > 1 ? value / 100 : value;
    })(),
    partners: Array.isArray(extractedFields.partners)
      ? extractedFields.partners.reduce<ImportedPartner[]>((acc, partner) => {
          const row = partner as Record<string, unknown>;
          const name = asNullableString(row.name);
          if (!name) return acc;
          acc.push({
            name,
            anteil_pct: asNullableNumber(row.anteil_pct ?? row.anteil),
            email: asNullableString(row.email),
            special_expenses: asNullableNumber(row.special_expenses),
            note: asNullableString(row.note),
          });
          return acc;
        }, [])
      : [],
    expense_blocks: asObjectArray(extractedFields.expense_blocks).reduce<ImportedExpenseBlock[]>((acc, row) => {
      const key = asNullableString(row.key);
      const label = asNullableString(row.label);
      if (!key || !label) return acc;
      acc.push({
        key,
        label,
        amount: asNullableNumber(row.amount),
        detail: asNullableString(row.detail),
      });
      return acc;
    }, []),
    depreciation_items: asObjectArray(extractedFields.depreciation_items).reduce<ImportedDepreciationItem[]>((acc, row) => {
      const label = asNullableString(row.label);
      const itemType = normalizeDepreciationItemType(row.item_type);
      if (!label || !itemType) return acc;
      acc.push({
        label,
        item_type: itemType,
        gross_annual_amount: asNullableNumber(row.gross_annual_amount),
        apply_rental_ratio: asNullableBoolean(row.apply_rental_ratio) ?? true,
      });
      return acc;
    }, []),
    maintenance_distributions: asObjectArray(extractedFields.maintenance_distributions).reduce<ImportedMaintenanceDistribution[]>((acc, row) => {
      const label = asNullableString(row.label);
      if (!label) return acc;
      const classification = asNullableString(row.classification);
      const deductionMode = asNullableString(row.deduction_mode);
      acc.push({
        label,
        source_year: asNullableInteger(row.source_year),
        total_amount: asNullableNumber(row.total_amount),
        classification:
          classification === "production_cost" || classification === "depreciation"
            ? classification
            : "maintenance_expense",
        deduction_mode: deductionMode === "immediate" ? "immediate" : "distributed",
        distribution_years: asNullableInteger(row.distribution_years),
        current_year_share_override: asNullableNumber(row.current_year_share_override),
        apply_rental_ratio: asNullableBoolean(row.apply_rental_ratio) ?? true,
        note: asNullableString(row.note),
      });
      return acc;
    }, []),
    import_notes: [],
  };
  supplementalData.maintenance_distributions = supplementalData.maintenance_distributions.map((item) =>
    normalizeImportedMaintenanceDistribution(item, tax_year),
  );
  if (supplementalData.expense_blocks.length > 0) {
    supplementalData.maintenance_distributions.push(
      ...buildFallbackMaintenanceDistributionsFromExpenseBlocks({
        blocks: supplementalData.expense_blocks,
        taxYear: tax_year,
        existing: supplementalData.maintenance_distributions,
      }),
    );
    supplementalData.maintenance_distributions = reconcileMaintenanceDistributionsWithExpenseBlocks({
      blocks: supplementalData.expense_blocks,
      taxYear: tax_year,
      distributions: supplementalData.maintenance_distributions,
    });
  }
  supplementalData.partners = Array.from(
    supplementalData.partners.reduce((acc, partner) => {
      const key = normalizePartnerName(partner.name);
      const existing = acc.get(key);
      if (!existing) {
        acc.set(key, { ...partner });
        return acc;
      }
      existing.anteil_pct = Math.max(existing.anteil_pct ?? 0, partner.anteil_pct ?? 0);
      if (!existing.email && partner.email) existing.email = partner.email;
      if ((existing.special_expenses ?? null) == null || Math.abs(partner.special_expenses ?? 0) > Math.abs(existing.special_expenses ?? 0)) {
        existing.special_expenses = partner.special_expenses;
      }
      if (!existing.note && partner.note) existing.note = partner.note;
      if (partner.name.length > existing.name.length) existing.name = partner.name;
      return acc;
    }, new Map<string, ImportedPartner>()).values(),
  );

  if (supplementalData.maintenance_distributions.length > 0 && (taxData.special_deduction_renovation ?? 0) > 0) {
    const inferredRentalSharePct =
      supplementalData.rental_share_override_pct != null
        ? supplementalData.rental_share_override_pct
        : supplementalData.gesamt_tage != null && supplementalData.gesamt_tage > 0
          ? Math.max(
              0,
              Math.min(
                1,
                1 - ((supplementalData.eigennutzung_tage ?? 0) / supplementalData.gesamt_tage),
              ),
            )
          : null;

    const proratedMaintenanceAmount = round2(
      supplementalData.maintenance_distributions.reduce((sum, item) => {
        const currentYearShare =
          item.current_year_share_override != null
            ? item.current_year_share_override
            : item.total_amount != null && (item.distribution_years ?? 0) > 0
              ? item.total_amount / (item.distribution_years ?? 1)
              : 0;
        if (currentYearShare <= 0) return sum;
        const deductibleShare = item.apply_rental_ratio === false || inferredRentalSharePct == null
          ? currentYearShare
          : currentYearShare * inferredRentalSharePct;
        return sum + deductibleShare;
      }, 0),
    );

    if (Math.abs(proratedMaintenanceAmount - (taxData.special_deduction_renovation ?? 0)) <= 2) {
      taxData.special_deduction_renovation = null;
      supplementalData.import_notes.push("Ein als Sonderabzug erkannter Betrag wurde als verteilter Erhaltungsaufwand erkannt und daher nicht als Sonderabzug übernommen.");
    }
  }
  if (
    supplementalData.depreciation_items.every((item) => item.item_type !== "movable_asset") &&
    (taxData.depreciation_fixtures ?? 0) > 0
  ) {
    supplementalData.depreciation_items.push({
      label: "Inventar / Ausstattung",
      item_type: "movable_asset",
      gross_annual_amount: taxData.depreciation_fixtures,
      apply_rental_ratio: true,
    });
    supplementalData.import_notes.push("AfA Inventar wurde aus dem PDF-Feld depreciation_fixtures als AfA-Komponente ergänzt.");
  }

  if (supplementalData.expense_blocks.length > 0) {
    taxData.import_confidence = {
      ...(taxData.import_confidence ?? {}),
      __expense_blocks: supplementalData.expense_blocks as ImportedExpenseBlockMetadata[],
    } as TaxImportConfidenceMap;
  }

  // Upsert (overwrite if confirmed)
  const { data: saved, error: saveError } = overwrite
    ? await supabase
        .from("tax_data")
        .upsert(taxData, { onConflict: "property_id,tax_year" })
        .select()
        .single()
    : await supabase
        .from("tax_data")
        .insert(taxData)
        .select()
        .single();

  if (saveError) {
    console.error("Save error:", saveError);
    return NextResponse.json({ error: `Speichern fehlgeschlagen: ${saveError.message}` }, { status: 500 });
  }

  // Persist additional FE/FB- and GbR-related data when present.
  const hasGbrContent =
    supplementalData.gbr_name != null ||
    supplementalData.gbr_steuernummer != null ||
    supplementalData.gbr_finanzamt != null ||
    supplementalData.feststellungserklaerung != null ||
    supplementalData.teilweise_eigennutzung != null ||
    supplementalData.partners.length > 0;

  if (hasGbrContent) {
    const { data: existingGbr, error: existingGbrError } = await supabase
      .from("gbr_settings")
      .select("id, property_id, name, steuernummer, finanzamt, veranlagungszeitraum, sonder_werbungskosten, feststellungserklaerung, teilweise_eigennutzung")
      .eq("property_id", property_id)
      .maybeSingle();

    if (existingGbrError) {
      return NextResponse.json({ error: `GbR-Stammdaten konnten nicht geladen werden: ${existingGbrError.message}` }, { status: 500 });
    }

    const gbrPayload = {
      property_id,
      name: supplementalData.gbr_name ?? existingGbr?.name ?? "",
      steuernummer: supplementalData.gbr_steuernummer ?? existingGbr?.steuernummer ?? "",
      finanzamt: supplementalData.gbr_finanzamt ?? existingGbr?.finanzamt ?? "",
      veranlagungszeitraum: existingGbr?.veranlagungszeitraum ?? tax_year,
      sonder_werbungskosten:
        supplementalData.partners.some((partner) => (partner.special_expenses ?? 0) !== 0) ||
        existingGbr?.sonder_werbungskosten ||
        false,
      feststellungserklaerung: supplementalData.feststellungserklaerung ?? existingGbr?.feststellungserklaerung ?? true,
      teilweise_eigennutzung: supplementalData.teilweise_eigennutzung ?? existingGbr?.teilweise_eigennutzung ?? false,
    };

    const { data: savedGbr, error: gbrSaveError } = await supabase
      .from("gbr_settings")
      .upsert(gbrPayload, { onConflict: "property_id" })
      .select("id")
      .single();

    if (gbrSaveError || !savedGbr) {
      return NextResponse.json({ error: `GbR-Stammdaten konnten nicht gespeichert werden: ${gbrSaveError?.message ?? "unbekannt"}` }, { status: 500 });
    }

    const { data: existingPartners, error: partnersError } = await supabase
      .from("gbr_partner")
      .select("id, name, anteil, email")
      .eq("gbr_settings_id", savedGbr.id);

    if (partnersError) {
      return NextResponse.json({ error: `GbR-Partner konnten nicht geladen werden: ${partnersError.message}` }, { status: 500 });
    }

    const existingPartnerMap = new Map(
      (existingPartners ?? []).map((partner) => [normalizePartnerName(partner.name), partner]),
    );

    for (const importedPartner of supplementalData.partners) {
      const normalizedName = normalizePartnerName(importedPartner.name);
      const existingPartner = existingPartnerMap.get(normalizedName);

      const partnerPayload = {
        gbr_settings_id: savedGbr.id,
        name: importedPartner.name,
        anteil: importedPartner.anteil_pct ?? existingPartner?.anteil ?? 0,
        email: importedPartner.email ?? existingPartner?.email ?? null,
      };

      let partnerId = existingPartner?.id ?? null;

      if (existingPartner) {
        const { error: partnerUpdateError } = await supabase
          .from("gbr_partner")
          .update(partnerPayload)
          .eq("id", existingPartner.id);

        if (partnerUpdateError) {
          return NextResponse.json({ error: `GbR-Partner konnten nicht aktualisiert werden: ${partnerUpdateError.message}` }, { status: 500 });
        }
      } else {
        const { data: newPartner, error: partnerInsertError } = await supabase
          .from("gbr_partner")
          .insert(partnerPayload)
          .select("id, name, anteil, email")
          .single();

        if (partnerInsertError || !newPartner) {
          return NextResponse.json({ error: `GbR-Partner konnten nicht angelegt werden: ${partnerInsertError?.message ?? "unbekannt"}` }, { status: 500 });
        }
        partnerId = newPartner.id;
        existingPartnerMap.set(normalizedName, newPartner);
      }

      if (partnerId && ((importedPartner.special_expenses ?? 0) !== 0 || importedPartner.note != null)) {
        const { error: partnerTaxError } = await supabase
          .from("gbr_partner_tax_data")
          .upsert({
            gbr_partner_id: partnerId,
            tax_year: tax_year,
            special_expenses: importedPartner.special_expenses ?? 0,
            note: importedPartner.note ?? null,
          }, { onConflict: "gbr_partner_id,tax_year" });

        if (partnerTaxError) {
          return NextResponse.json({ error: `Partner-Sonderwerte konnten nicht gespeichert werden: ${partnerTaxError.message}` }, { status: 500 });
        }
      }
    }
  }

  const hasTaxSettingsContent =
    supplementalData.eigennutzung_tage != null ||
    supplementalData.gesamt_tage != null ||
    supplementalData.rental_share_override_pct != null;

  if (hasTaxSettingsContent) {
    const { data: existingTaxSettings, error: existingTaxSettingsError } = await supabase
      .from("tax_settings")
      .select("property_id, tax_year, objekttyp, eigennutzung_tage, gesamt_tage, rental_share_override_pct, kleinunternehmer, option_ust")
      .eq("property_id", property_id)
      .in("tax_year", [0, tax_year])
      .order("tax_year", { ascending: false })
      .limit(1);

    if (existingTaxSettingsError) {
      return NextResponse.json({ error: `Steuer-Einstellungen konnten nicht geladen werden: ${existingTaxSettingsError.message}` }, { status: 500 });
    }
    const resolvedExistingTaxSettings = existingTaxSettings?.[0] ?? null;

    const resolvedRentalShareOverride =
      supplementalData.eigennutzung_tage != null || supplementalData.gesamt_tage != null
        ? null
        : supplementalData.rental_share_override_pct ?? resolvedExistingTaxSettings?.rental_share_override_pct ?? null;

    const { error: taxSettingsSaveError } = await supabase
      .from("tax_settings")
      .upsert({
        property_id,
        tax_year,
        objekttyp: resolvedExistingTaxSettings?.objekttyp ?? "dauervermietung",
        eigennutzung_tage: supplementalData.eigennutzung_tage ?? resolvedExistingTaxSettings?.eigennutzung_tage ?? 0,
        gesamt_tage: supplementalData.gesamt_tage ?? resolvedExistingTaxSettings?.gesamt_tage ?? 365,
        rental_share_override_pct: resolvedRentalShareOverride,
        kleinunternehmer: resolvedExistingTaxSettings?.kleinunternehmer ?? false,
        option_ust: resolvedExistingTaxSettings?.option_ust ?? false,
      }, { onConflict: "property_id,tax_year" });

    if (taxSettingsSaveError) {
      return NextResponse.json({ error: `Steuer-Einstellungen konnten nicht gespeichert werden: ${taxSettingsSaveError.message}` }, { status: 500 });
    }
  }

  const importedDepreciationItems = supplementalData.depreciation_items.filter(
    (item) => item.gross_annual_amount != null && item.gross_annual_amount > 0,
  );
  if (importedDepreciationItems.length > 0) {
    const { data: existingDepItems, error: depItemsError } = await supabase
      .from("tax_depreciation_items")
      .select("id")
      .eq("property_id", property_id)
      .eq("tax_year", tax_year);

    if (depItemsError) {
      supplementalData.import_notes.push(`AfA-Positionen konnten nicht geprüft werden: ${depItemsError.message}`);
    } else if ((existingDepItems?.length ?? 0) === 0 || overwrite) {
      if (overwrite && (existingDepItems?.length ?? 0) > 0) {
        await supabase.from("tax_depreciation_items").delete().eq("property_id", property_id).eq("tax_year", tax_year);
      }

      const { error: depInsertError } = await supabase
        .from("tax_depreciation_items")
        .insert(importedDepreciationItems.map((item) => ({
          property_id,
          tax_year,
          item_type: item.item_type,
          label: item.label,
          gross_annual_amount: item.gross_annual_amount,
          apply_rental_ratio: item.apply_rental_ratio,
        })));

      if (depInsertError) {
        supplementalData.import_notes.push(`AfA-Positionen konnten nicht übernommen werden: ${depInsertError.message}`);
      } else {
        supplementalData.import_notes.push(`${importedDepreciationItems.length} AfA-Position(en) aus dem PDF übernommen.`);
      }
    } else {
      supplementalData.import_notes.push("AfA-Positionen wurden erkannt, aber nicht übernommen, weil bereits AfA-Komponenten vorhanden sind.");
    }
  }

  const importedMaintenanceDistributions = supplementalData.maintenance_distributions.filter(
    (item) => item.source_year != null && item.total_amount != null && item.total_amount > 0,
  );
  if (importedMaintenanceDistributions.length > 0) {
    const { data: existingMaintenanceItems, error: maintenanceItemsError } = await supabase
      .from("tax_maintenance_distributions")
      .select("id")
      .eq("property_id", property_id);

    if (maintenanceItemsError) {
      supplementalData.import_notes.push(`Verteilungsblöcke konnten nicht geprüft werden: ${maintenanceItemsError.message}`);
    } else if ((existingMaintenanceItems?.length ?? 0) === 0 || overwrite) {
      if (overwrite && (existingMaintenanceItems?.length ?? 0) > 0) {
        await supabase
          .from("tax_maintenance_distributions")
          .delete()
          .eq("property_id", property_id)
          .ilike("note", "PDF Import:%");
      }

      const { error: maintenanceInsertError } = await supabase
        .from("tax_maintenance_distributions")
        .insert(importedMaintenanceDistributions.map((item) => ({
          property_id,
          source_year: item.source_year,
          label: item.label,
          total_amount: item.total_amount,
          classification: item.classification,
          deduction_mode: item.deduction_mode,
          distribution_years:
            item.deduction_mode === "immediate"
              ? 1
              : Math.min(5, Math.max(2, item.distribution_years ?? 3)),
          current_year_share_override: item.current_year_share_override,
          apply_rental_ratio: item.apply_rental_ratio,
          status: "active",
          note: `PDF Import: ${tax_year}${item.note ? ` · ${item.note}` : ""}`,
        })));

      if (maintenanceInsertError) {
        supplementalData.import_notes.push(`Verteilungsblöcke konnten nicht übernommen werden: ${maintenanceInsertError.message}`);
      } else {
        supplementalData.import_notes.push(`${importedMaintenanceDistributions.length} Verteilungsblock/-blöcke aus dem PDF übernommen.`);
      }
    } else {
      supplementalData.import_notes.push("Verteilungsblöcke wurden erkannt, aber nicht übernommen, weil bereits Logik-Items vorhanden sind.");
    }
  }

  return NextResponse.json({
    tax_data_id: saved.id,
    fields: saved,
    confidence,
    supplemental_data: supplementalData,
  });
}
