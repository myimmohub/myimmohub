/**
 * POST /api/cron/rent-arrears-reminders
 *
 * Lädt aktive Mieter, payment_matches, existing rent_arrears_events,
 * klassifiziert mit `classifyArrears` und versendet Mahnungen via Resend.
 *
 * Auth-Modi:
 *   1. Bearer ${CRON_SECRET}              → User-übergreifend
 *   2. Eingeloggter User (Cookie-basiert) → nur eigene Mieter
 *
 * Ablauf pro Event:
 *   1. Insert in rent_arrears_events mit status='queued'
 *   2. resend.emails.send(...)
 *   3. Update status='sent' + resend_message_id ODER status='failed' + detail
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Resend } from "resend";
import {
  classifyArrears,
  type ArrearsTenant,
  type ArrearsPayment,
  type ArrearsExistingEvent,
} from "@/lib/tenants/classifyArrears";
import { buildArrearsPayload } from "@/lib/tenants/buildArrearsPayload";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

type TenantRow = {
  id: string;
  unit_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  cold_rent_cents: number;
  additional_costs_cents: number | null;
  lease_start: string;
  lease_end: string | null;
  status: "active" | "notice_given" | "ended";
  units?: {
    id: string;
    label: string;
    property_id: string;
    properties?: {
      id: string;
      user_id: string;
      name: string | null;
      address: string | null;
    } | null;
  } | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function periodMonthOf(periodMonth: unknown): string | null {
  if (typeof periodMonth !== "string") return null;
  // payment_matches.period_month ist DATE → 'yyyy-mm-dd'
  if (/^\d{4}-\d{2}-\d{2}/.test(periodMonth)) return periodMonth.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(periodMonth)) return periodMonth;
  return null;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const isCronCall = Boolean(CRON_SECRET) && authHeader === `Bearer ${CRON_SECRET}`;

  if (!isCronCall && CRON_SECRET && authHeader && authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) =>
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        ),
    },
  });

  let userId: string | null = null;
  if (!isCronCall) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    userId = user.id;
  }

  // Tenants laden mit unit + property.
  const { data: tenantsRaw, error: tenantsErr } = await supabase
    .from("tenants")
    .select(
      "id, unit_id, first_name, last_name, email, cold_rent_cents, additional_costs_cents, lease_start, lease_end, status, units!tenants_unit_id_fkey(id, label, property_id, properties(id, user_id, name, address))",
    )
    .in("status", ["active", "notice_given"]);
  if (tenantsErr) {
    return NextResponse.json({ error: tenantsErr.message }, { status: 500 });
  }

  let allTenants = (tenantsRaw ?? []) as unknown as TenantRow[];
  if (!isCronCall && userId) {
    allTenants = allTenants.filter(
      (t) => t.units?.properties?.user_id === userId,
    );
  }

  if (allTenants.length === 0) {
    return NextResponse.json({
      tenants_evaluated: 0,
      events_created: 0,
      events_sent: 0,
      events_failed: 0,
      errors: [],
    });
  }

  const tenantIds = allTenants.map((t) => t.id);

  // Payments laden (confirmed/auto_matched).
  const { data: paymentsRaw } = await supabase
    .from("payment_matches")
    .select("tenant_id, period_month, amount_cents, status, transactions(amount_cents)")
    .in("tenant_id", tenantIds)
    .in("status", ["confirmed", "auto_matched"]);

  // payment_matches hat keine eigene amount_cents-Spalte (siehe Schema) →
  // wir nehmen sie aus transactions.amount_cents (negative für Eingänge?
  // Nein, wir nutzen Math.abs).
  type PaymentRowRaw = {
    tenant_id: string | null;
    period_month: unknown;
    amount_cents?: number | null;
    transactions?: { amount_cents: number } | null;
  };
  const payments: ArrearsPayment[] = [];
  for (const r of (paymentsRaw ?? []) as unknown as PaymentRowRaw[]) {
    if (!r.tenant_id) continue;
    const month = periodMonthOf(r.period_month);
    if (!month) continue;
    const cents =
      r.amount_cents ??
      (r.transactions?.amount_cents != null
        ? Math.abs(r.transactions.amount_cents)
        : null);
    if (cents == null) continue;
    payments.push({
      tenant_id: r.tenant_id,
      period_month: month,
      amount_cents: Math.abs(cents),
    });
  }

  // Existing events laden.
  const { data: existingRaw } = await supabase
    .from("rent_arrears_events")
    .select("tenant_id, arrear_month, level, status")
    .in("tenant_id", tenantIds);
  const existing_events = (existingRaw ?? []) as ArrearsExistingEvent[];

  // Build classifyArrears input (mapping → ArrearsTenant).
  const input_tenants: ArrearsTenant[] = allTenants.map((t) => ({
    id: t.id,
    property_id: t.units?.property_id ?? "",
    cold_rent_cents: t.cold_rent_cents,
    additional_costs_cents: t.additional_costs_cents ?? 0,
    lease_start: t.lease_start,
    lease_end: t.lease_end,
    status: t.status,
  }));

  const asOfDate = todayIso();
  const result = classifyArrears({
    tenants: input_tenants,
    payments,
    existing_events,
    asOfDate,
  });

  const tenantById = new Map<string, TenantRow>();
  for (const t of allTenants) tenantById.set(t.id, t);

  // Resend-Setup
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromDomain = process.env.RESEND_FROM_DOMAIN ?? "myimmohub.com";
  const resend = resendApiKey ? new Resend(resendApiKey) : null;

  let eventsCreated = 0;
  let eventsSent = 0;
  let eventsFailed = 0;
  const errors: Array<{ tenant_id: string; message: string }> = [];

  for (const ev of result.events_to_create) {
    const tenant = tenantById.get(ev.tenant_id);
    if (!tenant || !tenant.units) {
      errors.push({ tenant_id: ev.tenant_id, message: "Mieter/Unit nicht auflösbar." });
      continue;
    }
    if (!tenant.email) {
      errors.push({ tenant_id: ev.tenant_id, message: "Mieter ohne E-Mail." });
      continue;
    }
    const property = tenant.units.properties;
    if (!property) {
      errors.push({ tenant_id: ev.tenant_id, message: "Property nicht auflösbar." });
      continue;
    }

    // Insert queued
    const { data: inserted, error: insErr } = await supabase
      .from("rent_arrears_events")
      .insert({
        property_id: ev.property_id,
        tenant_id: ev.tenant_id,
        event_date: asOfDate,
        arrear_month: ev.arrear_month,
        arrear_amount_cents: ev.arrear_amount_cents,
        level: ev.level,
        status: "queued",
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      errors.push({
        tenant_id: ev.tenant_id,
        message: insErr?.message ?? "Insert fehlgeschlagen.",
      });
      continue;
    }
    eventsCreated += 1;

    if (!resend) {
      // Kein API-Key → markieren als failed.
      await supabase
        .from("rent_arrears_events")
        .update({ status: "failed", status_detail: "RESEND_API_KEY fehlt." })
        .eq("id", inserted.id);
      eventsFailed += 1;
      errors.push({
        tenant_id: ev.tenant_id,
        message: "RESEND_API_KEY fehlt — Mahnung nicht versendet.",
      });
      continue;
    }

    const payload = buildArrearsPayload({
      property: { name: property.name ?? "Vermieter", address: property.address ?? null },
      tenant: {
        first_name: tenant.first_name,
        last_name: tenant.last_name ?? "",
        email: tenant.email,
      },
      unit: { label: tenant.units.label },
      arrear: {
        arrear_month: ev.arrear_month,
        amount_cents: ev.arrear_amount_cents,
      },
      level: ev.level,
    });

    try {
      const sendResult = await resend.emails.send({
        from: `ImmoHub <no-reply@${fromDomain}>`,
        to: [payload.recipient_email],
        subject: payload.subject,
        text: payload.body_text,
        html: payload.body_html,
      });
      if (sendResult.error) {
        await supabase
          .from("rent_arrears_events")
          .update({
            status: "failed",
            status_detail: sendResult.error.message,
          })
          .eq("id", inserted.id);
        eventsFailed += 1;
        errors.push({ tenant_id: ev.tenant_id, message: sendResult.error.message });
        continue;
      }
      const messageId = sendResult.data?.id ?? null;
      await supabase
        .from("rent_arrears_events")
        .update({
          status: "sent",
          resend_message_id: messageId,
          sent_at: new Date().toISOString(),
        })
        .eq("id", inserted.id);
      eventsSent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
      await supabase
        .from("rent_arrears_events")
        .update({ status: "failed", status_detail: message })
        .eq("id", inserted.id);
      eventsFailed += 1;
      errors.push({ tenant_id: ev.tenant_id, message });
    }
  }

  return NextResponse.json({
    tenants_evaluated: allTenants.length,
    events_created: eventsCreated,
    events_sent: eventsSent,
    events_failed: eventsFailed,
    skipped: result.skipped.length,
    errors,
  });
}
