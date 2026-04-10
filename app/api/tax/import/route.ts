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
partners

partners ist ein Array von Objekten mit:
name, anteil_pct, email, special_expenses, note`;

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
};

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

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("de-DE");
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
    tax_year: asNullableInteger(extractedFields.tax_year) ?? tax_year,
    tax_ref: asNullableString(extractedFields.tax_ref),
    ownership_share_pct: asNullableNumber(extractedFields.ownership_share_pct),
    property_type: asNullableString(extractedFields.property_type),
    build_year: asNullableInteger(extractedFields.build_year),
    acquisition_date: asNullableString(extractedFields.acquisition_date),
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
    import_confidence: confidence,
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
      (existingPartners ?? []).map((partner) => [normalizeName(partner.name), partner]),
    );

    for (const importedPartner of supplementalData.partners) {
      const normalizedName = normalizeName(importedPartner.name);
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
      .select("property_id, objekttyp, eigennutzung_tage, gesamt_tage, rental_share_override_pct, kleinunternehmer, option_ust")
      .eq("property_id", property_id)
      .maybeSingle();

    if (existingTaxSettingsError) {
      return NextResponse.json({ error: `Steuer-Einstellungen konnten nicht geladen werden: ${existingTaxSettingsError.message}` }, { status: 500 });
    }

    const { error: taxSettingsSaveError } = await supabase
      .from("tax_settings")
      .upsert({
        property_id,
        objekttyp: existingTaxSettings?.objekttyp ?? "dauervermietung",
        eigennutzung_tage: supplementalData.eigennutzung_tage ?? existingTaxSettings?.eigennutzung_tage ?? 0,
        gesamt_tage: supplementalData.gesamt_tage ?? existingTaxSettings?.gesamt_tage ?? 365,
        rental_share_override_pct: supplementalData.rental_share_override_pct ?? existingTaxSettings?.rental_share_override_pct ?? null,
        kleinunternehmer: existingTaxSettings?.kleinunternehmer ?? false,
        option_ust: existingTaxSettings?.option_ust ?? false,
      }, { onConflict: "property_id" });

    if (taxSettingsSaveError) {
      return NextResponse.json({ error: `Steuer-Einstellungen konnten nicht gespeichert werden: ${taxSettingsSaveError.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    tax_data_id: saved.id,
    fields: saved,
    confidence,
    supplemental_data: supplementalData,
  });
}
