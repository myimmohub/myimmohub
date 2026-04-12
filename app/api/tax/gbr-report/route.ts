import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { buildGbrTaxReport, type GbrSettingsSummary, type TaxSettingsSummary } from "@/lib/tax/gbrTaxReport";
import { isDistributionActiveForYear } from "@/lib/tax/structuredTaxLogic";
import type { TaxData } from "@/types/tax";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("property_id");
  const taxYear = Number(searchParams.get("tax_year"));

  if (!propertyId || !taxYear) {
    return NextResponse.json({ error: "property_id und tax_year erforderlich." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const [
    { data: property, error: propertyError },
    { data: taxData, error: taxError },
    { data: gbrSettings, error: gbrError },
    { data: taxSettingsRows, error: taxSettingsError },
    { data: depreciationItems, error: depreciationError },
    { data: maintenanceItems, error: maintenanceError },
  ] = await Promise.all([
    supabase.from("properties").select("id, name, address").eq("id", propertyId).eq("user_id", user.id).single(),
    supabase.from("tax_data").select("*").eq("property_id", propertyId).eq("tax_year", taxYear).single(),
    supabase.from("gbr_settings").select("*, gbr_partner(*)").eq("property_id", propertyId).maybeSingle(),
    supabase
      .from("tax_settings")
      .select("eigennutzung_tage, gesamt_tage, rental_share_override_pct, tax_year")
      .eq("property_id", propertyId)
      .in("tax_year", [0, taxYear])
      .order("tax_year", { ascending: false })
      .limit(1),
    supabase.from("tax_depreciation_items").select("*").eq("property_id", propertyId).eq("tax_year", taxYear).order("created_at", { ascending: true }),
    supabase.from("tax_maintenance_distributions").select("*").eq("property_id", propertyId).order("source_year", { ascending: true }),
  ]);

  if (propertyError || !property) {
    return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 404 });
  }
  if (taxError || !taxData) {
    return NextResponse.json({ error: "Für dieses Steuerjahr liegen keine Anlage-V-Daten vor." }, { status: 404 });
  }
  if (gbrError) {
    return NextResponse.json({ error: gbrError.message }, { status: 500 });
  }
  if (taxSettingsError) {
    return NextResponse.json({ error: taxSettingsError.message }, { status: 500 });
  }
  if (depreciationError) {
    return NextResponse.json({ error: depreciationError.message }, { status: 500 });
  }
  if (maintenanceError) {
    return NextResponse.json({ error: maintenanceError.message }, { status: 500 });
  }

  const partnerIds = ((gbrSettings?.gbr_partner ?? []) as { id: string }[]).map((partner) => partner.id);
  const { data: partnerTaxValues, error: partnerTaxError } = partnerIds.length > 0
    ? await supabase
        .from("gbr_partner_tax_data")
        .select("gbr_partner_id, special_expenses, note")
        .eq("tax_year", taxYear)
        .in("gbr_partner_id", partnerIds)
    : { data: [], error: null };

  if (partnerTaxError) {
    return NextResponse.json({ error: partnerTaxError.message }, { status: 500 });
  }

  const report = buildGbrTaxReport({
    property,
    taxData: taxData as TaxData,
    gbrSettings: (gbrSettings as GbrSettingsSummary | null) ?? null,
    partnerTaxValues: partnerTaxValues ?? [],
    taxSettings: (taxSettingsRows?.[0] as TaxSettingsSummary | null) ?? null,
    depreciationItems: depreciationItems ?? [],
    maintenanceDistributions: (maintenanceItems ?? []).filter((item) => isDistributionActiveForYear(item, taxYear)),
  });

  return NextResponse.json(report);
}
