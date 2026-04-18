import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";

function normalizeTaxYear(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
}

export async function GET(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const propertyId = url.searchParams.get("property_id");
  const taxYear = normalizeTaxYear(url.searchParams.get("tax_year"));
  if (!propertyId) return NextResponse.json({ error: "property_id fehlt." }, { status: 400 });

  const db = serviceRoleClient();
  const queryYears = taxYear > 0 ? [0, taxYear] : [0];
  const { data: rows, error } = await db
    .from("tax_settings")
    .select("*")
    .eq("property_id", propertyId)
    .in("tax_year", queryYears)
    .order("tax_year", { ascending: false })
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const data = rows?.[0] ?? null;

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
      tax_year: taxYear,
      objekttyp: "dauervermietung",
      eigennutzung_tage: 0,
      gesamt_tage: 365,
      rental_share_override_pct: null,
      verwaltungspauschale_eur: 240,
      porto_pauschale_eur: 17,
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
  const taxYear = normalizeTaxYear(body.tax_year);

  const db = serviceRoleClient();
  const payload = { ...body, tax_year: taxYear, updated_at: new Date().toISOString() };
  const { error } = await db
    .from("tax_settings")
    .upsert(payload, { onConflict: "property_id,tax_year" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
