import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";

export async function GET(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const propertyId = url.searchParams.get("property_id");
  if (!propertyId) return NextResponse.json({ error: "property_id fehlt." }, { status: 400 });

  const db = serviceRoleClient();
  const { data, error } = await db
    .from("tax_settings")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If no tax_settings exist yet, prefill from property data
  if (!data) {
    const { data: prop } = await db
      .from("properties")
      .select("gebaeudewert, kaufpreis, baujahr, afa_satz")
      .eq("id", propertyId)
      .single();

    const akGebaeude = prop?.gebaeudewert ?? prop?.kaufpreis ?? null;
    const baujahr = prop?.baujahr ?? null;
    // Determine AfA rate from property or by Baujahr
    let afaSatz = "2";
    if (prop?.afa_satz != null) {
      // afa_satz is stored as decimal (e.g. 0.02) in properties
      const pct = prop.afa_satz * 100;
      if (pct === 3) afaSatz = "3";
      else if (pct === 2.5) afaSatz = "2.5";
      else afaSatz = "2";
    } else if (baujahr) {
      if (baujahr < 1925) afaSatz = "2.5";
      else if (baujahr >= 2023) afaSatz = "3";
    }

    return NextResponse.json({
      property_id: propertyId,
      objekttyp: "dauervermietung",
      eigennutzung_tage: 0,
      gesamt_tage: 365,
      rental_share_override_pct: null,
      kleinunternehmer: false,
      option_ust: false,
      ak_gebaeude: akGebaeude,
      baujahr,
      afa_satz: afaSatz,
    });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  if (!body.property_id) return NextResponse.json({ error: "property_id fehlt." }, { status: 400 });

  const db = serviceRoleClient();
  const { error } = await db
    .from("tax_settings")
    .upsert({ ...body, updated_at: new Date().toISOString() }, { onConflict: "property_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
