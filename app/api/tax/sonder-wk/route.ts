/**
 * /api/tax/sonder-wk
 *
 * CRUD-Endpoints für Sondereinnahmen / Sonderwerbungskosten je GbR-Beteiligten
 * (Tabelle `gbr_partner_special_expenses`, Migration 20260506).
 *
 * GET  ?property_id=...&tax_year=...  → Liste der Items für (property, year)
 * POST { property_id, gbr_partner_id, tax_year, label, amount, classification, note? }
 *
 * Auth: Anon-Cookie-Client (createServerClient + getUser).
 * Authorization: properties.user_id = auth.uid() — für Read und Write geprüft.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { sonderWkCreateRequestSchema } from "@/lib/tax/requestSchemas";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("property_id");
  const taxYearRaw = searchParams.get("tax_year");

  if (!propertyId || !UUID_REGEX.test(propertyId)) {
    return NextResponse.json({ error: "property_id muss eine UUID sein." }, { status: 400 });
  }
  const taxYear = Number(taxYearRaw);
  if (!Number.isInteger(taxYear) || taxYear < 2010 || taxYear > 2030) {
    return NextResponse.json({ error: "tax_year ungültig." }, { status: 400 });
  }

  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  // Property-Ownership prüfen.
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!property) {
    return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("gbr_partner_special_expenses")
    .select("id, property_id, gbr_partner_id, tax_year, label, amount, classification, note, created_at, updated_at")
    .eq("property_id", propertyId)
    .eq("tax_year", taxYear)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON im Request-Body." }, { status: 400 });
  }

  const validation = sonderWkCreateRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Ungültiger Request-Body.", details: validation.error.flatten() },
      { status: 400 },
    );
  }
  const { property_id, gbr_partner_id, tax_year, label, amount, classification, note } = validation.data;

  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  // Ownership: property gehört dem User?
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", property_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!property) {
    return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 404 });
  }

  // Partner gehört zu dieser Property?
  const { data: partner } = await supabase
    .from("gbr_partner")
    .select("id, gbr_settings_id, gbr_settings:gbr_settings_id ( property_id )")
    .eq("id", gbr_partner_id)
    .maybeSingle();
  const partnerSettings = (partner?.gbr_settings ?? null) as { property_id?: string } | { property_id?: string }[] | null;
  const partnerPropertyId = Array.isArray(partnerSettings) ? partnerSettings[0]?.property_id : partnerSettings?.property_id;
  if (!partner || partnerPropertyId !== property_id) {
    return NextResponse.json({ error: "Partner gehört nicht zu dieser Immobilie." }, { status: 400 });
  }

  // Vorzeichen normalisieren: special_income ≥ 0, special_expense_* ≤ 0.
  const normalizedAmount = classification === "special_income"
    ? Math.abs(amount)
    : -Math.abs(amount);

  const { data, error } = await supabase
    .from("gbr_partner_special_expenses")
    .insert({
      property_id,
      gbr_partner_id,
      tax_year,
      label: label.trim(),
      amount: normalizedAmount,
      classification,
      note: note ?? null,
    })
    .select()
    .single();

  if (error) {
    // Unique-Constraint (property+partner+year+label) → 409.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Eintrag mit diesem Label existiert bereits für diesen Beteiligten und Jahr." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
