/**
 * GET /api/nka/periods/[id]/suggest
 *
 * Lädt für die Periode passende Banking-Transaktionen und ruft
 * `suggestNkaCostItems` (pure). Liefert `AutoSuggestOutput`.
 *
 * Auth: Cookie-Client. Ownership über properties.user_id.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { uuidSchema } from "@/lib/nka/requestSchemas";
import {
  suggestNkaCostItems,
  type AutoSuggestInput,
} from "@/lib/nka/autoSuggest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

type PeriodRow = {
  id: string;
  property_id: string;
  period_start: string;
  period_end: string;
};

type TxRow = {
  id: string;
  date: string;
  amount: number | string;
  category: string | null;
  counterpart: string | null;
  description: string | null;
};

type LinkedItem = { transaction_id: string | null };

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "id muss eine UUID sein." },
      { status: 400 },
    );
  }

  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  // Period + Ownership
  const { data: period } = await supabase
    .from("nka_perioden")
    .select("id, property_id, period_start, period_end")
    .eq("id", id)
    .maybeSingle<PeriodRow>();
  if (!period) {
    return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });
  }
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", period.property_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!property) {
    return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });
  }

  // Transaktionen in der Periode für die Property
  const { data: txs } = await supabase
    .from("transactions")
    .select("id, date, amount, category, counterpart, description")
    .eq("property_id", period.property_id)
    .gte("date", period.period_start)
    .lte("date", period.period_end)
    .returns<TxRow[]>();

  // Bereits verlinkte transaction_ids — periode-übergreifend, weil eine
  // einmal verlinkte Transaktion auch in der Folgeperiode nicht erneut
  // vorgeschlagen werden soll (Kostenpositionen können jahresübergreifend
  // verlinkt sein).
  const { data: linked } = await supabase
    .from("nka_kostenpositionen")
    .select("transaction_id")
    .returns<LinkedItem[]>();

  const linkedTransactionIds = (linked ?? [])
    .map((r) => r.transaction_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  const input: AutoSuggestInput = {
    transactions: (txs ?? []).map((t) => ({
      id: t.id,
      date: t.date,
      // Supabase liefert numeric-Spalten als string → Number()
      amount: typeof t.amount === "number" ? t.amount : Number(t.amount),
      category: t.category,
      counterpart: t.counterpart,
      description: t.description,
    })),
    periodStart: period.period_start,
    periodEnd: period.period_end,
    linkedTransactionIds,
  };

  const out = suggestNkaCostItems(input);
  return NextResponse.json(out);
}
