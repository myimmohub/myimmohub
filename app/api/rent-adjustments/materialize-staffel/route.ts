/**
 * POST /api/rent-adjustments/materialize-staffel
 *   Body: { tenant_id?: string }
 *
 * Materialisiert offene Staffelmieten in `rent_adjustments`. Wenn `tenant_id`
 * gesetzt ist, nur für diesen Mieter; sonst für alle Mieter des Users
 * (Owner-Check via properties.user_id = auth.uid()).
 *
 * Idempotent: vorherige Aufrufe werden korrekt erkannt (siehe
 * `activateStaffelEntries`).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  activateStaffelEntries,
  type StaffelEntry,
  type StaffelExistingAdjustment,
} from "@/lib/tenants/staffelActivator";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function makeSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

type TenantRow = {
  id: string;
  unit_id: string;
  staffel_entries: StaffelEntry[] | null;
};

export async function POST(request: Request) {
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { tenant_id?: string };
  const tenantFilter = body.tenant_id ?? null;

  // Tenants laden — RLS sorgt für Owner-Check, wir filtern darüber hinaus.
  let query = supabase
    .from("tenants")
    .select("id, unit_id, staffel_entries");
  if (tenantFilter) {
    query = query.eq("id", tenantFilter);
  }
  const { data: tenantsRaw, error: tenantsError } = await query;
  if (tenantsError) {
    return NextResponse.json({ error: tenantsError.message }, { status: 500 });
  }
  const tenants = (tenantsRaw ?? []) as TenantRow[];
  if (tenants.length === 0) {
    return NextResponse.json({ activated: 0, skipped: 0, details: [] });
  }

  const tenantIds = tenants.map((t) => t.id);
  const { data: existingRaw, error: adjErr } = await supabase
    .from("rent_adjustments")
    .select("tenant_id, effective_date, cold_rent_cents, additional_costs_cents, adjustment_type")
    .in("tenant_id", tenantIds);
  if (adjErr) {
    return NextResponse.json({ error: adjErr.message }, { status: 500 });
  }

  const existingByTenant = new Map<string, StaffelExistingAdjustment[]>();
  for (const row of existingRaw ?? []) {
    const r = row as { tenant_id: string } & StaffelExistingAdjustment;
    const list = existingByTenant.get(r.tenant_id) ?? [];
    list.push({
      effective_date: r.effective_date,
      cold_rent_cents: r.cold_rent_cents,
      additional_costs_cents: r.additional_costs_cents,
      adjustment_type: r.adjustment_type,
    });
    existingByTenant.set(r.tenant_id, list);
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const allInserts: Array<{
    tenant_id: string;
    effective_date: string;
    cold_rent_cents: number;
    additional_costs_cents: number | null;
    adjustment_type: "stepped";
    note: string | null;
  }> = [];
  const allDetails: Array<{
    tenant_id: string;
    inserted: number;
    skipped: Array<{ effective_date: string; reason: string }>;
  }> = [];

  for (const tenant of tenants) {
    const entries = Array.isArray(tenant.staffel_entries)
      ? tenant.staffel_entries
      : [];
    if (entries.length === 0) continue;

    const existing = existingByTenant.get(tenant.id) ?? [];
    const result = activateStaffelEntries({
      tenant_id: tenant.id,
      staffel_entries: entries,
      existing_rent_adjustments: existing,
      asOfDate: todayIso,
    });
    allInserts.push(...result.to_insert);
    allDetails.push({
      tenant_id: tenant.id,
      inserted: result.to_insert.length,
      skipped: result.skipped.map((s) => ({
        effective_date: s.entry.effective_date,
        reason: s.reason,
      })),
    });
  }

  if (allInserts.length === 0) {
    const skipCount = allDetails.reduce((s, d) => s + d.skipped.length, 0);
    return NextResponse.json({ activated: 0, skipped: skipCount, details: allDetails });
  }

  const { error: insertErr } = await supabase
    .from("rent_adjustments")
    .insert(allInserts);
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Optional: Tenant-Stamm aktualisieren auf den jüngsten gültigen Wert
  // (analog rent-adjustments POST). Wir nehmen je tenant_id den jüngsten Insert.
  const newestPerTenant = new Map<string, typeof allInserts[number]>();
  for (const ins of allInserts) {
    const cur = newestPerTenant.get(ins.tenant_id);
    if (!cur || ins.effective_date > cur.effective_date) {
      newestPerTenant.set(ins.tenant_id, ins);
    }
  }
  for (const ins of newestPerTenant.values()) {
    if (ins.effective_date <= todayIso) {
      await supabase
        .from("tenants")
        .update({
          cold_rent_cents: ins.cold_rent_cents,
          additional_costs_cents: ins.additional_costs_cents ?? 0,
        })
        .eq("id", ins.tenant_id);
    }
  }

  const skipCount = allDetails.reduce((s, d) => s + d.skipped.length, 0);
  return NextResponse.json({
    activated: allInserts.length,
    skipped: skipCount,
    details: allDetails,
  });
}
