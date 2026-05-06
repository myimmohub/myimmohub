/**
 * /api/nka/periods/[id]/cost-items/[itemId]
 *
 * PATCH  → Felder einer Kostenposition aktualisieren
 * DELETE → Position löschen
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { nkaCostItemUpdateSchema, uuidSchema } from "@/lib/nka/requestSchemas";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

async function ensureCostItemOwnership(
  periodId: string,
  itemId: string,
  userId: string,
) {
  if (!uuidSchema.safeParse(periodId).success)
    return { error: "Periode-ID muss eine UUID sein.", status: 400 as const };
  if (!uuidSchema.safeParse(itemId).success)
    return { error: "Item-ID muss eine UUID sein.", status: 400 as const };

  const supabase = await getSupabase();

  const { data: item } = await supabase
    .from("nka_kostenpositionen")
    .select("id, period_id")
    .eq("id", itemId)
    .eq("period_id", periodId)
    .maybeSingle();
  if (!item)
    return { error: "Position nicht gefunden.", status: 404 as const };

  const { data: period } = await supabase
    .from("nka_perioden")
    .select("id, property_id")
    .eq("id", periodId)
    .maybeSingle();
  if (!period)
    return { error: "Position nicht gefunden.", status: 404 as const };

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", period.property_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!property)
    return { error: "Position nicht gefunden.", status: 404 as const };

  return { supabase, item };
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiges JSON im Request-Body." },
      { status: 400 },
    );
  }
  const validation = nkaCostItemUpdateSchema.safeParse(body);
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

  const guard = await ensureCostItemOwnership(id, itemId, user.id);
  if ("error" in guard)
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { supabase } = guard;

  const { data, error } = await supabase
    .from("nka_kostenpositionen")
    .update(patch)
    .eq("id", itemId)
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await ctx.params;

  const baseClient = await getSupabase();
  const {
    data: { user },
  } = await baseClient.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const guard = await ensureCostItemOwnership(id, itemId, user.id);
  if ("error" in guard)
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { supabase } = guard;

  const { error } = await supabase
    .from("nka_kostenpositionen")
    .delete()
    .eq("id", itemId);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
