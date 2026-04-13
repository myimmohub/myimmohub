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

/**
 * Slugify a unit label for use in a payment reference.
 * Replaces German umlauts, strips non-alphanumeric characters, collapses spaces to dashes.
 */
function slugifyLabel(label: string): string {
  return label
    .replace(/ä/gi, "ae")
    .replace(/ö/gi, "oe")
    .replace(/ü/gi, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase()
    .slice(0, 20);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const property_id = searchParams.get("property_id");
    const status = searchParams.get("status");

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

    let query = supabase
      .from("tenants")
      .select(
        `
        *,
        unit:units!tenants_unit_id_fkey (
          id,
          label,
          unit_type,
          floor,
          area_sqm,
          property_id
        )
      `,
      )
      .eq("unit.property_id", property_id);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Filter out tenants whose unit doesn't belong to the property.
    // PostgREST may not honour the .eq("unit.property_id", …) filter on aliased joins,
    // so we enforce the ownership check here in JS as well.
    const filtered = (data ?? []).filter(
      (t) => t.unit !== null && (t.unit as { property_id: string }).property_id === property_id,
    );
    return NextResponse.json(filtered);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CreateTenantBody = {
  unit_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  lease_start: string;
  lease_end?: string;
  cold_rent_cents: number;
  additional_costs_cents?: number;
  deposit_cents?: number;
  rent_type?: string;
  payment_reference?: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    const body = (await request.json()) as CreateTenantBody;
    const { unit_id, first_name, last_name, lease_start, cold_rent_cents } = body;

    if (!unit_id || !first_name || !last_name || !lease_start || cold_rent_cents === undefined) {
      return NextResponse.json(
        { error: "Pflichtfelder fehlen: unit_id, first_name, last_name, lease_start, cold_rent_cents." },
        { status: 400 },
      );
    }

    // Verify ownership: unit must belong to a property owned by the user
    const { data: unit } = await supabase
      .from("units")
      .select("id, label, property_id, properties!inner(user_id)")
      .eq("id", unit_id)
      .single();

    if (!unit) {
      return NextResponse.json({ error: "Einheit nicht gefunden." }, { status: 404 });
    }

    const propertyOwner = Array.isArray(unit.properties)
      ? (unit.properties[0] as { user_id: string })
      : (unit.properties as { user_id: string } | null);

    if (propertyOwner?.user_id !== user.id) {
      return NextResponse.json({ error: "Kein Zugriff auf diese Einheit." }, { status: 403 });
    }

    // Auto-generate payment_reference if not provided
    let payment_reference = body.payment_reference;
    if (!payment_reference) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const slug = slugifyLabel(unit.label ?? unit_id.slice(0, 8));
      payment_reference = `Miete/${slug}/${yyyy}-${mm}`;
    }

    const insertData = {
      unit_id,
      first_name,
      last_name,
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      lease_start,
      ...(body.lease_end !== undefined && { lease_end: body.lease_end }),
      cold_rent_cents,
      ...(body.additional_costs_cents !== undefined && { additional_costs_cents: body.additional_costs_cents }),
      ...(body.deposit_cents !== undefined && { deposit_cents: body.deposit_cents }),
      ...(body.rent_type !== undefined && { rent_type: body.rent_type }),
      payment_reference,
      status: "active",
    };

    const { data, error } = await supabase.from("tenants").insert(insertData).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
