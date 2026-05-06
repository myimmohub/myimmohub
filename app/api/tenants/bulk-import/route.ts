/**
 * POST /api/tenants/bulk-import
 *   Body: { property_id: string, csv: string, dry_run?: boolean }
 *
 * Importiert mehrere Mieter aus CSV. Bei `dry_run=true` wird nur eine
 * Vorschau (ok / errors / unresolved unit_labels) zurückgegeben, ohne
 * Persistierung.
 *
 * Owner-Check über properties.user_id = auth.uid().
 * Mappt `unit_label` auf `unit_id` über die Einheiten der Property.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { parseTenantsCsv } from "@/lib/tenants/csvImport";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function makeSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

type BulkImportBody = {
  property_id: string;
  csv: string;
  dry_run?: boolean;
};

export async function POST(request: Request) {
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  let body: BulkImportBody;
  try {
    body = (await request.json()) as BulkImportBody;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  if (!body.property_id || !body.csv) {
    return NextResponse.json(
      { error: "property_id und csv sind erforderlich." },
      { status: 400 },
    );
  }

  // Ownership-Check
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", body.property_id)
    .eq("user_id", user.id)
    .single();
  if (!property) {
    return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 404 });
  }

  // Einheiten der Property laden, um unit_label → unit_id aufzulösen
  const { data: units, error: unitsErr } = await supabase
    .from("units")
    .select("id, label")
    .eq("property_id", body.property_id);
  if (unitsErr) {
    return NextResponse.json({ error: unitsErr.message }, { status: 500 });
  }
  const labelToId = new Map<string, string>();
  for (const u of units ?? []) {
    const row = u as { id: string; label: string };
    labelToId.set(row.label.toLowerCase(), row.id);
  }

  const parsed = parseTenantsCsv(body.csv);

  // Resolve unit_label → unit_id
  const resolved: Array<{
    unit_id: string;
    last_name: string;
    first_name: string;
    email: string | null;
    phone: string | null;
    lease_start: string;
    lease_end: string | null;
    cold_rent_cents: number;
    additional_costs_cents: number | null;
    deposit_cents: number | null;
    rent_type: "fixed" | "index" | "stepped";
    status: "active";
  }> = [];
  const unresolved: Array<{ unit_label: string; row: typeof parsed.ok[number] }> = [];

  for (const row of parsed.ok) {
    const uid = labelToId.get(row.unit_label.toLowerCase());
    if (!uid) {
      unresolved.push({ unit_label: row.unit_label, row });
      continue;
    }
    resolved.push({
      unit_id: uid,
      last_name: row.last_name,
      first_name: row.first_name,
      email: row.email,
      phone: row.phone,
      lease_start: row.lease_start,
      lease_end: row.lease_end,
      cold_rent_cents: row.cold_rent_cents,
      additional_costs_cents: row.additional_costs_cents,
      deposit_cents: row.deposit_cents,
      rent_type: row.rent_type,
      status: "active",
    });
  }

  if (body.dry_run) {
    return NextResponse.json({
      preview: true,
      ok_count: resolved.length,
      error_count: parsed.errors.length,
      unresolved_count: unresolved.length,
      ok: resolved,
      errors: parsed.errors,
      unresolved,
    });
  }

  if (resolved.length === 0) {
    return NextResponse.json({
      inserted: 0,
      errors: parsed.errors,
      unresolved,
    });
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("tenants")
    .insert(resolved)
    .select();
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    inserted: (inserted ?? []).length,
    errors: parsed.errors,
    unresolved,
  });
}
