import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";

async function assertPropertyOwnership(propertyId: string, userId: string) {
  const db = serviceRoleClient();
  const { data } = await db
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
}

export async function GET(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const propertyId = url.searchParams.get("property_id");
  const taxYear = Number(url.searchParams.get("tax_year"));

  if (!propertyId || !taxYear) {
    return NextResponse.json({ error: "property_id und tax_year sind erforderlich." }, { status: 400 });
  }

  if (!(await assertPropertyOwnership(propertyId, user.id))) {
    return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 404 });
  }

  const db = serviceRoleClient();
  const { data: gbrSettingsRows, error: gbrSettingsError } = await db
    .from("gbr_settings")
    .select("id")
    .eq("property_id", propertyId);

  if (gbrSettingsError) return NextResponse.json({ error: gbrSettingsError.message }, { status: 500 });

  const gbrSettingsIds = (gbrSettingsRows ?? []).map((row) => row.id);
  if (gbrSettingsIds.length === 0) return NextResponse.json([]);

  const { data: partnerRows, error: partnerError } = await db
    .from("gbr_partner")
    .select("id")
    .in("gbr_settings_id", gbrSettingsIds);

  if (partnerError) return NextResponse.json({ error: partnerError.message }, { status: 500 });

  const partnerIds = (partnerRows ?? []).map((row) => row.id);
  if (partnerIds.length === 0) return NextResponse.json([]);

  const { data, error } = await db
    .from("gbr_partner_tax_data")
    .select("id, gbr_partner_id, tax_year, special_expenses, note")
    .eq("tax_year", taxYear)
    .in("gbr_partner_id", partnerIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json()) as {
    property_id: string;
    gbr_partner_id: string;
    tax_year: number;
    special_expenses?: number;
    note?: string | null;
  };

  if (!body.property_id || !body.gbr_partner_id || !body.tax_year) {
    return NextResponse.json({ error: "property_id, gbr_partner_id und tax_year sind erforderlich." }, { status: 400 });
  }

  if (!(await assertPropertyOwnership(body.property_id, user.id))) {
    return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 404 });
  }

  const db = serviceRoleClient();
  const { data: partner } = await db
    .from("gbr_partner")
    .select("id, gbr_settings_id")
    .eq("id", body.gbr_partner_id)
    .maybeSingle();

  if (!partner) {
    return NextResponse.json({ error: "Partner nicht gefunden." }, { status: 404 });
  }

  const { data: gbr } = await db
    .from("gbr_settings")
    .select("id, property_id")
    .eq("id", partner.gbr_settings_id)
    .maybeSingle();

  if (!gbr || gbr.property_id !== body.property_id) {
    return NextResponse.json({ error: "Partner gehört nicht zu dieser Immobilie." }, { status: 400 });
  }

  const { data, error } = await db
    .from("gbr_partner_tax_data")
    .upsert({
      gbr_partner_id: body.gbr_partner_id,
      tax_year: body.tax_year,
      special_expenses: body.special_expenses ?? 0,
      note: body.note ?? null,
    }, { onConflict: "gbr_partner_id,tax_year" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
