import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { NkaOverviewRow, NkaPeriod } from "@/types/nka";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("property_id");
  const year = searchParams.get("year");
  const status = searchParams.get("status");

  let query = supabase
    .from("nka_periods")
    .select(`
      *,
      property:properties(id, name, address, wohnflaeche_gesamt_m2, anzahl_einheiten, ist_weg)
    `)
    .eq("user_id", user.id)
    .order("deadline_abrechnung", { ascending: true });

  if (propertyId) query = query.eq("property_id", propertyId);
  if (status) query = query.eq("status", status);
  if (year) {
    query = query.gte("zeitraum_von", `${year}-01-01`).lte("zeitraum_bis", `${year}-12-31`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as NkaOverviewRow[];
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const body = await request.json() as {
    property_id: string;
    zeitraum_von: string;
    zeitraum_bis: string;
  };

  if (!body.property_id || !body.zeitraum_von || !body.zeitraum_bis) {
    return NextResponse.json({ error: "property_id, zeitraum_von und zeitraum_bis sind erforderlich." }, { status: 400 });
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id, user_id")
    .eq("id", body.property_id)
    .eq("user_id", user.id)
    .single();

  if (!property) return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 404 });

  const { data: existingOverlap, error: overlapError } = await supabase
    .from("nka_periods")
    .select("id")
    .eq("property_id", body.property_id)
    .lte("zeitraum_von", body.zeitraum_bis)
    .gte("zeitraum_bis", body.zeitraum_von)
    .limit(1);
  if (overlapError) return NextResponse.json({ error: overlapError.message }, { status: 500 });
  if ((existingOverlap ?? []).length > 0) {
    return NextResponse.json({ error: "Es existiert bereits eine NKA-Periode mit überlappendem Zeitraum." }, { status: 409 });
  }

  const { data: activeTenants, error: tenantError } = await supabase
    .from("tenants")
    .select("id, units!inner(property_id)")
    .lte("lease_start", body.zeitraum_bis)
    .or(`lease_end.is.null,lease_end.gte.${body.zeitraum_von}`);
  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 });
  const hasTenant = (activeTenants ?? []).some((row) => {
    const unit = Array.isArray(row.units) ? row.units[0] : row.units;
    return unit?.property_id === body.property_id;
  });
  if (!hasTenant) {
    return NextResponse.json({ error: "Im gewählten Zeitraum existiert kein aktives Mietverhältnis." }, { status: 400 });
  }

  const { data: gbr } = await supabase
    .from("gbr_settings")
    .select("id")
    .eq("property_id", body.property_id)
    .maybeSingle();

  const insertPayload: Partial<NkaPeriod> = {
    property_id: body.property_id,
    user_id: user.id,
    gbr_settings_id: gbr?.id ?? null,
    zeitraum_von: body.zeitraum_von,
    zeitraum_bis: body.zeitraum_bis,
    status: "offen",
    gesamtkosten_umlagefaehig: 0,
    gesamtkosten_nicht_umlagefaehig: 0,
    leerstandsanteil_tage: 0,
    leerstandsanteil_eur: 0,
    erstellt_von_user_id: user.id,
  };

  const { data, error } = await supabase
    .from("nka_periods")
    .insert(insertPayload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
