/**
 * /api/webhooks/resend
 *
 * Resend liefert Email-Lifecycle-Events (delivered, bounced, complained, ...).
 * Wir mappen sie auf den `status`-Wert von `nka_versand` und aktualisieren
 * die zugehörigen `*_at`-Spalten.
 *
 * Signatur-Validierung: Svix-Schema (Resend-Default seit 2024).
 * Drei Header werden erwartet:
 *   - svix-id          eindeutige Message-ID
 *   - svix-timestamp   Unix-Zeit (Sekunden)
 *   - svix-signature   space-separated Liste "v1,<base64sig>"
 *
 * Die `Webhook.verify()`-Methode der svix-Lib prüft Signatur, Timestamp-Drift
 * (max 5 min) und Replay-Schutz in einem Schritt. Bei Fehler wirft sie eine
 * `WebhookVerificationError` → wir antworten mit 401.
 *
 * `RESEND_WEBHOOK_SECRET` muss exakt das `whsec_...`-Secret aus dem
 * Resend-Dashboard sein. Fehlt es → 401 (fail-closed).
 *
 * Idempotenz: 200 OK auch dann, wenn keine passende `nka_versand`- oder
 * `rent_arrears_events`-Zeile zur `resend_message_id` gefunden wird — Resend
 * retried sonst ewig.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Webhook, WebhookVerificationError } from "svix";
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

/**
 * Verifiziert einen Svix-Webhook (Resend-Default). Wirft NICHT, sondern
 * liefert das verifizierte Payload-Objekt oder `null`, wenn die Signatur
 * ungültig oder das Secret nicht gesetzt ist.
 */
function verifySvixSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
): unknown | null {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return null;
  if (!headers.id || !headers.timestamp || !headers.signature) return null;
  try {
    const wh = new Webhook(secret);
    return wh.verify(rawBody, {
      "svix-id": headers.id,
      "svix-timestamp": headers.timestamp,
      "svix-signature": headers.signature,
    });
  } catch (err) {
    // Sowohl WebhookVerificationError als auch generische Errors hier eingefangen.
    if (err instanceof WebhookVerificationError) return null;
    return null;
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
  // Raw body lesen (Signatur muss über exakte Bytes des Requests berechnet werden)
  const rawBody = await request.text();

  const verifiedPayload = verifySvixSignature(rawBody, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  });

  if (verifiedPayload === null) {
    return NextResponse.json(
      { error: "Ungültige Signatur." },
      { status: 401 },
    );
  }

  // svix.verify() liefert bereits den geparsten JSON-Body. Falls die Lib das
  // mal nicht tut (z. B. ältere Versionen), fallen wir auf Re-Parse zurück.
  const body = typeof verifiedPayload === "object" && verifiedPayload !== null
    ? verifiedPayload
    : (() => {
        try { return JSON.parse(rawBody); } catch { return null; }
      })();
  if (body === null) {
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
