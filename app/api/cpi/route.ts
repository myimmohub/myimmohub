/**
 * /api/cpi
 *   GET  → Liste aller CPI-Werte (sortiert nach index_date DESC)
 *   POST → neuer CPI-Wert (manuelle Pflege)
 *
 * Auth: nur authentifizierte User.
 *
 * NOTE: CPI ist global (kein RLS-Filter nach Property/User), aber RLS aktiviert
 * mit Policy "alle authenticated read+write". Pragmatischer Ansatz für die
 * Single-Tenant-Beta. Verschärfung auf Maintainer-Role möglich.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

const cpiCreateSchema = z.object({
  index_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "muss yyyy-mm-dd sein"),
  index_value: z.number().positive("index_value muss > 0 sein"),
  source: z.string().max(50).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export async function GET() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { data, error } = await supabase
    .from("cpi_index_values")
    .select("*")
    .order("index_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ values: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON." }, { status: 400 });
  }

  const parsed = cpiCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültiger Body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("cpi_index_values")
    .insert({
      index_date: parsed.data.index_date,
      index_value: parsed.data.index_value,
      source: parsed.data.source ?? "manual",
      note: parsed.data.note ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
