/**
 * /api/webhooks/resend
 *
 * Resend liefert Email-Lifecycle-Events (delivered, bounced, complained, ...).
 * Wir mappen sie auf den `status`-Wert von `nka_versand` und aktualisieren
 * die zugehörigen `*_at`-Spalten.
 *
 * Signatur-Validierung: HMAC-SHA256 über den Raw-Body mit
 * `RESEND_WEBHOOK_SECRET`. Resend signiert (Stand 2026) im Standard-Schema
 * `Resend-Signature`. In dieser pragmatischen Variante akzeptieren wir den
 * Header `Resend-Signature` (oder als Fallback `X-Resend-Signature`) als
 * Hex-encoded HMAC-SHA256 des Raw-Bodies und vergleichen timing-safe.
 *
 * Fehlt das Secret → wir lehnen JEDE Anfrage mit 401 ab. Damit ist die Route
 * "fail closed" und kann nicht versehentlich Updates fremder Daten triggern.
 *
 * Idempotenz: 200 OK auch dann, wenn keine passende `nka_versand`-Zeile zur
 * `resend_message_id` gefunden wird — Resend retried sonst ewig.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const RESEND_EVENTS = [
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.failed",
] as const;

const webhookSchema = z.object({
  type: z.enum(RESEND_EVENTS),
  data: z.object({
    email_id: z.string().optional(),
    id: z.string().optional(),
    // Resend liefert teils zusätzlich Bounce-/Complaint-Detail-Felder.
  }).passthrough(),
});

function verifySignature(rawBody: string, headerSig: string | null): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!headerSig) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");
  // headerSig kann mit `sha256=` Präfix kommen — beide Varianten akzeptieren.
  const cleanedHeaderSig = headerSig.replace(/^sha256=/i, "").trim();
  if (cleanedHeaderSig.length !== computed.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(cleanedHeaderSig, "hex"),
      Buffer.from(computed, "hex"),
    );
  } catch {
    return false;
  }
}

function statusFromEvent(eventType: (typeof RESEND_EVENTS)[number]): {
  status: "delivered" | "bounced" | "complained" | "failed";
  timestampField: "delivered_at" | "bounced_at" | "failed_at" | null;
} {
  switch (eventType) {
    case "email.delivered":
      return { status: "delivered", timestampField: "delivered_at" };
    case "email.bounced":
      return { status: "bounced", timestampField: "bounced_at" };
    case "email.complained":
      return { status: "complained", timestampField: null };
    case "email.failed":
      return { status: "failed", timestampField: "failed_at" };
  }
}

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

export async function POST(request: Request) {
  // Raw body lesen (Signatur muss über exakten Bytes des Requests berechnet werden)
  const rawBody = await request.text();

  const sigHeader =
    request.headers.get("resend-signature") ??
    request.headers.get("x-resend-signature");

  if (!verifySignature(rawBody, sigHeader)) {
    return NextResponse.json(
      { error: "Ungültige Signatur." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Ungültiges JSON im Request-Body." },
      { status: 400 },
    );
  }

  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültiger Webhook-Body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const messageId = parsed.data.data.email_id ?? parsed.data.data.id;
  if (!messageId) {
    // Idempotent: ohne ID kein Update möglich, aber Resend nicht ewig retryen lassen.
    return NextResponse.json({ ok: true, note: "no message_id" });
  }

  const { status, timestampField } = statusFromEvent(parsed.data.type);

  const supabase = await getSupabase();
  const update: Record<string, unknown> = { status };
  if (timestampField) update[timestampField] = new Date().toISOString();
  if (status === "failed" || status === "bounced" || status === "complained") {
    update["status_detail"] = parsed.data.type;
  }

  await supabase
    .from("nka_versand")
    .update(update)
    .eq("resend_message_id", messageId);

  // Auch rent_arrears_events updaten — der gleiche Webhook bedient beide
  // Tabellen (NKA-Versand und Mahnwesen). Idempotent: wenn keine passende
  // Zeile vorhanden, ist das ein no-op.
  const arrearsUpdate: Record<string, unknown> = { status };
  if (status === "delivered") {
    arrearsUpdate["delivered_at"] = new Date().toISOString();
  }
  if (status === "failed" || status === "bounced" || status === "complained") {
    arrearsUpdate["status_detail"] = parsed.data.type;
  }
  await supabase
    .from("rent_arrears_events")
    .update(arrearsUpdate)
    .eq("resend_message_id", messageId);

  // Auch ohne match: 200 OK (idempotent, kein Retry nötig).
  return NextResponse.json({ ok: true });
}
