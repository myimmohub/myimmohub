/**
 * GET  /api/rent-adjustments?tenant_id=...
 *   → Returns all adjustments for a tenant, sorted by effective_date desc
 * POST /api/rent-adjustments
 *   Body: { tenant_id, effective_date, cold_rent_cents, additional_costs_cents, adjustment_type?, index_value?, note? }
 *   → Creates adjustment record + updates tenant's current rent if effective_date <= today
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function makeSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

export async function GET(request: Request) {
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const tenant_id = new URL(request.url).searchParams.get("tenant_id");
  if (!tenant_id) return NextResponse.json({ error: "tenant_id fehlt" }, { status: 400 });

  const { data, error } = await supabase
    .from("rent_adjustments")
    .select("*")
    .eq("tenant_id", tenant_id)
    .order("effective_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const body = await request.json() as {
    tenant_id: string;
    effective_date: string;
    cold_rent_cents: number;
    additional_costs_cents?: number;
    adjustment_type?: string;
    index_value?: number;
    note?: string;
  };

  const { tenant_id, effective_date, cold_rent_cents, additional_costs_cents, adjustment_type, index_value, note } = body;
  if (!tenant_id || !effective_date || cold_rent_cents == null) {
    return NextResponse.json({ error: "tenant_id, effective_date und cold_rent_cents erforderlich" }, { status: 400 });
  }

  // Verify tenant belongs to this user (RLS will enforce, but be explicit)
  const { data: tenant } = await supabase.from("tenants").select("id").eq("id", tenant_id).maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Mieter nicht gefunden" }, { status: 404 });

  const { data: adjustment, error: adjError } = await supabase
    .from("rent_adjustments")
    .insert({
      tenant_id,
      effective_date,
      cold_rent_cents: Math.round(cold_rent_cents),
      additional_costs_cents: Math.round(additional_costs_cents ?? 0),
      adjustment_type: adjustment_type ?? "manual",
      index_value: index_value ?? null,
      note: note ?? null,
    })
    .select()
    .single();

  if (adjError) return NextResponse.json({ error: adjError.message }, { status: 500 });

  // Update tenant's current rent if effective_date <= today
  const today = new Date().toISOString().slice(0, 10);
  if (effective_date <= today) {
    await supabase
      .from("tenants")
      .update({
        cold_rent_cents: Math.round(cold_rent_cents),
        additional_costs_cents: Math.round(additional_costs_cents ?? 0),
      })
      .eq("id", tenant_id);
  }

  return NextResponse.json(adjustment, { status: 201 });
}
