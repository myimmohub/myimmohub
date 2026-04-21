import { computeTenantShares, summarizePeriod } from "@/lib/nka/period-calculations";
import type { NkaCostItem, NkaPeriod, NkaTenantSummary } from "@/types/nka";

type PeriodWithProperty = Pick<NkaPeriod, "id" | "property_id" | "zeitraum_von" | "zeitraum_bis"> & {
  property?: {
    wohnflaeche_gesamt_m2?: number | null;
    anzahl_einheiten?: number | null;
  } | null;
};

export async function syncNkaPeriodDerivedData(
  // The route-local Supabase clients are fully typed at the call sites; here we only need the shared query surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  period: PeriodWithProperty,
) {
  const [{ data: costItems, error: costError }, { data: tenants, error: tenantError }] = await Promise.all([
    supabase
      .from("nka_cost_items")
      .select("*")
      .eq("nka_periode_id", period.id)
      .order("betr_kv_position"),
    supabase
      .from("tenants")
      .select(`
        id,
        unit_id,
        first_name,
        last_name,
        email,
        lease_start,
        lease_end,
        additional_costs_cents,
        personen_anzahl,
        anteil_wohnflaeche_m2,
        unit:units!tenants_unit_id_fkey!inner(id, label, area_sqm, property_id)
      `)
      .eq("unit.property_id", period.property_id),
  ]);

  if (costError) throw new Error(costError.message);
  if (tenantError) throw new Error(tenantError.message);

  const propertyTenants = ((tenants ?? []) as unknown as NkaTenantSummary[]).filter((tenant) => tenant.unit?.property_id === period.property_id);
  const tenantIds = propertyTenants.map((tenant) => tenant.id);
  let actualAdvancesByTenant: Record<string, number> = {};

  if (tenantIds.length > 0) {
    const { data: paymentMatches, error: paymentError } = await supabase
      .from("payment_matches")
      .select(`
        tenant_id,
        status,
        direction,
        transactions!payment_matches_transaction_id_fkey(amount, date)
      `)
      .in("tenant_id", tenantIds)
      .in("status", ["confirmed", "auto_matched"])
      .eq("direction", "incoming");

    if (paymentError) throw new Error(paymentError.message);

    actualAdvancesByTenant = ((paymentMatches ?? []) as Array<{
      tenant_id: string | null;
      transactions?: { amount?: number | null; date?: string | null } | null;
    }>).reduce<Record<string, number>>((acc, match) => {
      if (!match.tenant_id || !match.transactions?.date) return acc;
      if (match.transactions.date < period.zeitraum_von || match.transactions.date > period.zeitraum_bis) return acc;
      const amount = Number(match.transactions.amount ?? 0);
      if (amount <= 0) return acc;
      acc[match.tenant_id] = (acc[match.tenant_id] ?? 0) + amount;
      return acc;
    }, {});
  }

  const normalizedCostItems = (costItems ?? []) as NkaCostItem[];
  const nextShares = computeTenantShares({
    period,
    property: {
      wohnflaeche_gesamt_m2: period.property?.wohnflaeche_gesamt_m2 ?? null,
      anzahl_einheiten: period.property?.anzahl_einheiten ?? null,
    },
    tenants: propertyTenants,
    costItems: normalizedCostItems,
    actualAdvancesByTenant,
  });

  const deleteSharesResult = await supabase.from("nka_tenant_shares").delete().eq("nka_periode_id", period.id);
  if (deleteSharesResult.error) throw new Error(deleteSharesResult.error.message);

  if (nextShares.length > 0) {
    const insertSharesResult = await supabase.from("nka_tenant_shares").insert(nextShares);
    if (insertSharesResult.error) throw new Error(insertSharesResult.error.message);
  }

  const summary = summarizePeriod(normalizedCostItems);
  const updatePeriodResult = await supabase
    .from("nka_periods")
    .update({
      ...summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", period.id);
  if (updatePeriodResult.error) throw new Error(updatePeriodResult.error.message);

  return {
    costItems: normalizedCostItems,
    tenantShares: nextShares,
    summary,
  };
}
