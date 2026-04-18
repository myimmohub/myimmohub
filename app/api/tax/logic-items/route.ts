import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isDistributionActiveForYear } from "@/lib/tax/structuredTaxLogic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function getDepreciationSignature(item: {
  property_id: string;
  tax_year: number;
  item_type: string;
  label: string;
  gross_annual_amount: number;
  apply_rental_ratio: boolean;
}) {
  return [
    item.property_id,
    item.tax_year,
    item.item_type,
    String(item.label ?? "").trim().toLocaleLowerCase("de-DE"),
    round2(Number(item.gross_annual_amount ?? 0)),
    item.apply_rental_ratio ? "1" : "0",
  ].join("::");
}

function getMaintenanceSignature(item: {
  property_id: string;
  source_year: number;
  label: string;
  total_amount: number;
  classification: string;
  deduction_mode: string;
  distribution_years: number;
  current_year_share_override: number | null;
  apply_rental_ratio: boolean;
  source_transaction_ids: string[];
}) {
  return [
    item.property_id,
    item.source_year,
    String(item.label ?? "").trim().toLocaleLowerCase("de-DE"),
    round2(Number(item.total_amount ?? 0)),
    item.classification,
    item.deduction_mode,
    item.distribution_years,
    item.current_year_share_override == null ? "" : round2(Number(item.current_year_share_override ?? 0)),
    item.apply_rental_ratio ? "1" : "0",
    (item.source_transaction_ids ?? []).filter(Boolean).slice().sort().join("|"),
  ].join("::");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("property_id");
  const taxYear = Number(searchParams.get("tax_year"));

  if (!propertyId || !taxYear) {
    return NextResponse.json({ error: "property_id und tax_year erforderlich." }, { status: 400 });
  }

  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const [{ data: depreciationItems, error: depreciationError }, { data: maintenanceItems, error: maintenanceError }] = await Promise.all([
    supabase
      .from("tax_depreciation_items")
      .select("*")
      .eq("property_id", propertyId)
      .eq("tax_year", taxYear)
      .order("created_at", { ascending: true }),
    supabase
      .from("tax_maintenance_distributions")
      .select("*")
      .eq("property_id", propertyId)
      .order("source_year", { ascending: true }),
  ]);

  if (depreciationError) return NextResponse.json({ error: depreciationError.message }, { status: 500 });
  if (maintenanceError) return NextResponse.json({ error: maintenanceError.message }, { status: 500 });

  const seenDepreciation = new Set<string>();
  const normalizedDepreciationItems = (depreciationItems ?? []).filter((item) => {
    const signature = getDepreciationSignature(item);
    if (seenDepreciation.has(signature)) return false;
    seenDepreciation.add(signature);
    return true;
  });

  const seenMaintenance = new Set<string>();
  const normalizedMaintenanceItems = (maintenanceItems ?? []).filter((item) => {
    const signature = getMaintenanceSignature({
      property_id: item.property_id,
      source_year: item.source_year,
      label: item.label,
      total_amount: Number(item.total_amount ?? 0),
      classification: item.classification,
      deduction_mode: item.deduction_mode,
      distribution_years: item.distribution_years,
      current_year_share_override: item.current_year_share_override == null ? null : Number(item.current_year_share_override),
      apply_rental_ratio: Boolean(item.apply_rental_ratio),
      source_transaction_ids: Array.isArray(item.source_transaction_ids) ? item.source_transaction_ids.filter(Boolean) : [],
    });
    if (seenMaintenance.has(signature)) return false;
    seenMaintenance.add(signature);
    return true;
  });

  const activeMaintenanceItems = normalizedMaintenanceItems.filter((item) => isDistributionActiveForYear(item, taxYear));
  const linkedTransactionIds = Array.from(new Set(
    activeMaintenanceItems.flatMap((item) => Array.isArray(item.source_transaction_ids) ? item.source_transaction_ids : []),
  ));
  const rangeStart = `${taxYear}-01-01`;
  const rangeEnd = `${taxYear}-12-31`;
  const [
    { data: candidateTransactions, error: candidateTransactionsError },
    { data: linkedTransactions, error: linkedTransactionsError },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, date, amount, description, counterpart, category, is_tax_deductible, anlage_v_zeile")
      .eq("property_id", propertyId)
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .lt("amount", 0)
      .order("date", { ascending: false }),
    linkedTransactionIds.length > 0
      ? supabase
          .from("transactions")
          .select("id, date, amount, description, counterpart, category, is_tax_deductible, anlage_v_zeile")
          .in("id", linkedTransactionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (candidateTransactionsError) return NextResponse.json({ error: candidateTransactionsError.message }, { status: 500 });
  if (linkedTransactionsError) return NextResponse.json({ error: linkedTransactionsError.message }, { status: 500 });

  return NextResponse.json({
    depreciation_items: normalizedDepreciationItems,
    maintenance_distributions: activeMaintenanceItems,
    candidate_transactions: candidateTransactions ?? [],
    linked_transactions: linkedTransactions ?? [],
  });
}

export async function POST(request: Request) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const body = await request.json() as {
    kind: "depreciation" | "maintenance_distribution";
    item: Record<string, unknown>;
  };

  if (!body.kind || !body.item) {
    return NextResponse.json({ error: "kind und item erforderlich." }, { status: 400 });
  }

  if (body.kind === "depreciation") {
    const payload = {
      id: body.item.id as string | undefined,
      property_id: body.item.property_id as string,
      tax_year: Number(body.item.tax_year),
      item_type: body.item.item_type as string,
      label: String(body.item.label ?? ""),
      gross_annual_amount: Number(body.item.gross_annual_amount ?? 0),
      apply_rental_ratio: Boolean(body.item.apply_rental_ratio),
    };

    if (!payload.property_id || !payload.tax_year || !payload.label) {
      return NextResponse.json({ error: "Unvollständige AfA-Position." }, { status: 400 });
    }

    const existingId = payload.id
      ? payload.id
      : (() => undefined)();
    let targetId = existingId;
    if (!targetId) {
      const { data: existingRows } = await supabase
        .from("tax_depreciation_items")
        .select("*")
        .eq("property_id", payload.property_id)
        .eq("tax_year", payload.tax_year);
      const signature = getDepreciationSignature(payload);
      targetId = (existingRows ?? []).find((row) => getDepreciationSignature(row) === signature)?.id;
    }

    const { data, error } = targetId
      ? await supabase.from("tax_depreciation_items").update(payload).eq("id", targetId).select().single()
      : await supabase.from("tax_depreciation_items").insert(payload).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const payload = {
    id: body.item.id as string | undefined,
    property_id: body.item.property_id as string,
    source_year: Number(body.item.source_year),
    label: String(body.item.label ?? ""),
    total_amount: Number(body.item.total_amount ?? 0),
    source_transaction_ids: Array.isArray(body.item.source_transaction_ids)
      ? body.item.source_transaction_ids.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [],
    classification:
      body.item.classification === "production_cost" || body.item.classification === "depreciation"
        ? body.item.classification
        : "maintenance_expense",
    deduction_mode: body.item.deduction_mode === "immediate" ? "immediate" : "distributed",
    distribution_years: Number(body.item.distribution_years ?? 3),
    current_year_share_override:
      body.item.current_year_share_override == null || body.item.current_year_share_override === ""
        ? null
        : Number(body.item.current_year_share_override),
    apply_rental_ratio: Boolean(body.item.apply_rental_ratio),
    status: body.item.status === "completed" ? "completed" : "active",
    note:
      body.item.note == null || body.item.note === ""
        ? null
        : String(body.item.note),
  };

  if (!payload.property_id || !payload.source_year || !payload.label) {
    return NextResponse.json({ error: "Unvollständiger Verteilungsblock." }, { status: 400 });
  }
  if (payload.deduction_mode === "distributed") {
    payload.distribution_years = Math.min(5, Math.max(2, payload.distribution_years));
  } else {
    payload.distribution_years = 1;
  }

  let targetId = payload.id;
  if (!targetId) {
    const { data: existingRows } = await supabase
      .from("tax_maintenance_distributions")
      .select("*")
      .eq("property_id", payload.property_id);
    const signature = getMaintenanceSignature(payload);
    targetId = (existingRows ?? []).find((row) =>
      getMaintenanceSignature({
        property_id: row.property_id,
        source_year: row.source_year,
        label: row.label,
        total_amount: Number(row.total_amount ?? 0),
        classification: row.classification,
        deduction_mode: row.deduction_mode,
        distribution_years: row.distribution_years,
        current_year_share_override: row.current_year_share_override == null ? null : Number(row.current_year_share_override),
        apply_rental_ratio: Boolean(row.apply_rental_ratio),
        source_transaction_ids: Array.isArray(row.source_transaction_ids) ? row.source_transaction_ids.filter(Boolean) : [],
      }) === signature,
    )?.id;
  }

  const { data, error } = targetId
    ? await supabase.from("tax_maintenance_distributions").update(payload).eq("id", targetId).select().single()
    : await supabase.from("tax_maintenance_distributions").insert(payload).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const body = await request.json() as { kind: "depreciation" | "maintenance_distribution"; id: string };
  if (!body.kind || !body.id) {
    return NextResponse.json({ error: "kind und id erforderlich." }, { status: 400 });
  }

  const table = body.kind === "depreciation"
    ? "tax_depreciation_items"
    : "tax_maintenance_distributions";

  const { error } = await supabase.from(table).delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
