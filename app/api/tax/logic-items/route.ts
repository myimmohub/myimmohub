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

  return NextResponse.json({
    depreciation_items: depreciationItems ?? [],
    maintenance_distributions: (maintenanceItems ?? []).filter((item) => isDistributionActiveForYear(item, taxYear)),
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

    const { data, error } = payload.id
      ? await supabase.from("tax_depreciation_items").update(payload).eq("id", payload.id).select().single()
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

  const { data, error } = payload.id
    ? await supabase.from("tax_maintenance_distributions").update(payload).eq("id", payload.id).select().single()
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
