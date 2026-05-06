/**
 * POST /api/tenants/[id]/notice
 *   Body: { notice_received_date: string, notice_party: 'tenant'|'landlord', notice_period_months?: number }
 *
 * Setzt die Notice-Felder auf dem Tenant + plant `lease_end` automatisch
 * via `calculateNoticeDeadline` und schaltet den Status auf `notice_given`.
 *
 * Owner-Check: Mieter → unit → property.user_id == auth.uid().
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { calculateNoticeDeadline } from "@/lib/tenants/noticeDeadline";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function makeSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

type RouteParams = { params: Promise<{ id: string }> };

type NoticeBody = {
  notice_received_date: string;
  notice_party: "tenant" | "landlord";
  notice_period_months?: number;
};

function diffYearsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let years = ty - fy;
  if (tm < fm || (tm === fm && td < fd)) years -= 1;
  return Math.max(0, years);
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  let body: NoticeBody;
  try {
    body = (await request.json()) as NoticeBody;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  if (
    !body.notice_received_date ||
    !body.notice_party ||
    (body.notice_party !== "tenant" && body.notice_party !== "landlord")
  ) {
    return NextResponse.json(
      { error: "notice_received_date und notice_party (tenant|landlord) sind Pflicht." },
      { status: 400 },
    );
  }

  // Owner-Check
  const { data: tenant } = await supabase
    .from("tenants")
    .select(
      `id, lease_start, units!tenants_unit_id_fkey(properties!inner(user_id))`,
    )
    .eq("id", id)
    .single();
  if (!tenant) {
    return NextResponse.json({ error: "Mieter nicht gefunden." }, { status: 404 });
  }
  const unit = Array.isArray((tenant as { units?: unknown }).units)
    ? ((tenant as { units: unknown[] }).units[0] as { properties: unknown })
    : ((tenant as { units: unknown }).units as { properties: unknown });
  const props = Array.isArray((unit as { properties: unknown }).properties)
    ? ((unit as { properties: unknown[] }).properties[0] as { user_id: string })
    : ((unit as { properties: unknown }).properties as { user_id: string });
  if (props?.user_id !== user.id) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  const tenantTyped = tenant as { lease_start: string };
  const durationYears = diffYearsBetween(
    tenantTyped.lease_start,
    body.notice_received_date,
  );

  const result = calculateNoticeDeadline({
    notice_received_date: body.notice_received_date,
    notice_party: body.notice_party,
    lease_duration_years: durationYears,
    notice_period_months: body.notice_period_months,
  });

  const { data: updated, error: updErr } = await supabase
    .from("tenants")
    .update({
      notice_received_date: body.notice_received_date,
      notice_party: body.notice_party,
      notice_period_months: result.notice_period_months,
      lease_end: result.lease_end_date,
      status: "notice_given",
    })
    .eq("id", id)
    .select()
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    tenant: updated,
    deadline: result,
  });
}
