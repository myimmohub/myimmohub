/**
 * /api/nka/periods/[id]/versand
 *
 * POST → Versand der Nebenkosten-PDFs an Mieter über Resend.
 *        Idempotenz: pro (period_id, tenant_id) max. ein Versand mit Status
 *        ∈ ('sent','delivered'). Re-Send via Header `X-Force-Resend: true`.
 *        Body: { tenant_ids: string[]; dry_run?: boolean }
 *
 * GET  → Liste der Versand-Records für diese Periode (mit Tenant-Joins).
 *
 * Auth: Cookie-Client. Ownership über properties.user_id.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { Resend } from "resend";
import { uuidSchema } from "@/lib/nka/requestSchemas";
import { buildVersandPayload } from "@/lib/nka/buildVersandPayload";
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

const versandPostSchema = z.object({
  tenant_ids: z.array(uuidSchema).min(1, "tenant_ids darf nicht leer sein"),
  dry_run: z.boolean().optional().default(false),
});

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
  unit_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};
type UnitRow = { id: string; label: string };
type AnteileRow = {
  total_share_cents: number;
  total_paid_advance_cents: number;
  balance_cents: number;
  active_days: number;
  breakdown: NkaShareLine[];
};
type VersandRow = {
  id: string;
  status: string;
  resend_message_id: string | null;
};

type ResultEntry = {
  tenant_id: string;
  status: "sent" | "queued" | "failed" | "skipped" | "preview";
  error?: string;
  message_id?: string;
  preview?: { recipient_email: string; subject: string; body_text: string };
};

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "id muss eine UUID sein." },
      { status: 400 },
    );
  }

  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  // Period + Ownership
  const { data: period } = await supabase
    .from("nka_perioden")
    .select("id, property_id")
    .eq("id", id)
    .maybeSingle<{ id: string; property_id: string }>();
  if (!period) {
    return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });
  }
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", period.property_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!property) {
    return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("nka_versand")
    .select("*")
    .eq("period_id", id)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ versand: data ?? [] });
}

// ─── POST ───────────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "id muss eine UUID sein." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiges JSON im Request-Body." },
      { status: 400 },
    );
  }
  const parsed = versandPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültiger Request-Body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { tenant_ids: tenantIds, dry_run: dryRun } = parsed.data;
  const forceResend = request.headers.get("x-force-resend") === "true";

  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  // ── Period + Property + Ownership ────────────────────────────────────────
  const { data: period } = await supabase
    .from("nka_perioden")
    .select("id, property_id, period_start, period_end")
    .eq("id", id)
    .maybeSingle<PeriodRow>();
  if (!period) {
    return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });
  }
  const { data: property } = await supabase
    .from("properties")
    .select("id, name, address")
    .eq("id", period.property_id)
    .eq("user_id", user.id)
    .maybeSingle<PropertyRow>();
  if (!property) {
    return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });
  }

  const propertyName = property.name ?? "Vermieter";

  // ── Tenants (mit Email & Unit) ───────────────────────────────────────────
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, unit_id, first_name, last_name, email")
    .in("id", tenantIds)
    .returns<TenantRow[]>();
  const tenantById = new Map<string, TenantRow>();
  for (const t of tenants ?? []) tenantById.set(t.id, t);

  const unitIds = Array.from(
    new Set((tenants ?? []).map((t) => t.unit_id).filter(Boolean)),
  );
  const { data: units } = await supabase
    .from("units")
    .select("id, label")
    .in("id", unitIds)
    .returns<UnitRow[]>();
  const unitById = new Map<string, UnitRow>();
  for (const u of units ?? []) unitById.set(u.id, u);

  // ── Mieteranteile + bestehende Versand-Records ───────────────────────────
  const { data: anteile } = await supabase
    .from("nka_mieteranteile")
    .select(
      "tenant_id, total_share_cents, total_paid_advance_cents, balance_cents, active_days, breakdown",
    )
    .eq("period_id", id)
    .in("tenant_id", tenantIds)
    .returns<(AnteileRow & { tenant_id: string })[]>();
  const anteilByTenant = new Map<string, AnteileRow>();
  for (const a of anteile ?? []) anteilByTenant.set(a.tenant_id, a);

  const { data: existingVersand } = await supabase
    .from("nka_versand")
    .select("id, tenant_id, status, resend_message_id")
    .eq("period_id", id)
    .in("tenant_id", tenantIds)
    .returns<(VersandRow & { tenant_id: string })[]>();
  const versandByTenant = new Map<string, VersandRow>();
  for (const v of existingVersand ?? []) versandByTenant.set(v.tenant_id, v);

  // ── Resend client (nur wenn !dryRun) ──────────────────────────────────────
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromDomain = process.env.RESEND_FROM_DOMAIN ?? "myimmohub.com";
  const resend = !dryRun && resendApiKey ? new Resend(resendApiKey) : null;

  const results: ResultEntry[] = [];

  for (const tid of tenantIds) {
    const tenant = tenantById.get(tid);
    if (!tenant) {
      results.push({ tenant_id: tid, status: "failed", error: "Mieter nicht gefunden." });
      continue;
    }
    if (!tenant.email) {
      results.push({ tenant_id: tid, status: "failed", error: "Mieter hat keine E-Mail-Adresse." });
      continue;
    }
    const unit = unitById.get(tenant.unit_id);
    if (!unit) {
      results.push({ tenant_id: tid, status: "failed", error: "Wohneinheit nicht gefunden." });
      continue;
    }
    const anteil = anteilByTenant.get(tid);
    if (!anteil) {
      results.push({
        tenant_id: tid,
        status: "failed",
        error: "Kein Mieteranteil gefunden — bitte zuerst Verteilung berechnen.",
      });
      continue;
    }

    // Idempotenz-Check
    const existing = versandByTenant.get(tid);
    if (
      existing &&
      (existing.status === "sent" || existing.status === "delivered") &&
      !forceResend
    ) {
      if (dryRun) {
        // Im dry_run nur skip-Info zurückgeben, keinen Fehler.
        results.push({
          tenant_id: tid,
          status: "skipped",
          error: "Bereits versendet (X-Force-Resend nutzen, um erneut zu senden).",
        });
        continue;
      }
      // Hard 409 erst, wenn keine anderen Tenants betroffen — wir geben pro
      // Mieter ein eigenes Result-Objekt zurück, damit Bulk-Aufrufe nicht
      // komplett scheitern. Der HTTP-Status wird unten berechnet.
      results.push({
        tenant_id: tid,
        status: "skipped",
        error: "Bereits versendet (Header X-Force-Resend: true setzen, um erneut zu senden).",
      });
      continue;
    }

    // Payload bauen
    const payload = buildVersandPayload({
      property: { name: propertyName, address: property.address ?? null },
      period: {
        period_start: period.period_start,
        period_end: period.period_end,
      },
      tenant: {
        first_name: tenant.first_name,
        last_name: tenant.last_name ?? "",
        email: tenant.email,
      },
      unit: { label: unit.label },
      share: {
        total_share_cents: Number(anteil.total_share_cents ?? 0),
        total_paid_advance_cents: Number(anteil.total_paid_advance_cents ?? 0),
        balance_cents: Number(anteil.balance_cents ?? 0),
      },
    });

    if (dryRun) {
      results.push({
        tenant_id: tid,
        status: "preview",
        preview: {
          recipient_email: payload.recipient_email,
          subject: payload.subject,
          body_text: payload.body_text,
        },
      });
      continue;
    }

    // PDF rendern
    let pdfBytes: Uint8Array;
    try {
      const tenantName =
        [tenant.first_name, tenant.last_name].filter(Boolean).join(" ").trim() ||
        "Mieter";
      const renderData = buildNkaPdfRenderData({
        property: { name: property.name, address: property.address },
        tenant: { name: tenantName, address: null },
        period: {
          period_start: period.period_start,
          period_end: period.period_end,
        },
        breakdown: Array.isArray(anteil.breakdown) ? anteil.breakdown : [],
        total_share_cents: Number(anteil.total_share_cents ?? 0),
        total_paid_advance_cents: Number(anteil.total_paid_advance_cents ?? 0),
        active_days: Number(anteil.active_days ?? 0),
        ort: (property.address ?? "").split(",").slice(-1)[0]?.trim() || "",
        datum_iso: period.period_end,
      });
      pdfBytes = await renderNkaPdf(renderData);
    } catch (err) {
      results.push({
        tenant_id: tid,
        status: "failed",
        error: `PDF-Render-Fehler: ${(err as Error).message}`,
      });
      continue;
    }

    // Versand-Datensatz upsert (queued)
    const { data: versandRow, error: upsertErr } = await supabase
      .from("nka_versand")
      .upsert(
        {
          period_id: id,
          tenant_id: tid,
          property_id: property.id,
          recipient_email: payload.recipient_email,
          subject: payload.subject,
          body_text: payload.body_text,
          status: "queued",
          status_detail: null,
          pdf_size_bytes: pdfBytes.byteLength,
        },
        { onConflict: "period_id,tenant_id" },
      )
      .select("id")
      .single<{ id: string }>();
    if (upsertErr || !versandRow) {
      results.push({
        tenant_id: tid,
        status: "failed",
        error: `DB-Fehler: ${upsertErr?.message ?? "unbekannt"}`,
      });
      continue;
    }

    // Resend-Call
    if (!resend) {
      results.push({
        tenant_id: tid,
        status: "failed",
        error: "RESEND_API_KEY fehlt.",
      });
      continue;
    }

    try {
      const filename = `nka-${period.period_start}_${period.period_end}.pdf`;
      const pdfBuffer = Buffer.from(pdfBytes);
      const sendResult = await resend.emails.send({
        from: `ImmoHub <no-reply@${fromDomain}>`,
        to: [payload.recipient_email],
        subject: payload.subject,
        text: payload.body_text,
        html: payload.body_html,
        attachments: [
          {
            filename,
            content: pdfBuffer,
          },
        ],
      });
      if (sendResult.error) {
        await supabase
          .from("nka_versand")
          .update({
            status: "failed",
            status_detail: sendResult.error.message,
            failed_at: new Date().toISOString(),
          })
          .eq("id", versandRow.id);
        results.push({
          tenant_id: tid,
          status: "failed",
          error: sendResult.error.message,
        });
        continue;
      }
      const messageId = sendResult.data?.id ?? null;
      await supabase
        .from("nka_versand")
        .update({
          status: "sent",
          resend_message_id: messageId,
          sent_at: new Date().toISOString(),
        })
        .eq("id", versandRow.id);
      results.push({
        tenant_id: tid,
        status: "sent",
        message_id: messageId ?? undefined,
      });
    } catch (err) {
      const message = (err as Error).message;
      await supabase
        .from("nka_versand")
        .update({
          status: "failed",
          status_detail: message,
          failed_at: new Date().toISOString(),
        })
        .eq("id", versandRow.id);
      results.push({ tenant_id: tid, status: "failed", error: message });
    }
  }

  // Wenn alle Tenants gescheitert sind, weil sie bereits "sent"/"delivered" sind
  // (und kein Force-Resend), antworten wir mit 409.
  const allSkippedExisting =
    !dryRun &&
    results.length > 0 &&
    results.every(
      (r) =>
        r.status === "skipped" &&
        (r.error?.includes("Bereits versendet") ?? false),
    );
  if (allSkippedExisting) {
    return NextResponse.json(
      {
        error:
          "Für alle angegebenen Mieter existiert bereits ein erfolgreicher Versand. Header X-Force-Resend: true setzen, um erneut zu senden.",
        results,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ results });
}
