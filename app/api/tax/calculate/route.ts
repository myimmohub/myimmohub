/**
 * POST /api/tax/calculate
 *
 * Berechnet tax_data-Felder aus Transaktionen und speichert/aktualisiert in tax_data.
 * Body: { property_id: string, tax_year: number }
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { calculateTaxFromTransactions } from "@/lib/tax/calculateTaxFromTransactions";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { property_id, tax_year } = (await request.json()) as { property_id: string; tax_year: number };
  if (!property_id || !tax_year) {
    return NextResponse.json({ error: "property_id und tax_year erforderlich." }, { status: 400 });
  }

  // Load property
  const { data: prop } = await supabase
    .from("properties")
    .select("id, kaufpreis, gebaeudewert, baujahr, afa_satz, kaufdatum, address, type")
    .eq("id", property_id)
    .eq("user_id", user.id)
    .single();

  if (!prop) return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 403 });

  // Load transactions
  const { data: txData } = await supabase
    .from("transactions")
    .select("date, amount, category, anlage_v_zeile")
    .eq("property_id", property_id)
    .eq("user_id", user.id);

  // Load categories
  const { data: categories } = await supabase
    .from("categories")
    .select("label, typ, anlage_v, gruppe");

  const calculated = calculateTaxFromTransactions(
    (txData ?? []) as { date: string; amount: number; category: string | null; anlage_v_zeile: number | null }[],
    prop as { kaufpreis: number | null; gebaeudewert: number | null; baujahr: number | null; afa_satz: number | null; kaufdatum: string | null; address: string | null; type: string | null },
    tax_year,
    (categories ?? []) as { label: string; typ: string; anlage_v: string | null; gruppe: string }[],
  );

  // Upsert: nur berechnete Felder setzen, manuelle Werte nicht überschreiben
  const { data: existing } = await supabase
    .from("tax_data")
    .select("*")
    .eq("property_id", property_id)
    .eq("tax_year", tax_year)
    .single();

  if (existing) {
    // Nur Felder updaten die noch null sind oder import_source = 'calculated'
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(calculated)) {
      if (key === "tax_year" || key === "import_source") continue;
      const existingVal = (existing as Record<string, unknown>)[key];
      if (existingVal == null || existing.import_source === "calculated") {
        updates[key] = value;
      }
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("tax_data")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Neuen Eintrag erstellen
  const { data, error } = await supabase
    .from("tax_data")
    .insert({ property_id, ...calculated })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
