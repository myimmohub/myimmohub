/**
 * POST /api/cron/materialize-staffel
 *
 * Cron-Endpoint, der Staffelmieten in `rent_adjustments` materialisiert.
 *
 * Auth-Modi (analog zu /api/email-fetch):
 *   1. Bearer ${CRON_SECRET}                         → User-übergreifend
 *   2. Eingeloggter User (Cookie-basiert)            → nur eigene Mieter
 *
 * Pro Mieter (rent_type='stepped' und staffel_entries IS NOT NULL):
 *   1. Lade staffel_entries (jsonb)
 *   2. Lade existing rent_adjustments
 *   3. activateStaffelEntries({...}) → to_insert / skipped
 *   4. Persistiere to_insert in rent_adjustments
 *   5. Aktualisiere tenants.cold_rent_cents/additional_costs_cents falls
 *      jüngste Staffel-Stufe `effective_date <= heute`.
 *
 * Fehler pro Mieter werden gesammelt, der Lauf wird nicht abgebrochen.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  activateStaffelEntries,
  type StaffelEntry,
  type StaffelExistingAdjustment,
  type StaffelActivatorInsert,
} from "@/lib/tenants/staffelActivator";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

type TenantRow = {
  id: string;
  unit_id: string;
  rent_type: string | null;
  staffel_entries: StaffelEntry[] | null;
};

type ErrorEntry = { tenant_id: string; message: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const isCronCall = Boolean(CRON_SECRET) && authHeader === `Bearer ${CRON_SECRET}`;

  // Auth: Bearer Secret falsch (gesetzt aber nicht gleich) → 401.
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    userId = user.id;
  }

  // Tenants laden — Cron-Mode = alle stepped Mieter, User-Mode = nur eigene.
  let query = supabase
    .from("tenants")
    .select("id, unit_id, rent_type, staffel_entries, units!tenants_unit_id_fkey(id, property_id, properties(user_id))")
    .eq("rent_type", "stepped")
    .in("status", ["active", "notice_given"]);

  type RawTenantRow = TenantRow & {
    units?: {
      id: string;
      property_id: string;
      properties?: { user_id: string } | null;
    } | null;
  };

  const { data: tenantsRaw, error: tenantsError } = await query;
  if (tenantsError) {
    return NextResponse.json({ error: tenantsError.message }, { status: 500 });
  }

  let tenants = ((tenantsRaw ?? []) as unknown as RawTenantRow[]).filter(
    (t) =>
      Array.isArray(t.staffel_entries) &&
      (t.staffel_entries as StaffelEntry[]).length > 0,
  );

  // User-Mode: nur Mieter, deren Property zum User gehört.
  if (!isCronCall && userId) {
    tenants = tenants.filter(
      (t) => t.units?.properties?.user_id === userId,
    );
  }

  const asOfDate = todayIso();
  let adjustmentsCreated = 0;
  let adjustmentsSkipped = 0;
  const errors: ErrorEntry[] = [];

  // Existing adjustments einmalig je Tenant nachladen wäre N+1 — wir laden bulk.
  const tenantIds = tenants.map((t) => t.id);
  const existingByTenant = new Map<string, StaffelExistingAdjustment[]>();
  if (tenantIds.length > 0) {
    const { data: existingRaw, error: adjErr } = await supabase
      .from("rent_adjustments")
      .select(
        "tenant_id, effective_date, cold_rent_cents, additional_costs_cents, adjustment_type",
      )
      .in("tenant_id", tenantIds);
    if (adjErr) {
      return NextResponse.json({ error: adjErr.message }, { status: 500 });
    }
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
  }

  for (const tenant of tenants) {
    try {
      const entries = (tenant.staffel_entries ?? []) as StaffelEntry[];
      const existing = existingByTenant.get(tenant.id) ?? [];
      const result = activateStaffelEntries({
        tenant_id: tenant.id,
        staffel_entries: entries,
        existing_rent_adjustments: existing,
        asOfDate,
      });
      adjustmentsSkipped += result.skipped.length;

      if (result.to_insert.length === 0) continue;

      const { error: insertErr } = await supabase
        .from("rent_adjustments")
        .insert(result.to_insert);
      if (insertErr) {
        errors.push({ tenant_id: tenant.id, message: insertErr.message });
        continue;
      }
      adjustmentsCreated += result.to_insert.length;

      // Tenant-Stamm: jüngsten Insert mit effective_date <= heute übernehmen.
      const newest = pickNewestApplicable(result.to_insert, asOfDate);
      if (newest) {
        const { error: updErr } = await supabase
          .from("tenants")
          .update({
            cold_rent_cents: newest.cold_rent_cents,
            additional_costs_cents: newest.additional_costs_cents ?? 0,
          })
          .eq("id", tenant.id);
        if (updErr) {
          errors.push({ tenant_id: tenant.id, message: updErr.message });
        }
      }
    } catch (err) {
      errors.push({
        tenant_id: tenant.id,
        message: err instanceof Error ? err.message : "Unbekannter Fehler.",
      });
    }
  }

  return NextResponse.json({
    tenants_processed: tenants.length,
    adjustments_created: adjustmentsCreated,
    adjustments_skipped: adjustmentsSkipped,
    errors,
  });
}

function pickNewestApplicable(
  inserts: StaffelActivatorInsert[],
  asOfDate: string,
): StaffelActivatorInsert | null {
  let best: StaffelActivatorInsert | null = null;
  for (const ins of inserts) {
    if (ins.effective_date > asOfDate) continue;
    if (!best || ins.effective_date > best.effective_date) {
      best = ins;
    }
  }
  return best;
}
