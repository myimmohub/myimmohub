/**
 * /api/nka/periods/[id]/cost-items
 *
 * GET   → alle Kostenpositionen einer Periode
 * POST  → neue Position anlegen
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { nkaCostItemCreateSchema, uuidSchema } from "@/lib/nka/requestSchemas";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

async function ensurePeriodOwnership(periodId: string, userId: string) {
  if (!uuidSchema.safeParse(periodId).success)
    return { error: "Periode-ID muss eine UUID sein.", status: 400 as const };
  const supabase = await getSupabase();
  const { data: period } = await supabase
    .from("nka_perioden")
    .select("id, property_id")
    .eq("id", periodId)
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

  const guard = await ensurePeriodOwnership(id, user.id);
  if ("error" in guard)
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { supabase } = guard;

  const { data, error } = await supabase
    .from("nka_kostenpositionen")
    .select("*")
    .eq("period_id", id)
    .order("created_at", { ascending: true });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
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
  const validation = nkaCostItemCreateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Ungültiger Request-Body.", details: validation.error.flatten() },
      { status: 400 },
    );
  }

  const baseClient = await getSupabase();
  const {
    data: { user },
  } = await baseClient.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const guard = await ensurePeriodOwnership(id, user.id);
  if ("error" in guard)
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { supabase } = guard;

  const v = validation.data;
  const { data, error } = await supabase
    .from("nka_kostenpositionen")
    .insert({
      period_id: id,
      position: v.position,
      label: v.label ?? null,
      brutto_cents: v.brutto_cents,
      umlagefaehig_pct: v.umlagefaehig_pct,
      verteilungsschluessel: v.verteilungsschluessel,
      direct_shares: v.direct_shares ?? null,
      consumption: v.consumption ?? null,
      heizkosten_verbrauchsanteil_pct: v.heizkosten_verbrauchsanteil_pct ?? null,
      transaction_id: v.transaction_id ?? null,
      document_id: v.document_id ?? null,
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
