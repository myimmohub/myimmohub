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

export type RentArrearsEntry = {
  property_id: string;
  property_name: string;
  total_tenants: number;
  paid_count: number;
  arrears_count: number;
  total_arrears_cents: number;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month"); // YYYY-MM or null

    const now = new Date();
    const month =
      monthParam ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const monthStart = `${month}-01`;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    // Get all mehrfamilienhaus properties for user
    const { data: properties, error: propError } = await supabase
      .from("properties")
      .select("id, name, type")
      .eq("user_id", user.id)
      .eq("type", "mehrfamilienhaus");

    if (propError) return NextResponse.json({ error: propError.message }, { status: 500 });

    const result: RentArrearsEntry[] = [];

    for (const property of properties ?? []) {
      // Get active/notice_given tenants for this property via units
      const { data: tenants, error: tenantsError } = await supabase
        .from("tenants")
        .select(`
          id,
          cold_rent_cents,
          additional_costs_cents,
          units!tenants_unit_id_fkey (
            id,
            property_id
          )
        `)
        .in("status", ["active", "notice_given"]);

      if (tenantsError) continue;

      type TenantRow = {
        id: string;
        cold_rent_cents: number;
        additional_costs_cents: number | null;
        units: { id: string; property_id: string } | null;
      };

      const propertyTenants = ((tenants ?? []) as unknown as TenantRow[]).filter(
        (t) => t.units?.property_id === property.id,
      );

      if (propertyTenants.length === 0) continue;

      const tenantIds = propertyTenants.map((t) => t.id);

      // Get confirmed/auto_matched matches for those tenants in this month
      const { data: paidMatches } = await supabase
        .from("payment_matches")
        .select("tenant_id")
        .eq("property_id", property.id)
        .in("status", ["confirmed", "auto_matched"])
        .gte("period_month", monthStart)
        .lt("period_month", `${month}-32`);

      const paidTenantIds = new Set(
        ((paidMatches ?? []) as { tenant_id: string }[])
          .map((m) => m.tenant_id)
          .filter(Boolean),
      );

      const paidCount = tenantIds.filter((id) => paidTenantIds.has(id)).length;
      const arrearsCount = tenantIds.length - paidCount;

      // Calculate total arrears in cents
      let totalArrearsCents = 0;
      for (const tenant of propertyTenants) {
        if (!paidTenantIds.has(tenant.id)) {
          totalArrearsCents += tenant.cold_rent_cents + (tenant.additional_costs_cents ?? 0);
        }
      }

      result.push({
        property_id: property.id,
        property_name: property.name,
        total_tenants: tenantIds.length,
        paid_count: paidCount,
        arrears_count: arrearsCount,
        total_arrears_cents: totalArrearsCents,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
