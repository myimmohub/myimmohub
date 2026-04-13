import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function createClient() {
  const cookieStore = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => (cookieStore as unknown as { getAll: () => { name: string; value: string }[] }).getAll(),
    },
  });
}

type RouteParams = { params: Promise<{ id: string }> };

async function verifyUnitOwnership(supabase: ReturnType<typeof createClient>, unitId: string, userId: string) {
  const { data } = await supabase
    .from("units")
    .select("id, property_id, properties!inner(user_id)")
    .eq("id", unitId)
    .single();

  if (!data) return null;

  const property = Array.isArray(data.properties) ? data.properties[0] : data.properties;
  if ((property as { user_id: string } | null)?.user_id !== userId) return null;

  return data;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    const unit = await verifyUnitOwnership(supabase, id, user.id);
    if (!unit) return NextResponse.json({ error: "Einheit nicht gefunden." }, { status: 404 });

    // Load unit with all tenants ordered by lease_start desc
    const { data, error } = await supabase
      .from("units")
      .select(
        `
        *,
        tenants!tenants_unit_id_fkey (
          id,
          first_name,
          last_name,
          email,
          phone,
          status,
          lease_start,
          lease_end,
          cold_rent_cents,
          additional_costs_cents,
          deposit_cents,
          rent_type,
          payment_reference
        )
      `,
      )
      .eq("id", id)
      .order("lease_start", { referencedTable: "tenants", ascending: false })
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    const unit = await verifyUnitOwnership(supabase, id, user.id);
    if (!unit) return NextResponse.json({ error: "Einheit nicht gefunden oder kein Zugriff." }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;

    // Prevent changing property_id
    delete body.id;
    delete body.property_id;
    delete body.created_at;

    const { data, error } = await supabase
      .from("units")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    const unit = await verifyUnitOwnership(supabase, id, user.id);
    if (!unit) return NextResponse.json({ error: "Einheit nicht gefunden oder kein Zugriff." }, { status: 404 });

    // Soft-delete: set is_active = false
    const { data, error } = await supabase
      .from("units")
      .update({ is_active: false })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
