/**
 * /api/nka/periods/[id]/distribute
 *
 * POST → führt die Verteilung durch:
 *   1. lädt Periode + Kostenpositionen + Units + Tenants + payment_matches
 *   2. ruft `distribute()` (pure Engine)
 *   3. persistiert nka_mieteranteile + nka_unallocated (vorher löschen)
 *   4. setzt period.status = 'distributed'
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  distribute,
  type BetrkvPosition,
  type NkaCostItemInput,
  type NkaPaymentMatchInput,
  type NkaTenantInput,
  type NkaUnitInput,
  type Verteilungsschluessel,
} from "@/lib/nka/distribute";
import { uuidSchema } from "@/lib/nka/requestSchemas";

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
  status: string;
};

type CostItemRow = {
  id: string;
  position: BetrkvPosition;
  label: string | null;
  brutto_cents: number;
  umlagefaehig_pct: number;
  verteilungsschluessel: Verteilungsschluessel;
  direct_shares: Record<string, number> | null;
  consumption: Record<string, { from: number; to: number }> | null;
  heizkosten_verbrauchsanteil_pct: number | null;
};

type UnitRow = {
  id: string;
  unit_type: string | null;
  area_sqm: number | null;
  features: { persons?: number } | null;
  vat_liable: boolean | null;
};

type TenantRow = {
  id: string;
  unit_id: string;
  lease_start: string;
  lease_end: string | null;
  cold_rent_cents: number;
  additional_costs_cents: number | null;
};

type PaymentMatchRow = {
  tenant_id: string | null;
  period_month: string | null;
  // Wir laden die Beträge aus der verknüpften transaction.
  transactions: { amount: number | null } | { amount: number | null }[] | null;
};

export async function POST(
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
  if (!user)
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  // Ownership + Periode laden
  const { data: period } = await supabase
    .from("nka_perioden")
    .select("id, property_id, period_start, period_end, status")
    .eq("id", id)
    .maybeSingle<PeriodRow>();
  if (!period)
    return NextResponse.json(
      { error: "Periode nicht gefunden." },
      { status: 404 },
    );

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", period.property_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!property)
    return NextResponse.json(
      { error: "Periode nicht gefunden." },
      { status: 404 },
    );

  // Cost-Items laden
  const { data: costItemRows, error: ciErr } = await supabase
    .from("nka_kostenpositionen")
    .select(
      "id, position, label, brutto_cents, umlagefaehig_pct, verteilungsschluessel, direct_shares, consumption, heizkosten_verbrauchsanteil_pct",
    )
    .eq("period_id", id);
  if (ciErr)
    return NextResponse.json({ error: ciErr.message }, { status: 500 });
  const costItems: NkaCostItemInput[] = (costItemRows ?? []).map(
    (r: CostItemRow) => ({
      id: r.id,
      position: r.position,
      label: r.label,
      brutto_cents: Number(r.brutto_cents),
      umlagefaehig_pct: Number(r.umlagefaehig_pct),
      verteilungsschluessel: r.verteilungsschluessel,
      direct_shares: r.direct_shares ?? undefined,
      consumption: r.consumption ?? undefined,
      heizkosten_verbrauchsanteil_pct:
        r.heizkosten_verbrauchsanteil_pct === null
          ? undefined
          : Number(r.heizkosten_verbrauchsanteil_pct),
    }),
  );

  // Units laden (alle der Property)
  const { data: unitRows, error: uErr } = await supabase
    .from("units")
    .select("id, unit_type, area_sqm, features, vat_liable")
    .eq("property_id", period.property_id);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  const units: NkaUnitInput[] = (unitRows ?? []).map((u: UnitRow) => ({
    id: u.id,
    unit_type: (u.unit_type === "commercial" ? "commercial" : "residential") as
      | "residential"
      | "commercial",
    area_sqm: u.area_sqm === null ? null : Number(u.area_sqm),
    persons:
      u.features && typeof u.features.persons === "number"
        ? u.features.persons
        : null,
    vat_liable: u.vat_liable ?? false,
  }));

  // Tenants der Units laden
  const unitIds = units.map((u) => u.id);
  let tenants: NkaTenantInput[] = [];
  if (unitIds.length > 0) {
    const { data: tRows, error: tErr } = await supabase
      .from("tenants")
      .select(
        "id, unit_id, lease_start, lease_end, cold_rent_cents, additional_costs_cents",
      )
      .in("unit_id", unitIds);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    tenants = (tRows ?? []).map((t: TenantRow) => ({
      id: t.id,
      unit_id: t.unit_id,
      lease_start: t.lease_start,
      lease_end: t.lease_end,
      cold_rent_cents: Number(t.cold_rent_cents),
      additional_costs_cents: Number(t.additional_costs_cents ?? 0),
    }));
  }

  // payment_matches im Zeitraum laden (für Vorauszahlungs-Aggregation)
  let paymentMatches: NkaPaymentMatchInput[] = [];
  if (tenants.length > 0) {
    const tenantIds = tenants.map((t) => t.id);
    const { data: pmRows } = await supabase
      .from("payment_matches")
      .select("tenant_id, period_month, transactions(amount)")
      .in("tenant_id", tenantIds)
      .gte("period_month", period.period_start)
      .lte("period_month", period.period_end);
    paymentMatches = (pmRows ?? [])
      .map((row: PaymentMatchRow) => {
        if (!row.tenant_id || !row.period_month) return null;
        const tx = Array.isArray(row.transactions)
          ? row.transactions[0]
          : row.transactions;
        const amount = tx?.amount;
        if (amount == null) return null;
        const tenant = tenants.find((t) => t.id === row.tenant_id);
        if (!tenant) return null;
        // amount in EUR (DB-Convention) → Cent.
        const totalCents = Math.round(Math.abs(Number(amount)) * 100);
        // Aufteilung Kalt/NK nach tenant.cold_rent_cents:additional_costs_cents
        const sumExpected =
          tenant.cold_rent_cents + tenant.additional_costs_cents;
        let coldCents = 0;
        let addCents = 0;
        if (sumExpected > 0) {
          coldCents = Math.round(
            (totalCents * tenant.cold_rent_cents) / sumExpected,
          );
          addCents = totalCents - coldCents;
        }
        return {
          tenant_id: row.tenant_id,
          period_month: row.period_month.slice(0, 7),
          cold_rent_cents: coldCents,
          additional_costs_cents: addCents,
        } satisfies NkaPaymentMatchInput;
      })
      .filter((x): x is NkaPaymentMatchInput => x !== null);
  }

  // Engine-Aufruf
  const result = distribute({
    periodStart: period.period_start,
    periodEnd: period.period_end,
    units,
    tenants,
    costItems,
    paymentMatches,
  });

  // Persistieren: alte Snapshots löschen, neue anlegen.
  await supabase.from("nka_mieteranteile").delete().eq("period_id", id);
  await supabase.from("nka_unallocated").delete().eq("period_id", id);

  if (result.tenant_shares.length > 0) {
    const rows = result.tenant_shares.map((ts) => ({
      period_id: id,
      tenant_id: ts.tenant_id,
      unit_id: ts.unit_id,
      total_share_cents: ts.total_share_cents,
      total_paid_advance_cents: ts.total_paid_advance_cents,
      balance_cents: ts.balance_cents,
      breakdown: ts.shares,
      active_days: ts.active_days,
    }));
    const { error: insErr } = await supabase
      .from("nka_mieteranteile")
      .insert(rows);
    if (insErr)
      return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const unallocRows = Object.entries(result.unallocated_cents).map(
    ([costItemId, cents]) => ({
      period_id: id,
      cost_item_id: costItemId,
      unallocated_cents: cents,
      reason: "Leerstand oder direct_shares-Differenz",
    }),
  );
  if (unallocRows.length > 0) {
    const { error: unErr } = await supabase
      .from("nka_unallocated")
      .insert(unallocRows);
    if (unErr)
      return NextResponse.json({ error: unErr.message }, { status: 500 });
  }

  await supabase
    .from("nka_perioden")
    .update({ status: "distributed" })
    .eq("id", id);

  return NextResponse.json({
    period_id: id,
    period_days: result.period_days,
    tenant_shares: result.tenant_shares,
    warnings: result.warnings,
    unallocated_cents: result.unallocated_cents,
  });
}
