import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { syncNkaPeriodDerivedData } from "@/lib/nka/recalculate";
import type { NkaCostItem, NkaPeriod, NkaTenantShare, NkaTransactionCandidate, NkaUmlageschluessel } from "@/types/nka";

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
      property:properties(id, name, address, wohnflaeche_gesamt_m2, anzahl_einheiten, ist_weg, hausverwaltung_name, hausverwaltung_email)
    `)
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  return data as (NkaPeriod & { property: { id: string; name: string; address: string | null; wohnflaeche_gesamt_m2?: number | null; anzahl_einheiten?: number | null; ist_weg?: boolean | null } | null }) | null;
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const period = await loadOwnedPeriod(supabase, id, user.id);
  if (!period) return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });

  const [{ data: costItems }, { data: tenantShares }, { data: tenants }, { data: transactions }, { data: categories }, { data: paymentMatches }] = await Promise.all([
    supabase.from("nka_cost_items").select("*").eq("nka_periode_id", id).order("betr_kv_position").order("created_at"),
    supabase.from("nka_tenant_shares").select("*").eq("nka_periode_id", id).order("bewohnt_von"),
    supabase
      .from("tenants")
      .select(`
        id,
        first_name,
        last_name,
        email,
        unit:units!tenants_unit_id_fkey(label, area_sqm, property_id)
      `),
    supabase
      .from("transactions")
      .select("id, date, amount, description, counterpart, category, ist_umlagefaehig, betr_kv_position, umlageschluessel_override")
      .eq("property_id", period.property_id)
      .gte("date", period.zeitraum_von)
      .lte("date", period.zeitraum_bis)
      .neq("amount", 0)
      .order("date", { ascending: false }),
    supabase.from("categories").select("label, gruppe, typ, betr_kv_position, ist_umlagefaehig_default, umlageschluessel_default").is("deleted_at", null),
    supabase
      .from("payment_matches")
      .select(`
        tenant_id,
        status,
        direction,
        transactions!payment_matches_transaction_id_fkey(amount, date, counterpart, description)
      `)
      .in("status", ["confirmed", "auto_matched"])
      .eq("direction", "incoming"),
  ]);

  const tenantMap = new Map(
    ((tenants ?? []) as Array<{
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      unit?: { label?: string | null; property_id?: string | null } | null;
    }>)
      .filter((tenant) => tenant.unit?.property_id === period.property_id)
      .map((tenant) => [
        tenant.id,
        {
          tenant_name: [tenant.first_name, tenant.last_name].filter(Boolean).join(" ").trim() || tenant.email || tenant.id,
          unit_label: tenant.unit?.label ?? null,
        },
      ]),
  );

  const matchedPaymentsByTenant = ((paymentMatches ?? []) as Array<{
    tenant_id: string | null;
    transactions?: { amount?: number | null; date?: string | null; counterpart?: string | null; description?: string | null } | null;
  }>).reduce<Record<string, { count: number; sources: string[] }>>((acc, match) => {
    if (!match.tenant_id || !match.transactions?.date) return acc;
    if (match.transactions.date < period.zeitraum_von || match.transactions.date > period.zeitraum_bis) return acc;
    const amount = Number(match.transactions.amount ?? 0);
    if (amount <= 0) return acc;
    const source = [match.transactions.counterpart, match.transactions.description].filter(Boolean).join(" · ");
    if (!acc[match.tenant_id]) acc[match.tenant_id] = { count: 0, sources: [] };
    acc[match.tenant_id].count += 1;
    if (source) acc[match.tenant_id].sources.push(source);
    return acc;
  }, {});

  const enrichedShares = ((tenantShares ?? []) as NkaTenantShare[]).map((share) => ({
    ...share,
    tenant_name: tenantMap.get(share.mieter_id)?.tenant_name ?? share.versandt_an_email ?? share.mieter_id,
    unit_label: tenantMap.get(share.mieter_id)?.unit_label ?? null,
    matched_payment_count: matchedPaymentsByTenant[share.mieter_id]?.count ?? 0,
    matched_payment_sources: matchedPaymentsByTenant[share.mieter_id]?.sources ?? [],
  }));

  const categoryMap = new Map(
    ((categories ?? []) as Array<{
      label: string;
      gruppe?: string | null;
      typ?: string | null;
      betr_kv_position?: number | null;
      ist_umlagefaehig_default?: boolean | null;
      umlageschluessel_default?: NkaUmlageschluessel | null;
    }>).map((row) => [row.label, row]),
  );

  const transactionCandidates = ((transactions ?? []) as Array<Record<string, unknown>>).reduce<NkaTransactionCandidate[]>((items, tx) => {
    const categoryLabel = String(tx.category ?? "");
    const category = categoryMap.get(categoryLabel);
    const betrKv = Number(tx.betr_kv_position ?? category?.betr_kv_position ?? 0);
    const txType = category?.typ ?? null;
    const txGroup = category?.gruppe ?? null;
    const amount = Number(tx.amount ?? 0);
    const looksLikeExpense = amount < 0 || txType === "ausgabe" || txGroup === "Nebenkosten";
    if (!looksLikeExpense) return items;
    const normalizedBetrKv = betrKv >= 1 && betrKv <= 17 ? betrKv : 17;
    items.push({
      id: String(tx.id),
      date: String(tx.date),
      amount,
      description: tx.description ? String(tx.description) : null,
      counterpart: tx.counterpart ? String(tx.counterpart) : null,
      category: categoryLabel || null,
      betr_kv_position: normalizedBetrKv,
      umlageschluessel: (tx.umlageschluessel_override ?? category?.umlageschluessel_default ?? "wohnflaeche") as NkaUmlageschluessel,
      ist_umlagefaehig: tx.ist_umlagefaehig == null ? Boolean(category?.ist_umlagefaehig_default ?? false) : Boolean(tx.ist_umlagefaehig),
      needs_betrkv_review: !(betrKv >= 1 && betrKv <= 17),
    });
    return items;
  }, []);

  return NextResponse.json({
    period,
    cost_items: (costItems ?? []) as NkaCostItem[],
    tenant_shares: enrichedShares,
    transaction_candidates: transactionCandidates,
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const period = await loadOwnedPeriod(supabase, id, user.id);
  if (!period) return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });

  const body = await request.json() as Partial<NkaPeriod> & { recalculate_shares?: boolean };
  const updates: Record<string, unknown> = {};
  for (const key of ["status", "versandt_am", "widerspruchsfrist_bis", "pdf_pfad"] as const) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  let updatedPeriod = period as NkaPeriod;
  if (Object.keys(updates).length > 0) {
    const { data, error } = await supabase
      .from("nka_periods")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updatedPeriod = data as NkaPeriod;
  }

  if (body.recalculate_shares) {
    try {
      await syncNkaPeriodDerivedData(supabase, period);
    } catch (syncError) {
      return NextResponse.json({ error: syncError instanceof Error ? syncError.message : "Mieteranteile konnten nicht neu berechnet werden." }, { status: 500 });
    }
  }

  return NextResponse.json(updatedPeriod);
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const period = await loadOwnedPeriod(supabase, id, user.id);
  if (!period) return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });

  const { error } = await supabase.from("nka_periods").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
