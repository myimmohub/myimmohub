/**
 * POST /api/tax/calculate
 *
 * Berechnet tax_data-Felder aus Transaktionen und speichert/aktualisiert in tax_data.
 * Body: { property_id: string, tax_year: number }
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { calculateTaxFromTransactions } from "@/lib/tax/calculateTaxFromTransactions";
import { computeStructuredTaxData, isDistributionActiveForYear } from "@/lib/tax/structuredTaxLogic";
import { runRentalTaxEngineFromExistingData } from "@/lib/tax/rentalTaxEngineBridge";
import { buildElsterLineSummary } from "@/lib/tax/elsterLineLogic";
import type { TaxData, TaxDepreciationItem, TaxMaintenanceDistributionItem } from "@/types/tax";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { property_id, tax_year } = (await request.json()) as { property_id: string; tax_year: number };
  if (!property_id || !tax_year) {
    return NextResponse.json({ error: "property_id und tax_year erforderlich." }, { status: 400 });
  }

  // Load property
  const { data: prop } = await supabase
    .from("properties")
    .select("id, name, kaufpreis, gebaeudewert, grundwert, inventarwert, baujahr, afa_satz, kaufdatum, address, type")
    .eq("id", property_id)
    .eq("user_id", user.id)
    .single();

  if (!prop) return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 403 });

  // Load transactions
  const { data: txData } = await supabase
    .from("transactions")
    .select("id, date, amount, category, anlage_v_zeile")
    .eq("property_id", property_id)
    .eq("user_id", user.id);

  // Load categories
  const { data: categories } = await supabase
    .from("categories")
    .select("label, typ, anlage_v, gruppe");

  const [
    { data: gbrSettings },
    { data: taxSettings },
    { data: depreciationItems },
    { data: maintenanceItems },
  ] = await Promise.all([
    supabase.from("gbr_settings").select("*, gbr_partner(*)").eq("property_id", property_id).maybeSingle(),
    supabase
      .from("tax_settings")
      .select("eigennutzung_tage, gesamt_tage, rental_share_override_pct, tax_year")
      .eq("property_id", property_id)
      .in("tax_year", [0, tax_year])
      .order("tax_year", { ascending: false })
      .limit(1),
    supabase.from("tax_depreciation_items").select("*").eq("property_id", property_id).eq("tax_year", tax_year).order("created_at", { ascending: true }),
    supabase.from("tax_maintenance_distributions").select("*").eq("property_id", property_id).order("source_year", { ascending: true }),
  ]);
  const effectiveTaxSettings = taxSettings?.[0] ?? null;
  const excludedTransactionIds = Array.from(new Set(
    (maintenanceItems ?? []).flatMap((item) => Array.isArray(item.source_transaction_ids) ? item.source_transaction_ids : []),
  ));

  const calculated = calculateTaxFromTransactions(
    (txData ?? []) as { id: string; date: string; amount: number; category: string | null; anlage_v_zeile: number | null }[],
    prop as { kaufpreis: number | null; gebaeudewert: number | null; grundwert: number | null; inventarwert: number | null; baujahr: number | null; afa_satz: number | null; kaufdatum: string | null; address: string | null; type: string | null },
    tax_year,
    (categories ?? []) as { label: string; typ: string; anlage_v: string | null; gruppe: string }[],
    excludedTransactionIds,
  );

  // Upsert: nur berechnete Felder setzen, manuelle Werte nicht überschreiben
  const { data: existing } = await supabase
    .from("tax_data")
    .select("*")
    .eq("property_id", property_id)
    .eq("tax_year", tax_year)
    .single();

  // ── Mietanteil berechnen ────────────────────────────────────────────────────
  // Basis für Instandhaltungsverteilungen und AfA-Proration
  const rentalSharePct = effectiveTaxSettings?.rental_share_override_pct != null
    ? effectiveTaxSettings.rental_share_override_pct / 100
    : effectiveTaxSettings?.eigennutzung_tage != null && effectiveTaxSettings?.gesamt_tage != null
      ? Math.max(0, Math.min(1, 1 - effectiveTaxSettings.eigennutzung_tage / effectiveTaxSettings.gesamt_tage))
      : 1.0;

  // ── Hilfsfunktion: Structured Tax Data berechnen & in DB schreiben ──────────
  async function applyStructuredData(baseData: TaxData): Promise<{ finalData: TaxData; reconciliation: ReturnType<typeof buildReconciliation> }> {
    const structured = computeStructuredTaxData({
      taxData: baseData,
      taxYear: tax_year,
      rentalSharePct,
      depreciationItems: (depreciationItems ?? []) as TaxDepreciationItem[],
      maintenanceDistributions: (maintenanceItems ?? []) as TaxMaintenanceDistributionItem[],
    });

    // Nur Felder aus dem strukturierten Ergebnis schreiben, die tatsächlich berechnet wurden
    const structuredPatch: Record<string, unknown> = {};
    if (structured.lineTotals.maintenance_costs != null) {
      structuredPatch.maintenance_costs = structured.lineTotals.maintenance_costs;
    }
    if (structured.lineTotals.depreciation_building != null) {
      structuredPatch.depreciation_building = structured.taxData.depreciation_building;
    }
    if (structured.lineTotals.depreciation_outdoor != null) {
      structuredPatch.depreciation_outdoor = structured.taxData.depreciation_outdoor;
    }
    if (structured.lineTotals.depreciation_fixtures != null) {
      structuredPatch.depreciation_fixtures = structured.taxData.depreciation_fixtures;
    }

    let finalData = structured.taxData;
    if (Object.keys(structuredPatch).length > 0 && baseData.id) {
      const { data: patched } = await supabase
        .from("tax_data")
        .update(structuredPatch)
        .eq("id", baseData.id)
        .select()
        .single();
      if (patched) finalData = patched as TaxData;
    }

    return { finalData, reconciliation: buildReconciliation(structured, finalData) };
  }

  function buildReconciliation(
    structured: ReturnType<typeof computeStructuredTaxData>,
    finalData: TaxData,
  ) {
    const lineSummary = buildElsterLineSummary(finalData, {
      maintenanceDistributions: structured.maintenanceDistributions,
      taxYear: tax_year,
    });
    const inferTargetBlock = (label: string, type: "transaction" | "maintenance_distribution" | "depreciation_item", sourceYear: number | null) => {
      if (type === "depreciation_item") return "depreciation";
      if (type === "maintenance_distribution") return sourceYear != null && sourceYear < tax_year ? `maintenance_${sourceYear}` : `maintenance_${tax_year}`;
      const normalized = label.toLowerCase();
      if (normalized.includes("grundsteuer") || normalized.includes("versicherung")) return "non_allocated_costs";
      if (normalized.includes("hausgeld") || normalized.includes("weg") || normalized.includes("wasser") || normalized.includes("müll")) return "allocated_costs";
      if (normalized.includes("schuldzinsen") || normalized.includes("hausverwaltung") || normalized.includes("kontoführung")) return "financing_admin";
      return "other_expenses";
    };

    const allDists = (maintenanceItems ?? []) as TaxMaintenanceDistributionItem[];
    const items = [
      // Transaktionsbasierte Einnahmen & Ausgaben
      ...Object.entries({
        rent_income:           "Mieteinnahmen",
        operating_costs_income:"Nebenkostenerstattungen",
        other_income:          "Sonstige Einnahmen",
        loan_interest:         "Schuldzinsen (Transaktion)",
        property_tax:          "Grundsteuer (Transaktion)",
        insurance:             "Versicherung (Transaktion)",
        hoa_fees:              "Hausgeld/WEG (Transaktion)",
        water_sewage:          "Wasser/Abwasser (Transaktion)",
        waste_disposal:        "Müllentsorgung (Transaktion)",
        property_management:   "Hausverwaltung (Transaktion)",
        bank_fees:             "Kontoführung (Transaktion)",
        other_expenses:        "Sonstige Werbungskosten (Transaktion)",
      }).filter(([k]) => finalData[k as keyof TaxData] != null && finalData[k as keyof TaxData] !== 0)
        .map(([k, label]) => ({
          type: "transaction" as const,
          label,
          target_block: inferTargetBlock(label, "transaction", null),
          source_year: null as number | null,
          gross_amount: Number(finalData[k as keyof TaxData]),
          deductible_amount: Number(finalData[k as keyof TaxData]),
          included: true,
          exclusion_reason: null as string | null,
        })),
      // Instandhaltungsverteilungen
      ...allDists.map((item) => {
        const active = isDistributionActiveForYear(item, tax_year);
        const computed = structured.maintenanceDistributions.find((d) => d.id === item.id);
        return {
          type: "maintenance_distribution" as const,
          label: item.label,
          target_block: inferTargetBlock(item.label, "maintenance_distribution", item.source_year),
          source_year: item.source_year,
          gross_amount: Number(item.total_amount),
          deductible_amount: computed?.deductible_amount_elster ?? 0,
          included: active,
          exclusion_reason: !active
            ? item.status !== "active"
              ? `Status: ${item.status}`
              : `Nicht aktiv für ${tax_year} (Quelljahr ${item.source_year}, Verteilung ${item.distribution_years} J.)`
            : null,
        };
      }),
      // AfA-Posten
      ...structured.depreciationItems.map((item) => ({
        type: "depreciation_item" as const,
        label: item.label,
        target_block: inferTargetBlock(item.label, "depreciation_item", null),
        source_year: null as number | null,
        gross_amount: Number(item.gross_annual_amount),
        deductible_amount: item.deductible_amount_elster,
        included: true,
        exclusion_reason: null as string | null,
      })),
      // Gebäude-AfA aus Property-Daten (falls keine expliziten AfA-Posten)
      ...(structured.depreciationItems.length === 0 && finalData.depreciation_building
        ? [{
            type: "depreciation_item" as const,
            label: "Gebäude-AfA (automatisch berechnet)",
            target_block: "depreciation",
            source_year: null as number | null,
            gross_amount: Number(finalData.depreciation_building),
            deductible_amount: Number(finalData.depreciation_building),
            included: true,
            exclusion_reason: null as string | null,
          }]
        : []),
    ];

    const einnahmen = lineSummary.income_total;
    const afa = lineSummary.depreciation_total;
    const deductible_without_afa = lineSummary.advertising_costs_total;
    const total_deductible_with_afa = lineSummary.advertising_costs_total + lineSummary.depreciation_total + lineSummary.special_deductions_total;
    const result_before_partner = lineSummary.result;

    return {
      items,
      einnahmen,
      deductible_without_afa,
      total_deductible_with_afa,
      afa,
      result_before_partner,
      expense_buckets: lineSummary.expense_buckets,
      depreciation_buckets: lineSummary.depreciation_buckets,
    };
  }

  if (existing) {
    // Nur Felder updaten die noch null sind oder import_source = 'calculated'
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(calculated)) {
      if (key === "tax_year" || key === "import_source") continue;
      const existingVal = (existing as Record<string, unknown>)[key];
      if (existingVal == null || existing.import_source === "calculated") {
        updates[key] = value;
      }
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("tax_data")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ── Structured Data (Instandhaltungsverteilungen + AfA-Posten) persistieren ─
    const { finalData, reconciliation } = await applyStructuredData(data as TaxData);

    const engine = runRentalTaxEngineFromExistingData({
      property: { id: prop.id, name: prop.name ?? null, address: prop.address ?? null },
      taxData: finalData,
      gbrSettings: gbrSettings ?? null,
      taxSettings: effectiveTaxSettings,
      depreciationItems: depreciationItems ?? [],
      maintenanceDistributions: maintenanceItems ?? [],
      partnerTaxValues: [],
    });
    return NextResponse.json({
      ...finalData,
      _engine: {
        status: engine.status,
        filing_profile: engine.filingRecommendation.filingProfile,
        blocking_errors: engine.blockingErrors.map((item) => item.message),
        review_flags: engine.reviewFlags.map((item) => item.message),
      },
      _reconciliation: reconciliation,
    });
  }

  // Neuen Eintrag erstellen
  const { data, error } = await supabase
    .from("tax_data")
    .insert({ property_id, ...calculated })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Structured Data persistieren ─────────────────────────────────────────────
  const { finalData, reconciliation } = await applyStructuredData(data as TaxData);

  const engine = runRentalTaxEngineFromExistingData({
    property: { id: prop.id, name: prop.name ?? null, address: prop.address ?? null },
    taxData: finalData,
    gbrSettings: gbrSettings ?? null,
    taxSettings: effectiveTaxSettings,
    depreciationItems: depreciationItems ?? [],
    maintenanceDistributions: maintenanceItems ?? [],
    partnerTaxValues: [],
  });
  return NextResponse.json({
    ...finalData,
    _engine: {
      status: engine.status,
      filing_profile: engine.filingRecommendation.filingProfile,
      blocking_errors: engine.blockingErrors.map((item) => item.message),
      review_flags: engine.reviewFlags.map((item) => item.message),
    },
    _reconciliation: reconciliation,
  });
}
