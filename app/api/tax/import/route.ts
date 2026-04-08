/**
 * POST /api/tax/import
 *
 * PDF-Upload → Claude API Extraktion → tax_data Speicherung.
 * Extrahiert Anlage-V-Felder aus hochgeladenem Steuerbescheid oder ELSTER-PDF.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `Du bist ein Steuerformular-Extraktor fuer deutsche Anlage-V-Formulare.
Extrahiere alle erkennbaren Felder aus dem hochgeladenen PDF.
Antworte ausschliesslich mit einem JSON-Objekt -- kein Text davor oder danach.
Verwende exakt diese Feldnamen (snake_case, siehe unten).
Felder die du nicht erkennst: setze den Wert auf null.
Fuer jedes extrahierte Feld setze im Objekt 'confidence' den gleichen
Schluessel mit dem Wert 'high', 'medium' oder 'low'.

Feldnamen: tax_year, tax_ref, ownership_share_pct, property_type,
build_year, acquisition_date, acquisition_cost_building,
rent_income, deposits_received, rent_prior_year,
operating_costs_income, other_income, loan_interest,
property_tax, hoa_fees, insurance, water_sewage,
waste_disposal, property_management, bank_fees,
maintenance_costs, other_expenses,
depreciation_building, depreciation_outdoor, depreciation_fixtures,
special_deduction_7b, special_deduction_renovation`;

type ImportRequest = {
  property_id: string;
  tax_year: number;
  pdf_base64: string;
  overwrite?: boolean;
};

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

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
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
                    data: pdf_base64,
                  },
                },
                {
                  type: "text",
                  text: "Extrahiere alle Anlage-V-Felder aus diesem Dokument als JSON.",
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Claude API error:", response.status, errorBody);
        if (attempt === 0) continue; // retry once
        return NextResponse.json({ error: "Fehler bei der KI-Analyse." }, { status: 500 });
      }

      const result = (await response.json()) as {
        content: { type: string; text?: string }[];
      };

      const textBlock = result.content.find((c) => c.type === "text");
      if (!textBlock?.text) {
        if (attempt === 0) continue;
        return NextResponse.json({ error: "Keine Antwort von der KI." }, { status: 500 });
      }

      // Parse JSON — handle markdown code fences
      let jsonStr = textBlock.text.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      confidence = (parsed.confidence ?? {}) as Record<string, string>;
      delete parsed.confidence;
      extractedFields = parsed;
      break;
    } catch (e) {
      if (attempt === 0) continue;
      console.error("PDF import error:", e);
      return NextResponse.json({ error: "Fehler beim Verarbeiten der KI-Antwort." }, { status: 500 });
    }
  }

  // @ts-expect-error — extractedFields is set in the loop or we return early
  if (!extractedFields) {
    return NextResponse.json({ error: "Extraktion fehlgeschlagen." }, { status: 500 });
  }

  // Build tax_data record
  const taxData = {
    property_id,
    tax_year: extractedFields.tax_year ?? tax_year,
    tax_ref: extractedFields.tax_ref ?? null,
    ownership_share_pct: extractedFields.ownership_share_pct ?? null,
    property_type: extractedFields.property_type ?? null,
    build_year: extractedFields.build_year ?? null,
    acquisition_date: extractedFields.acquisition_date ?? null,
    acquisition_cost_building: extractedFields.acquisition_cost_building ?? null,
    rent_income: extractedFields.rent_income ?? null,
    deposits_received: extractedFields.deposits_received ?? null,
    rent_prior_year: extractedFields.rent_prior_year ?? null,
    operating_costs_income: extractedFields.operating_costs_income ?? null,
    other_income: extractedFields.other_income ?? null,
    loan_interest: extractedFields.loan_interest ?? null,
    property_tax: extractedFields.property_tax ?? null,
    hoa_fees: extractedFields.hoa_fees ?? null,
    insurance: extractedFields.insurance ?? null,
    water_sewage: extractedFields.water_sewage ?? null,
    waste_disposal: extractedFields.waste_disposal ?? null,
    property_management: extractedFields.property_management ?? null,
    bank_fees: extractedFields.bank_fees ?? null,
    maintenance_costs: extractedFields.maintenance_costs ?? null,
    other_expenses: extractedFields.other_expenses ?? null,
    depreciation_building: extractedFields.depreciation_building ?? null,
    depreciation_outdoor: extractedFields.depreciation_outdoor ?? null,
    depreciation_fixtures: extractedFields.depreciation_fixtures ?? null,
    special_deduction_7b: extractedFields.special_deduction_7b ?? null,
    special_deduction_renovation: extractedFields.special_deduction_renovation ?? null,
    import_source: "pdf_import",
    import_confidence: confidence,
  };

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

  return NextResponse.json({
    tax_data_id: saved.id,
    fields: saved,
    confidence,
  });
}
