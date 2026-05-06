/**
 * POST /api/cron/index-rent-suggestions
 *
 * Generiert monatlich Indexmiete-Anpassungs-Vorschläge.
 *
 * Auth-Modi:
 *   1. Bearer ${CRON_SECRET}              → User-übergreifend
 *   2. Eingeloggter User (Cookie-basiert) → nur eigene Mieter
 *
 * Pro Mieter mit rent_type='index' und index_base_value/index_base_date:
 *   1. Lade neuesten cpi_index_values mit index_date <= heute → current_index
 *   2. Lade cpi_index_values mit index_date <= base_date → base_index
 *   3. calculateIndexedRent(...)
 *   4. Wenn is_eligible && delta_cents !== 0: upsert in
 *      rent_adjustment_suggestions (UNIQUE(tenant_id, effective_date,
 *      base_index, current_index)) als idempotenter Vorgang.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  calculateIndexedRent,
  type IndexRentResult,
} from "@/lib/tenants/indexRent";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

type TenantRow = {
  id: string;
  unit_id: string;
  rent_type: string | null;
  cold_rent_cents: number;
  index_base_value: number | null;
  index_base_date: string | null;
  index_interval_months: number | null;
  units?: {
    id: string;
    property_id: string;
    properties?: { user_id: string } | null;
  } | null;
};

type CpiRow = { index_date: string; index_value: number };

type ErrorEntry = { tenant_id: string; message: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const isCronCall = Boolean(CRON_SECRET) && authHeader === `Bearer ${CRON_SECRET}`;

  if (!isCronCall && CRON_SECRET && authHeader && authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) =>
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        ),
    },
  });

  let userId: string | null = null;
  if (!isCronCall) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    userId = user.id;
  }

  // Mieter laden — index, mit base_value + base_date.
  const { data: tenantsRaw, error: tenantsError } = await supabase
    .from("tenants")
    .select(
      "id, unit_id, rent_type, cold_rent_cents, index_base_value, index_base_date, index_interval_months, units!tenants_unit_id_fkey(id, property_id, properties(user_id))",
    )
    .eq("rent_type", "index")
    .in("status", ["active", "notice_given"]);

  if (tenantsError) {
    return NextResponse.json({ error: tenantsError.message }, { status: 500 });
  }

  let tenants = ((tenantsRaw ?? []) as unknown as TenantRow[]).filter(
    (t) => t.index_base_value != null && t.index_base_date != null,
  );

  if (!isCronCall && userId) {
    tenants = tenants.filter(
      (t) => t.units?.properties?.user_id === userId,
    );
  }

  // CPI-Werte einmalig laden — sortiert.
  const { data: cpiRaw, error: cpiErr } = await supabase
    .from("cpi_index_values")
    .select("index_date, index_value")
    .order("index_date", { ascending: false });
  if (cpiErr) {
    return NextResponse.json({ error: cpiErr.message }, { status: 500 });
  }

  const today = todayIso();
  const cpiSorted = ((cpiRaw ?? []) as CpiRow[]).sort((a, b) =>
    a.index_date < b.index_date ? 1 : a.index_date > b.index_date ? -1 : 0,
  );
  const currentCpi = cpiSorted.find((c) => c.index_date <= today) ?? null;

  let suggestionsCreated = 0;
  let suggestionsSkipped = 0;
  const errors: ErrorEntry[] = [];

  if (!currentCpi) {
    // Ohne aktuellen CPI können wir nichts berechnen — kein Crash, leeres Result.
    return NextResponse.json({
      tenants_evaluated: tenants.length,
      suggestions_created: 0,
      suggestions_skipped: tenants.length,
      errors: tenants.map<ErrorEntry>((t) => ({
        tenant_id: t.id,
        message: "Kein CPI-Wert vorhanden — Vorschlag übersprungen.",
      })),
    });
  }

  for (const tenant of tenants) {
    try {
      const baseDate = tenant.index_base_date as string;
      const baseValueEuros = Number(tenant.index_base_value);
      const baseValueCents = Math.round(baseValueEuros * 100);
      // base_index: jüngster CPI mit index_date <= base_date
      const baseCpi = cpiSorted.find((c) => c.index_date <= baseDate);
      if (!baseCpi) {
        errors.push({
          tenant_id: tenant.id,
          message: "Kein Basis-CPI gefunden für base_date.",
        });
        continue;
      }
      const interval = tenant.index_interval_months ?? 12;

      // Last_adjustment_date: jüngstes index-Adjustment für diesen Mieter,
      // falls vorhanden — sonst base_date.
      const { data: lastAdjRaw } = await supabase
        .from("rent_adjustments")
        .select("effective_date, adjustment_type")
        .eq("tenant_id", tenant.id)
        .eq("adjustment_type", "index")
        .order("effective_date", { ascending: false });
      const lastAdjList = (lastAdjRaw ?? []) as Array<{
        effective_date: string;
        adjustment_type: string;
      }>;
      const lastAdjDate = lastAdjList[0]?.effective_date ?? baseDate;

      const result: IndexRentResult = calculateIndexedRent({
        base_value_cents: baseValueCents,
        base_date: baseDate,
        base_index: Number(baseCpi.index_value),
        current_index: Number(currentCpi.index_value),
        current_date: today,
        interval_months: interval,
        last_adjustment_date: lastAdjDate,
      });

      if (!result.is_eligible || result.delta_cents === 0) {
        suggestionsSkipped += 1;
        continue;
      }

      // Idempotenz-Check via UNIQUE(tenant_id, effective_date, base_index, current_index)
      const { data: existing } = await supabase
        .from("rent_adjustment_suggestions")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("effective_date", today)
        .eq("base_index", Number(baseCpi.index_value))
        .eq("current_index", Number(currentCpi.index_value))
        .maybeSingle();
      if (existing) {
        suggestionsSkipped += 1;
        continue;
      }

      const propertyId = tenant.units?.property_id;
      if (!propertyId) {
        errors.push({
          tenant_id: tenant.id,
          message: "Property nicht auflösbar.",
        });
        continue;
      }

      const { error: insErr } = await supabase
        .from("rent_adjustment_suggestions")
        .insert({
          tenant_id: tenant.id,
          property_id: propertyId,
          effective_date: today,
          current_cold_rent_cents: tenant.cold_rent_cents,
          proposed_cold_rent_cents: result.new_value_cents,
          delta_cents: result.delta_cents,
          pct_change: result.pct_change,
          base_value_cents: baseValueCents,
          base_date: baseDate,
          base_index: Number(baseCpi.index_value),
          current_index: Number(currentCpi.index_value),
          current_index_date: currentCpi.index_date,
          is_eligible: result.is_eligible,
          next_eligible_date: result.next_eligible_date,
          warnings: result.warnings,
          status: "pending",
        });
      if (insErr) {
        errors.push({ tenant_id: tenant.id, message: insErr.message });
        continue;
      }
      suggestionsCreated += 1;
    } catch (err) {
      errors.push({
        tenant_id: tenant.id,
        message: err instanceof Error ? err.message : "Unbekannter Fehler.",
      });
    }
  }

  return NextResponse.json({
    tenants_evaluated: tenants.length,
    suggestions_created: suggestionsCreated,
    suggestions_skipped: suggestionsSkipped,
    errors,
  });
}
