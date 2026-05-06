/**
 * POST /api/tax/calculate
 *
 * Berechnet tax_data-Felder aus Transaktionen und speichert/aktualisiert in tax_data.
 * Body: { property_id: string, tax_year: number }
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { TaxCalculationTransaction } from "@/lib/tax/calculateTaxFromTransactions";
import {
  runCalculatePipeline,
  type CalculatePipelineDbCategory,
  type CalculatePipelineNkaUmlage,
  type CalculatePipelinePaymentMatch,
} from "@/lib/tax/pipeline";
import type { BetrkvPosition } from "@/lib/nka/distribute";
import type {
  TaxData,
  TaxDepreciationItem,
  TaxMaintenanceDistributionItem,
} from "@/types/tax";
import { taxCalculateRequestSchema } from "@/lib/tax/requestSchemas";
import { lockKey, acquireLock, releaseLock } from "@/lib/tax/concurrencyLock";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: Request) {
  // ── Input-Validation (Zod) ──────────────────────────────────────────────────
  let property_id: string;
  let tax_year: number;
  try {
    const raw = await request.json();
    const validation = taxCalculateRequestSchema.safeParse(raw);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Ungültiger Request-Body.", details: validation.error.flatten() },
        { status: 400 },
      );
    }
    property_id = validation.data.property_id;
    tax_year = validation.data.tax_year;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON im Request-Body." }, { status: 400 });
  }

  // ── Idempotenz-Lock (verhindert parallele Recalcs, Multi-Instance-safe) ─────
  // Supabase-Client zuerst aufbauen, damit der Postgres-Advisory-Lock-Pfad
  // funktioniert. acquireLock() macht zusätzlich einen In-Memory-Lock im selben
  // Worker-Prozess als Defense-in-Depth.
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });

  const key = lockKey(property_id, tax_year);
  const acquired = await acquireLock(supabase, key);
  if (!acquired) {
    return NextResponse.json(
      {
        error: "Berechnung läuft bereits für diese Property + Jahr.",
        details: "Es ist bereits ein Recalculate-Call für dieselbe Kombination im Gange. Bitte warten und erneut versuchen.",
      },
      { status: 409 },
    );
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
    return await runCalculate(supabase, user, property_id, tax_year);
  } finally {
    // Lock IMMER freigeben — auch bei Errors. Postgres würde den Advisory-Lock
    // sonst bis zum Verbindungsabbau halten.
    await releaseLock(supabase, key);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runCalculate(supabase: any, user: { id: string }, property_id: string, tax_year: number): Promise<Response> {

  // Load property
  const { data: prop } = await supabase
    .from("properties")
    .select("id, name, kaufpreis, gebaeudewert, grundwert, inventarwert, baujahr, afa_satz, afa_jahresbetrag, kaufdatum, address, type")
    .eq("id", property_id)
    .eq("user_id", user.id)
    .single();

  if (!prop) return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 403 });

  // Load transactions
  const { data: txData } = await supabase
    .from("transactions")
    .select("id, date, amount, category, is_tax_deductible, anlage_v_zeile, description, counterpart")
    .eq("property_id", property_id)
    .eq("user_id", user.id);

  // Fetch confirmed payment matches with tenant rent split data
  const { data: paymentMatchData } = await supabase
    .from("payment_matches")
    .select("transaction_id, tenants(cold_rent_cents, additional_costs_cents)")
    .eq("property_id", property_id)
    .in("status", ["confirmed", "auto_matched"]);

  const paymentMatches: CalculatePipelinePaymentMatch[] = [];
  for (const m of (paymentMatchData ?? [])) {
    const t = Array.isArray(m.tenants) ? m.tenants[0] : m.tenants;
    if (m.transaction_id && t) {
      const tenant = t as { cold_rent_cents: number; additional_costs_cents: number };
      paymentMatches.push({
        transaction_id: m.transaction_id as string,
        cold_rent_cents: tenant.cold_rent_cents ?? 0,
        additional_costs_cents: tenant.additional_costs_cents ?? 0,
      });
    }
  }

  // Load categories
  const { data: categories } = await supabase
    .from("categories")
    .select("label, typ, anlage_v, gruppe");

  const [
    { data: gbrSettings },
    { data: taxSettings },
    { data: depreciationItems },
    { data: maintenanceItems },
  ] = await Promise.all([
    supabase.from("gbr_settings").select("*, gbr_partner(*)").eq("property_id", property_id).maybeSingle(),
    supabase
      .from("tax_settings")
      .select("eigennutzung_tage, gesamt_tage, rental_share_override_pct, verwaltungspauschale_eur, porto_pauschale_eur, tax_year")
      .eq("property_id", property_id)
      .in("tax_year", [0, tax_year])
      .order("tax_year", { ascending: false })
      .limit(1),
    supabase.from("tax_depreciation_items").select("*").eq("property_id", property_id).eq("tax_year", tax_year).order("created_at", { ascending: true }),
    supabase.from("tax_maintenance_distributions").select("*").eq("property_id", property_id).order("source_year", { ascending: true }),
  ]);
  const effectiveTaxSettings = taxSettings?.[0] ?? null;

  // Load existing tax_data row (für Existing- vs. New-Branch)
  const { data: existing } = await supabase
    .from("tax_data")
    .select("*")
    .eq("property_id", property_id)
    .eq("tax_year", tax_year)
    .single();

  // ── NKA-Umlagen für Anti-Doppelbuchung laden ───────────────────────────────
  // Lädt alle nka_kostenpositionen, deren NKA-Periode (property_id, tax_year)
  // genau zum aktuellen tax_year passt. Wenn es für das Jahr gar keine NKA-
  // Periode gibt, ist `nkaUmlagen` leer und die Pipeline verhält sich wie zuvor.
  const { data: nkaPeriodsForYear } = await supabase
    .from("nka_perioden")
    .select("id, tax_year")
    .eq("property_id", property_id)
    .eq("tax_year", tax_year);

  let nkaUmlagen: CalculatePipelineNkaUmlage[] = [];
  const nkaPeriodIds = (nkaPeriodsForYear ?? [])
    .map((p: { id: string }) => p.id)
    .filter(Boolean);
  if (nkaPeriodIds.length > 0) {
    const { data: nkaCostItems } = await supabase
      .from("nka_kostenpositionen")
      .select("transaction_id, position, brutto_cents, umlagefaehig_pct")
      .in("period_id", nkaPeriodIds);
    nkaUmlagen = (nkaCostItems ?? []).map(
      (r: {
        transaction_id: string | null;
        position: BetrkvPosition;
        brutto_cents: number | string;
        umlagefaehig_pct: number | string;
      }) => {
        const brutto = Math.round(Number(r.brutto_cents ?? 0));
        const pct = Number(r.umlagefaehig_pct ?? 0);
        const umlagefaehig = Math.round((brutto * pct) / 100);
        return {
          transaction_id: r.transaction_id ?? null,
          position: r.position,
          brutto_cents: brutto,
          umlagefaehig_cents: umlagefaehig,
          period_year: tax_year,
        } satisfies CalculatePipelineNkaUmlage;
      },
    );
  }

  // ── Pure pipeline: keine DB-Zugriffe, deterministisch ─────────────────────
  const pipeline = runCalculatePipeline({
    property: {
      id: prop.id,
      name: prop.name ?? null,
      kaufpreis: prop.kaufpreis,
      gebaeudewert: prop.gebaeudewert,
      grundwert: prop.grundwert,
      inventarwert: prop.inventarwert,
      baujahr: prop.baujahr,
      afa_satz: prop.afa_satz,
      afa_jahresbetrag: prop.afa_jahresbetrag,
      kaufdatum: prop.kaufdatum,
      address: prop.address ?? null,
      type: prop.type ?? null,
    },
    transactions: (txData ?? []) as TaxCalculationTransaction[],
    paymentMatches,
    categories: ((categories ?? []) as CalculatePipelineDbCategory[]),
    gbrSettings: gbrSettings ?? null,
    taxSettings: effectiveTaxSettings,
    depreciationItems: (depreciationItems ?? []) as TaxDepreciationItem[],
    maintenanceDistributions: (maintenanceItems ?? []) as TaxMaintenanceDistributionItem[],
    existingTaxData: (existing ?? null) as TaxData | null,
    taxYear: tax_year,
    nkaUmlagen,
  });

  if (existing) {
    // Ein expliziter Recalculate soll den berechneten Snapshot vollständig erneuern,
    // statt alte importierte/manuelle Feldwerte still mitzuschleppen.
    const updates: Record<string, unknown> = {
      ...pipeline.calculated,
      import_source: "calculated",
      updated_at: new Date().toISOString(),
    };
    delete updates.tax_year;

    const { data, error } = await supabase
      .from("tax_data")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ── Structured Data (Instandhaltungsverteilungen + AfA-Posten) persistieren ─
    let finalData = data as TaxData;

    if (Object.keys(pipeline.structuredPatch).length > 0 && finalData.id) {
      const { data: patched } = await supabase
        .from("tax_data")
        .update(pipeline.structuredPatch)
        .eq("id", finalData.id)
        .select()
        .single();
      if (patched) finalData = patched as TaxData;
    }

    if (finalData.id) {
      const { data: patchedConfidence } = await supabase
        .from("tax_data")
        .update({ import_confidence: pipeline.nextImportConfidence })
        .eq("id", finalData.id)
        .select()
        .single();
      if (patchedConfidence) {
        finalData = patchedConfidence as TaxData;
      } else {
        finalData = { ...finalData, import_confidence: pipeline.nextImportConfidence };
      }
    } else {
      finalData = { ...finalData, import_confidence: pipeline.nextImportConfidence };
    }

    return NextResponse.json({
      ...finalData,
      _engine: {
        status: pipeline.engine.status,
        filing_profile: pipeline.engine.filing_profile,
        blocking_errors: pipeline.engine.blocking_errors,
        review_flags: pipeline.engine.review_flags,
      },
      _reconciliation: pipeline.reconciliation,
    });
  }

  // Neuen Eintrag erstellen
  const { data, error } = await supabase
    .from("tax_data")
    .insert({ property_id, ...pipeline.calculated })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Structured Data persistieren ─────────────────────────────────────────────
  let finalData = data as TaxData;

  if (Object.keys(pipeline.structuredPatch).length > 0 && finalData.id) {
    const { data: patched } = await supabase
      .from("tax_data")
      .update(pipeline.structuredPatch)
      .eq("id", finalData.id)
      .select()
      .single();
    if (patched) finalData = patched as TaxData;
  }

  if (finalData.id) {
    const { data: patchedConfidence } = await supabase
      .from("tax_data")
      .update({ import_confidence: pipeline.nextImportConfidence })
      .eq("id", finalData.id)
      .select()
      .single();
    if (patchedConfidence) {
      finalData = patchedConfidence as TaxData;
    } else {
      finalData = { ...finalData, import_confidence: pipeline.nextImportConfidence };
    }
  } else {
    finalData = { ...finalData, import_confidence: pipeline.nextImportConfidence };
  }

  return NextResponse.json({
    ...finalData,
    _engine: {
      status: pipeline.engine.status,
      filing_profile: pipeline.engine.filing_profile,
      blocking_errors: pipeline.engine.blocking_errors,
      review_flags: pipeline.engine.review_flags,
    },
    _reconciliation: pipeline.reconciliation,
  });
}
