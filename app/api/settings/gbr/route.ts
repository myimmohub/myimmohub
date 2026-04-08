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
    .from("gbr_settings")
    .select("*, gbr_partner(*)")
    .eq("property_id", propertyId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? {
    property_id: propertyId,
    name: "",
    steuernummer: "",
    finanzamt: "",
    veranlagungszeitraum: new Date().getFullYear(),
    sonder_werbungskosten: false,
    feststellungserklaerung: false,
    teilweise_eigennutzung: false,
    gbr_partner: [],
  });
}

export async function POST(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  if (!body.property_id) return NextResponse.json({ error: "property_id fehlt." }, { status: 400 });

  // Remove partner data from upsert
  const { gbr_partner: _, ...settings } = body;

  const db = serviceRoleClient();
  const { data, error } = await db
    .from("gbr_settings")
    .upsert(settings, { onConflict: "property_id" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
