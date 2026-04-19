import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { syncNkaPeriodDerivedData } from "@/lib/nka/recalculate";
import type { NkaCostItem, NkaUmlageschluessel } from "@/types/nka";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type CategoryRow = {
  label: string;
  gruppe?: string | null;
  typ?: string | null;
  betr_kv_position?: number | null;
  ist_umlagefaehig_default?: boolean | null;
  umlageschluessel_default?: NkaUmlageschluessel | null;
};

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { data: period } = await supabase
    .from("nka_periods")
    .select(`
      *,
      property:properties(id, name, wohnflaeche_gesamt_m2, anzahl_einheiten)
    `)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!period) return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });

  const [{ data: transactions, error: txError }, { data: categories, error: catError }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, property_id, date, amount, description, counterpart, category, ist_umlagefaehig, betr_kv_position, umlageschluessel_override")
      .eq("property_id", period.property_id)
      .gte("date", period.zeitraum_von)
      .lte("date", period.zeitraum_bis)
      .neq("amount", 0)
      .order("date", { ascending: true }),
    supabase.from("categories").select("label, gruppe, typ, betr_kv_position, ist_umlagefaehig_default, umlageschluessel_default").is("deleted_at", null),
  ]);

  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 });
  if (catError) return NextResponse.json({ error: catError.message }, { status: 500 });

  const categoryMap = new Map(((categories ?? []) as CategoryRow[]).map((row) => [row.label, row]));
  const autoItems = ((transactions ?? []) as Array<Record<string, unknown>>).reduce<Array<Omit<NkaCostItem, "id" | "created_at">>>((items, tx) => {
      const categoryLabel = String(tx.category ?? "");
      const category = categoryMap.get(categoryLabel);
      const amount = Number(tx.amount ?? 0);
      const betrKv = Number(tx.betr_kv_position ?? category?.betr_kv_position ?? 0);
      const looksLikeExpense = amount < 0 || category?.typ === "ausgabe" || category?.gruppe === "Nebenkosten";
      if (!looksLikeExpense || !betrKv || betrKv < 1 || betrKv > 17) return items;
      const umlagefaehig = tx.ist_umlagefaehig == null ? Boolean(category?.ist_umlagefaehig_default ?? false) : Boolean(tx.ist_umlagefaehig);
      const umlageschluessel = (tx.umlageschluessel_override ?? category?.umlageschluessel_default ?? "wohnflaeche") as NkaUmlageschluessel;
      const bezeichnung = [tx.counterpart, tx.description, categoryLabel].filter(Boolean).join(" · ");
      items.push({
        nka_periode_id: id,
        betr_kv_position: betrKv,
        bezeichnung: bezeichnung || categoryLabel || "Kostenposition",
        betrag_brutto: Math.round(Math.abs(amount) * 100) / 100,
        umlageschluessel,
        quelle: "transaktion" as const,
        transaktion_id: String(tx.id),
        beleg_pfad: null,
        ist_umlagefaehig: umlagefaehig,
        notiz: null,
      });
      return items;
    }, []);

  await supabase.from("nka_cost_items").delete().eq("nka_periode_id", id).eq("quelle", "transaktion");
  if (autoItems.length > 0) {
    const { error } = await supabase.from("nka_cost_items").insert(autoItems);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let synced;
  try {
    synced = await syncNkaPeriodDerivedData(supabase, period);
  } catch (syncError) {
    return NextResponse.json({ error: syncError instanceof Error ? syncError.message : "NKA konnte nicht synchronisiert werden." }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("nka_periods")
    .update({
      status: "in_bearbeitung",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    imported_positions: autoItems.length,
    tenant_shares: synced.tenantShares.length,
    summary: synced.summary,
  });
}
