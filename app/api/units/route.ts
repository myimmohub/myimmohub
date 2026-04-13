import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
    },
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const property_id = searchParams.get("property_id");

    if (!property_id) {
      return NextResponse.json({ error: "Query-Parameter 'property_id' fehlt." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    // Verify property belongs to user
    const { data: property } = await supabase
      .from("properties")
      .select("id")
      .eq("id", property_id)
      .eq("user_id", user.id)
      .single();

    if (!property) {
      return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 404 });
    }

    // Load units with active/notice_given tenants
    const { data: units, error } = await supabase
      .from("units")
      .select(
        `
        *,
        tenants!tenants_unit_id_fkey (
          id,
          first_name,
          last_name,
          email,
          status,
          lease_start,
          lease_end,
          cold_rent_cents,
          additional_costs_cents
        )
      `,
      )
      .eq("property_id", property_id)
      .order("label");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Compute active_tenant for each unit
    const unitsWithActiveTenant = (units ?? []).map((unit) => {
      const activeTenants: Array<{ status: string; [key: string]: unknown }> = (unit.tenants ?? []).filter(
        (t: { status: string }) => t.status === "active" || t.status === "notice_given",
      );
      const active_tenant = activeTenants.length > 0 ? activeTenants[0] : null;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tenants: _tenants, ...unitFields } = unit;
      return { ...unitFields, active_tenant };
    });

    return NextResponse.json(unitsWithActiveTenant);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CreateUnitBody = {
  property_id: string;
  label: string;
  unit_type: string;
  floor?: number;
  area_sqm?: number;
  rooms?: number;
  features?: Record<string, unknown>;
  vat_liable?: boolean;
  is_active?: boolean;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    const body = (await request.json()) as CreateUnitBody;
    const { property_id, label, unit_type } = body;

    if (!property_id || !label || !unit_type) {
      return NextResponse.json(
        { error: "Pflichtfelder fehlen: property_id, label, unit_type." },
        { status: 400 },
      );
    }

    // Verify property belongs to user
    const { data: property } = await supabase
      .from("properties")
      .select("id")
      .eq("id", property_id)
      .eq("user_id", user.id)
      .single();

    if (!property) {
      return NextResponse.json({ error: "Immobilie nicht gefunden oder kein Zugriff." }, { status: 403 });
    }

    const insertData = {
      property_id,
      label,
      unit_type,
      ...(body.floor !== undefined && { floor: body.floor }),
      ...(body.area_sqm !== undefined && { area_sqm: body.area_sqm }),
      ...(body.rooms !== undefined && { rooms: body.rooms }),
      ...(body.features !== undefined && { features: body.features }),
      ...(body.vat_liable !== undefined && { vat_liable: body.vat_liable }),
      is_active: body.is_active ?? true,
    };

    const { data, error } = await supabase.from("units").insert(insertData).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
