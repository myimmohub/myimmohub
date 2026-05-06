/**
 * GET /api/rent-adjustment-suggestions
 *   Query: status?, property_id?
 *   → Liste der Vorschläge des Users (RLS-gefiltert über property_id).
 *
 * POST: nicht öffentlich (Suggestions werden durch den Cron erzeugt).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

export async function GET(request: Request) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const propertyId = searchParams.get("property_id");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("rent_adjustment_suggestions")
    .select("*")
    .order("generated_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (propertyId) query = query.eq("property_id", propertyId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ suggestions: data ?? [] });
}

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Suggestions werden durch den Cron-Job /api/cron/index-rent-suggestions erzeugt — manuelle Erstellung nicht zugelassen.",
    },
    { status: 405 },
  );
}
