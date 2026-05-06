/**
 * /api/nka/periods
 *
 * GET  ?property_id=...   → Liste der NKA-Perioden für die Property
 * POST { property_id, tax_year, period_start, period_end, note? }
 *
 * Auth: Cookie-Client; Authorization: properties.user_id = auth.uid().
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { nkaPeriodCreateSchema, uuidSchema } from "@/lib/nka/requestSchemas";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

export async function GET(request: Request) {
  const propertyId = new URL(request.url).searchParams.get("property_id");
  const propertyIdParse = uuidSchema.safeParse(propertyId);
  if (!propertyIdParse.success) {
    return NextResponse.json(
      { error: "property_id muss eine UUID sein." },
      { status: 400 },
    );
  }

  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyIdParse.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!property)
    return NextResponse.json(
      { error: "Immobilie nicht gefunden." },
      { status: 404 },
    );

  const { data, error } = await supabase
    .from("nka_perioden")
    .select(
      "id, property_id, tax_year, period_start, period_end, status, note, created_at, updated_at",
    )
    .eq("property_id", propertyIdParse.data)
    .order("tax_year", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiges JSON im Request-Body." },
      { status: 400 },
    );
  }

  const validation = nkaPeriodCreateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Ungültiger Request-Body.", details: validation.error.flatten() },
      { status: 400 },
    );
  }
  const { property_id, tax_year, period_start, period_end, note } = validation.data;

  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", property_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!property)
    return NextResponse.json(
      { error: "Immobilie nicht gefunden." },
      { status: 404 },
    );

  const { data, error } = await supabase
    .from("nka_perioden")
    .insert({
      property_id,
      tax_year,
      period_start,
      period_end,
      note: note ?? null,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Für dieses Jahr existiert bereits eine NKA-Periode." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
