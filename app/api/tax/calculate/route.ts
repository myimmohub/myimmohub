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
import { runRentalTaxEngineFromExistingData } from "@/lib/tax/rentalTaxEngineBridge";
import type { TaxData } from "@/types/tax";

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
    const engine = runRentalTaxEngineFromExistingData({
      property: { id: prop.id, name: prop.name ?? null, address: prop.address ?? null },
      taxData: data as TaxData,
      gbrSettings: gbrSettings ?? null,
      taxSettings: effectiveTaxSettings,
      depreciationItems: depreciationItems ?? [],
      maintenanceDistributions: maintenanceItems ?? [],
      partnerTaxValues: [],
    });
    return NextResponse.json({
      ...data,
      _engine: {
        status: engine.status,
        filing_profile: engine.filingRecommendation.filingProfile,
        blocking_errors: engine.blockingErrors.map((item) => item.message),
        review_flags: engine.reviewFlags.map((item) => item.message),
      },
    });
  }

  // Neuen Eintrag erstellen
  const { data, error } = await supabase
    .from("tax_data")
    .insert({ property_id, ...calculated })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const engine = runRentalTaxEngineFromExistingData({
    property: { id: prop.id, name: prop.name ?? null, address: prop.address ?? null },
    taxData: data as TaxData,
    gbrSettings: gbrSettings ?? null,
    taxSettings: effectiveTaxSettings,
    depreciationItems: depreciationItems ?? [],
    maintenanceDistributions: maintenanceItems ?? [],
    partnerTaxValues: [],
  });
  return NextResponse.json({
    ...data,
    _engine: {
      status: engine.status,
      filing_profile: engine.filingRecommendation.filingProfile,
      blocking_errors: engine.blockingErrors.map((item) => item.message),
      review_flags: engine.reviewFlags.map((item) => item.message),
    },
  });
}
