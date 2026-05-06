/**
 * /api/cpi/[id]
 *   PATCH  → einzelnen CPI-Wert ändern
 *   DELETE → einzelnen CPI-Wert entfernen
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";

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

const cpiUpdateSchema = z.object({
  index_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  index_value: z.number().positive().optional(),
  source: z.string().max(50).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "id muss eine UUID sein." }, { status: 400 });
  }

  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON." }, { status: 400 });
  }

  const parsed = cpiUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültiger Body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("cpi_index_values")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
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

  const { error } = await supabase.from("cpi_index_values").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
