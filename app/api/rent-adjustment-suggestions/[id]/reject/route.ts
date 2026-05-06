/**
 * POST /api/rent-adjustment-suggestions/[id]/reject
 *
 * Setzt suggestion.status = 'rejected', .decided_at, .decided_by.
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
    .select("id, status")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string }>();
  if (!suggestion) {
    return NextResponse.json({ error: "Vorschlag nicht gefunden." }, { status: 404 });
  }
  if (suggestion.status !== "pending") {
    return NextResponse.json(
      { error: `Vorschlag ist bereits in Status '${suggestion.status}'.` },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("rent_adjustment_suggestions")
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
