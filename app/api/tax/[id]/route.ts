/**
 * GET/PATCH /api/tax/[id]
 * Einzelnen tax_data-Eintrag lesen oder updaten.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { data, error } = await supabase
    .from("tax_data")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const body = await req.json();
  // Remove non-updatable fields
  delete body.id;
  delete body.created_at;

  if (!body.import_source) {
    body.import_source = "manual";
  }

  const { data, error } = await supabase
    .from("tax_data")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { data: taxEntry, error: taxEntryError } = await supabase
    .from("tax_data")
    .select("id, property_id, tax_year")
    .eq("id", id)
    .single();

  if (taxEntryError || !taxEntry) {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  const { data: ownedProperty } = await supabase
    .from("properties")
    .select("id")
    .eq("id", taxEntry.property_id)
    .eq("user_id", user.id)
    .single();

  if (!ownedProperty) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  const taxYear = Number(taxEntry.tax_year);
  const propertyId = taxEntry.property_id as string;

  const [
    { error: taxDeleteError },
    { error: depreciationDeleteError },
    { error: taxSettingsDeleteError },
    { error: maintenanceDeleteError },
  ] = await Promise.all([
    supabase.from("tax_data").delete().eq("id", id),
    supabase.from("tax_depreciation_items").delete().eq("property_id", propertyId).eq("tax_year", taxYear),
    supabase.from("tax_settings").delete().eq("property_id", propertyId).eq("tax_year", taxYear),
    supabase.from("tax_maintenance_distributions").delete().eq("property_id", propertyId).eq("source_year", taxYear),
  ]);

  const firstError = taxDeleteError ?? depreciationDeleteError ?? taxSettingsDeleteError ?? maintenanceDeleteError;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    reset_scope: {
      tax_data: true,
      depreciation_items_for_year: true,
      tax_settings_for_year: true,
      maintenance_plans_started_in_year: true,
    },
  });
}
