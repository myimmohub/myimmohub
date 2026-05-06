/**
 * GET /api/nka/periods/[id]/pdf/[tenantId]
 *
 * Liefert ein einseitiges PDF mit der Nebenkostenabrechnung für genau einen
 * Mieter einer Periode. Voraussetzung: `nka_mieteranteile` für diese
 * (period_id, tenant_id) muss bereits existieren — d.h. die Periode ist
 * verteilt (`status = distributed`).
 *
 * Auth: Cookie-Client; Authorization über properties.user_id = auth.uid().
 *
 * PDF-Lib-Wahl: pdf-lib (siehe Header in lib/nka/pdf.ts).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { uuidSchema } from "@/lib/nka/requestSchemas";
import { buildNkaPdfRenderData, renderNkaPdf } from "@/lib/nka/pdf";
import type { NkaShareLine } from "@/lib/nka/distribute";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

type PeriodRow = {
  id: string;
  property_id: string;
  period_start: string;
  period_end: string;
};

type PropertyRow = {
  id: string;
  name: string | null;
  address: string | null;
};

type TenantRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  // Aktuell speichern wir keine Adresse direkt am tenant; falls es sie gibt,
  // wird sie hier null und der PDF zeigt nur den Namen.
};

type AnteileRow = {
  id: string;
  total_share_cents: number;
  total_paid_advance_cents: number;
  active_days: number;
  breakdown: NkaShareLine[];
};

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; tenantId: string }> },
) {
  const { id, tenantId } = await ctx.params;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "id muss eine UUID sein." },
      { status: 400 },
    );
  }
  if (!uuidSchema.safeParse(tenantId).success) {
    return NextResponse.json(
      { error: "tenantId muss eine UUID sein." },
      { status: 400 },
    );
  }

  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  // Periode laden (für ownership + Zeitraum)
  const { data: period } = await supabase
    .from("nka_perioden")
    .select("id, property_id, period_start, period_end")
    .eq("id", id)
    .maybeSingle<PeriodRow>();
  if (!period) {
    return NextResponse.json(
      { error: "Periode nicht gefunden." },
      { status: 404 },
    );
  }

  // Property + Ownership-Check
  const { data: property } = await supabase
    .from("properties")
    .select("id, name, address")
    .eq("id", period.property_id)
    .eq("user_id", user.id)
    .maybeSingle<PropertyRow>();
  if (!property) {
    return NextResponse.json(
      { error: "Periode nicht gefunden." },
      { status: 404 },
    );
  }

  // Tenant
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, first_name, last_name")
    .eq("id", tenantId)
    .maybeSingle<TenantRow>();
  if (!tenant) {
    return NextResponse.json(
      { error: "Mieter nicht gefunden." },
      { status: 404 },
    );
  }

  // Mieteranteile für diese (period, tenant)
  const { data: anteile } = await supabase
    .from("nka_mieteranteile")
    .select("id, total_share_cents, total_paid_advance_cents, active_days, breakdown")
    .eq("period_id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle<AnteileRow>();
  if (!anteile) {
    return NextResponse.json(
      { error: "Mieteranteil nicht gefunden. Bitte zuerst die Verteilung berechnen." },
      { status: 404 },
    );
  }

  const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ").trim() || "Mieter";
  // Datum aus DB-Logik nehmen (period_end), nicht new Date(), damit das PDF
  // deterministisch ist und in Tests stabil bleibt.
  const datum_iso = period.period_end;

  const renderData = buildNkaPdfRenderData({
    property: { name: property.name, address: property.address },
    tenant: { name: tenantName, address: null },
    period: { period_start: period.period_start, period_end: period.period_end },
    breakdown: Array.isArray(anteile.breakdown) ? anteile.breakdown : [],
    total_share_cents: Number(anteile.total_share_cents ?? 0),
    total_paid_advance_cents: Number(anteile.total_paid_advance_cents ?? 0),
    active_days: Number(anteile.active_days ?? 0),
    ort: (property.address ?? "").split(",").slice(-1)[0]?.trim() || "",
    datum_iso,
  });

  const pdfBytes = await renderNkaPdf(renderData);

  const filename = `nka-${period.period_start}-${period.period_end}-${tenantName.replace(/\s+/g, "_")}.pdf`;

  // Uint8Array → ArrayBuffer-Slice, weil die Web-Streams-Body-Typen kein
  // generisches Uint8Array akzeptieren (nur ArrayBuffer, Blob, ReadableStream).
  const ab = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength,
  ) as ArrayBuffer;

  return new Response(ab, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
