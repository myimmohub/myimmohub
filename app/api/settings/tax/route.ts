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

  return NextResponse.json(data ?? {
    property_id: propertyId,
    objekttyp: "dauervermietung",
    eigennutzung_tage: 0,
    gesamt_tage: 365,
    kleinunternehmer: false,
    option_ust: false,
    ak_gebaeude: null,
    baujahr: null,
    afa_satz: "2",
  });
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
