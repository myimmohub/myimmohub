import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { syncNkaPeriodDerivedData } from "@/lib/nka/recalculate";
import type { NkaUmlageschluessel } from "@/types/nka";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

async function loadOwnedPeriod(supabase: Awaited<ReturnType<typeof createClient>>, id: string, userId: string) {
  const { data } = await supabase
    .from("nka_periods")
    .select(`
      *,
      property:properties(id, name, wohnflaeche_gesamt_m2, anzahl_einheiten)
    `)
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  return data;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const period = await loadOwnedPeriod(supabase, id, user.id);
  if (!period) return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });

  const body = await request.json() as {
    bezeichnung?: string;
    betr_kv_position?: number;
    betrag_brutto?: number;
    umlageschluessel?: NkaUmlageschluessel;
    ist_umlagefaehig?: boolean;
    notiz?: string | null;
  };

  const bezeichnung = String(body.bezeichnung ?? "").trim();
  const betrKv = Number(body.betr_kv_position ?? 0);
  const betrag = Number(body.betrag_brutto ?? 0);
  const umlageschluessel = (body.umlageschluessel ?? "wohnflaeche") as NkaUmlageschluessel;

  if (!bezeichnung) return NextResponse.json({ error: "Bitte eine Bezeichnung angeben." }, { status: 400 });
  if (!Number.isFinite(betrKv) || betrKv < 1 || betrKv > 17) {
    return NextResponse.json({ error: "Bitte eine gültige BetrKV-Position zwischen 1 und 17 wählen." }, { status: 400 });
  }
  if (!Number.isFinite(betrag) || betrag <= 0) {
    return NextResponse.json({ error: "Bitte einen positiven Betrag angeben." }, { status: 400 });
  }

  const insertResult = await supabase.from("nka_cost_items").insert({
    nka_periode_id: id,
    betr_kv_position: betrKv,
    bezeichnung,
    betrag_brutto: Math.round(betrag * 100) / 100,
    umlageschluessel,
    quelle: "manuell",
    ist_umlagefaehig: Boolean(body.ist_umlagefaehig ?? true),
    notiz: body.notiz?.trim() || null,
  }).select().single();

  if (insertResult.error) return NextResponse.json({ error: insertResult.error.message }, { status: 500 });

  try {
    const synced = await syncNkaPeriodDerivedData(supabase, period);
    return NextResponse.json({
      item: insertResult.data,
      summary: synced.summary,
      tenant_shares: synced.tenantShares.length,
    });
  } catch (syncError) {
    return NextResponse.json({ error: syncError instanceof Error ? syncError.message : "Periode konnte nicht synchronisiert werden." }, { status: 500 });
  }
}
