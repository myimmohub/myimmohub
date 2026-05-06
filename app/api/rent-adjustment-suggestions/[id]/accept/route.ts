/**
 * POST /api/rent-adjustment-suggestions/[id]/accept
 *
 * Akzeptiert einen Vorschlag:
 *   1. Erstellt rent_adjustments-Zeile (adjustment_type='index', index_value=current_index)
 *   2. Setzt suggestion.status='accepted', .decided_at=now, .decided_by=user.id,
 *      .resulting_adjustment_id=neueAdjustmentId.
 *   3. Optional: tenants.cold_rent_cents/additional_costs_cents Update wenn
 *      effective_date <= heute.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

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

type SuggestionRow = {
  id: string;
  tenant_id: string;
  property_id: string;
  effective_date: string;
  proposed_cold_rent_cents: number;
  current_index: number;
  status: string;
};

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "id muss eine UUID sein." }, { status: 400 });
  }

  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { data: suggestion } = await supabase
    .from("rent_adjustment_suggestions")
    .select(
      "id, tenant_id, property_id, effective_date, proposed_cold_rent_cents, current_index, status",
    )
    .eq("id", id)
    .maybeSingle<SuggestionRow>();

  if (!suggestion) {
    return NextResponse.json({ error: "Vorschlag nicht gefunden." }, { status: 404 });
  }
  if (suggestion.status !== "pending") {
    return NextResponse.json(
      { error: `Vorschlag ist bereits in Status '${suggestion.status}'.` },
      { status: 409 },
    );
  }

  // 1. Adjustment erzeugen.
  const { data: adjustment, error: adjErr } = await supabase
    .from("rent_adjustments")
    .insert({
      tenant_id: suggestion.tenant_id,
      effective_date: suggestion.effective_date,
      cold_rent_cents: suggestion.proposed_cold_rent_cents,
      additional_costs_cents: 0,
      adjustment_type: "index",
      index_value: suggestion.current_index,
      note: "Indexmiete-Anpassung (auto, accepted suggestion).",
    })
    .select("id")
    .single<{ id: string }>();

  if (adjErr || !adjustment) {
    return NextResponse.json(
      { error: adjErr?.message ?? "Adjustment konnte nicht erzeugt werden." },
      { status: 500 },
    );
  }

  // 2. Suggestion-Update.
  const { error: updErr } = await supabase
    .from("rent_adjustment_suggestions")
    .update({
      status: "accepted",
      decided_at: new Date().toISOString(),
      decided_by: user.id,
      resulting_adjustment_id: adjustment.id,
    })
    .eq("id", id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // 3. Optional Tenant-Stamm aktualisieren.
  const today = new Date().toISOString().slice(0, 10);
  if (suggestion.effective_date <= today) {
    await supabase
      .from("tenants")
      .update({ cold_rent_cents: suggestion.proposed_cold_rent_cents })
      .eq("id", suggestion.tenant_id);
  }

  return NextResponse.json({
    ok: true,
    adjustment_id: adjustment.id,
    suggestion_id: id,
  });
}
