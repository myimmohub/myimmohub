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

partners ist ein Array von Objekten mit:
name, anteil_pct, email, special_expenses, note

expense_blocks ist ein Array von Objekten mit:
key, label, amount, detail

depreciation_items ist ein Array von Objekten mit:
label, item_type, gross_annual_amount, apply_rental_ratio

maintenance_distributions ist ein Array von Objekten mit:
label, source_year, total_amount, classification, deduction_mode, distribution_years, current_year_share_override, apply_rental_ratio, note

Wenn konkrete AfA-Positionen oder verteilte Erhaltungsaufwände erkennbar sind, befülle diese Arrays.
Wenn das Dokument dafür keine belastbare Aufteilung enthält, lasse die Arrays leer statt zu raten.`;

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

function asObjectArray(value: unknown) {
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
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
      const itemType = asNullableString(row.item_type);
      if (!label || !itemType || !["building", "outdoor", "movable_asset"].includes(itemType)) return acc;
      acc.push({
        label,
        item_type: itemType as ImportedDepreciationItem["item_type"],
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
      .select("property_id, objekttyp, eigennutzung_tage, gesamt_tage, rental_share_override_pct, kleinunternehmer, option_ust")
      .eq("property_id", property_id)
      .maybeSingle();

    if (existingTaxSettingsError) {
      return NextResponse.json({ error: `Steuer-Einstellungen konnten nicht geladen werden: ${existingTaxSettingsError.message}` }, { status: 500 });
    }

    const resolvedRentalShareOverride =
      supplementalData.eigennutzung_tage != null || supplementalData.gesamt_tage != null
        ? null
        : supplementalData.rental_share_override_pct ?? existingTaxSettings?.rental_share_override_pct ?? null;

    const { error: taxSettingsSaveError } = await supabase
      .from("tax_settings")
      .upsert({
        property_id,
        objekttyp: existingTaxSettings?.objekttyp ?? "dauervermietung",
        eigennutzung_tage: supplementalData.eigennutzung_tage ?? existingTaxSettings?.eigennutzung_tage ?? 0,
        gesamt_tage: supplementalData.gesamt_tage ?? existingTaxSettings?.gesamt_tage ?? 365,
        rental_share_override_pct: resolvedRentalShareOverride,
        kleinunternehmer: existingTaxSettings?.kleinunternehmer ?? false,
        option_ust: existingTaxSettings?.option_ust ?? false,
      }, { onConflict: "property_id" });

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
