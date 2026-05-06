/**
 * /api/nka/periods/[id]
 *
 * GET     → einzelne Periode mit Kostenpositionen
 * PATCH   → Update (period_start/period_end/note/status)
 * DELETE  → Periode löschen (cascade auf cost-items + Snapshot)
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { nkaPeriodUpdateSchema, uuidSchema } from "@/lib/nka/requestSchemas";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

async function loadPeriodAndAssertOwnership(id: string, userId: string) {
  if (!uuidSchema.safeParse(id).success)
    return { error: "id muss eine UUID sein.", status: 400 as const };

  const supabase = await getSupabase();
  const { data: period } = await supabase
    .from("nka_perioden")
    .select(
      "id, property_id, tax_year, period_start, period_end, status, note, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!period)
    return { error: "Periode nicht gefunden.", status: 404 as const };

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", period.property_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!property)
    return { error: "Periode nicht gefunden.", status: 404 as const };

  return { supabase, period };
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const baseClient = await getSupabase();
  const {
    data: { user },
  } = await baseClient.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const guard = await loadPeriodAndAssertOwnership(id, user.id);
  if ("error" in guard)
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { supabase, period } = guard;

  const { data: items } = await supabase
    .from("nka_kostenpositionen")
    .select("*")
    .eq("period_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ ...period, cost_items: items ?? [] });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiges JSON im Request-Body." },
      { status: 400 },
    );
  }
  const validation = nkaPeriodUpdateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Ungültiger Request-Body.", details: validation.error.flatten() },
      { status: 400 },
    );
  }
  const patch = validation.data;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Mindestens ein Feld muss angegeben sein." },
      { status: 400 },
    );
  }

  const baseClient = await getSupabase();
  const {
    data: { user },
  } = await baseClient.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const guard = await loadPeriodAndAssertOwnership(id, user.id);
  if ("error" in guard)
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { supabase } = guard;

  const { data, error } = await supabase
    .from("nka_perioden")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const baseClient = await getSupabase();
  const {
    data: { user },
  } = await baseClient.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const guard = await loadPeriodAndAssertOwnership(id, user.id);
  if ("error" in guard)
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { supabase } = guard;

  const { error } = await supabase.from("nka_perioden").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
