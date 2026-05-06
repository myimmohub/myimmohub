/**
 * /api/tax/sonder-wk/[id]
 *
 * PATCH  → Update label/amount/classification/note
 * DELETE → Eintrag löschen
 *
 * Auth via Cookie-Client; Authorization: properties.user_id = auth.uid().
 * Wir laden das Item zunächst, prüfen die Property-Ownership separat und
 * führen erst dann die Mutation aus (defense in depth zusätzlich zur RLS).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { sonderWkUpdateRequestSchema } from "@/lib/tax/requestSchemas";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

type SonderWkRow = {
  id: string;
  property_id: string;
  classification: "special_income" | "special_expense_interest" | "special_expense_other";
};

async function loadItemAndAssertOwnership(id: string, userId: string) {
  if (!UUID_REGEX.test(id)) return { error: "id muss eine UUID sein.", status: 400 as const };
  const supabase = await getSupabase();

  const { data: item } = await supabase
    .from("gbr_partner_special_expenses")
    .select("id, property_id, classification")
    .eq("id", id)
    .maybeSingle();

  if (!item) return { error: "Eintrag nicht gefunden.", status: 404 as const };

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", item.property_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!property) return { error: "Eintrag nicht gefunden.", status: 404 as const };

  return { supabase, item: item as SonderWkRow };
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON im Request-Body." }, { status: 400 });
  }

  const validation = sonderWkUpdateRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Ungültiger Request-Body.", details: validation.error.flatten() },
      { status: 400 },
    );
  }
  const patch = validation.data;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Mindestens ein Feld muss angegeben sein." }, { status: 400 });
  }

  const baseClient = await getSupabase();
  const { data: { user } } = await baseClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const guard = await loadItemAndAssertOwnership(id, user.id);
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { supabase, item } = guard;

  // Vorzeichen für amount im Zusammenspiel mit (ggf. neuer) Klassifikation normalisieren.
  const updates: Record<string, unknown> = {};
  if (patch.label !== undefined) updates.label = patch.label.trim();
  if (patch.classification !== undefined) updates.classification = patch.classification;
  if (patch.note !== undefined) updates.note = patch.note;
  if (patch.amount !== undefined) {
    const cls = patch.classification ?? item.classification;
    updates.amount = cls === "special_income" ? Math.abs(patch.amount) : -Math.abs(patch.amount);
  } else if (patch.classification !== undefined && patch.classification !== item.classification) {
    // Wenn nur die Klassifikation kippt, soll das Vorzeichen nachgezogen werden.
    // Dafür holen wir den aktuellen Betrag und normalisieren ihn entsprechend.
    const { data: current } = await supabase
      .from("gbr_partner_special_expenses")
      .select("amount")
      .eq("id", id)
      .maybeSingle();
    if (current && typeof current.amount === "number") {
      updates.amount = patch.classification === "special_income"
        ? Math.abs(current.amount)
        : -Math.abs(current.amount);
    }
  }

  const { data, error } = await supabase
    .from("gbr_partner_special_expenses")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Eintrag mit diesem Label existiert bereits für diesen Beteiligten und Jahr." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const baseClient = await getSupabase();
  const { data: { user } } = await baseClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const guard = await loadItemAndAssertOwnership(id, user.id);
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { supabase } = guard;

  const { error } = await supabase
    .from("gbr_partner_special_expenses")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
