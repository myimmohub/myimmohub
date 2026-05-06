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

type RouteParams = { params: Promise<{ id: string }> };

async function verifyTenantOwnership(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, userId: string) {
  const { data } = await supabase
    .from("tenants")
    .select(
      `
      id,
      status,
      lease_end,
      unit_id,
      units!tenants_unit_id_fkey (
        id,
        property_id,
        properties!inner(user_id)
      )
    `,
    )
    .eq("id", tenantId)
    .single();

  if (!data) return null;

  const unit = Array.isArray(data.units) ? data.units[0] : data.units;
  const rawProp = unit ? (unit as Record<string, unknown>).properties : null;
  const property = Array.isArray(rawProp) ? (rawProp as { user_id: string }[])[0] : (rawProp as { user_id: string } | null);

  if (property?.user_id !== userId) return null;

  return data;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    const tenant = await verifyTenantOwnership(supabase, id, user.id);
    if (!tenant) return NextResponse.json({ error: "Mieter nicht gefunden." }, { status: 404 });

    const { data, error } = await supabase
      .from("tenants")
      .select(
        `
        *,
        units!tenants_unit_id_fkey (
          id,
          label,
          unit_type,
          floor,
          area_sqm,
          property_id
        )
      `,
      )
      .eq("id", id)
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    const existing = await verifyTenantOwnership(supabase, id, user.id);
    if (!existing) return NextResponse.json({ error: "Mieter nicht gefunden oder kein Zugriff." }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;

    // Prevent changing immutable fields
    delete body.id;
    delete body.unit_id;
    delete body.created_at;

    // Auto-set lease_end to today if status changes to 'ended' and no lease_end is set
    if (body.status === "ended" && !body.lease_end && !existing.lease_end) {
      const today = new Date().toISOString().slice(0, 10);
      body.lease_end = today;
    }

    // Constraint-Check: wenn das PATCH den Mieter in den Zustand
    // (status=active, lease_end=null) versetzt, prüfen wir auf Kollisionen.
    const willBeStatus = (body.status as string | undefined) ?? existing.status;
    const willBeLeaseEnd =
      "lease_end" in body
        ? (body.lease_end as string | null | undefined) ?? null
        : (existing.lease_end as string | null);
    const wasActive = existing.status === "active" && existing.lease_end === null;
    const willBeActive = willBeStatus === "active" && willBeLeaseEnd === null;

    if (!wasActive && willBeActive) {
      const { data: blocking } = await supabase
        .from("tenants")
        .select("id, first_name, last_name")
        .eq("unit_id", existing.unit_id as string)
        .eq("status", "active")
        .is("lease_end", null)
        .neq("id", id);
      if (blocking && blocking.length > 0) {
        const b = blocking[0] as { first_name: string; last_name: string };
        return NextResponse.json(
          {
            error: `Diese Einheit hat bereits einen aktiven Mieter ohne lease_end (${b.first_name} ${b.last_name}). Bitte erst den vorigen Mieter beenden oder ein lease_end setzen.`,
          },
          { status: 409 },
        );
      }
    }

    const { data, error } = await supabase
      .from("tenants")
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

export async function DELETE() {
  return NextResponse.json(
    {
      error:
        "Löschen von Mietern ist nicht erlaubt. Bitte den Status auf 'ended' setzen (PATCH status=ended), um das Mietverhältnis zu beenden.",
    },
    { status: 405 },
  );
}
