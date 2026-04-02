import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POSTMARK_WEBHOOK_TOKEN = process.env.POSTMARK_WEBHOOK_TOKEN;

// Postmark-Payload (relevante Felder)
type PostmarkAttachment = {
  Name: string;
  Content: string; // Base64
  ContentType: string;
  ContentLength: number;
};

type PostmarkInboundPayload = {
  From: string;
  To: string;
  Subject: string;
  TextBody: string;
  Attachments?: PostmarkAttachment[];
};

/**
 * Ermittelt die user_id aus der Empfänger-Adresse.
 * Erwartet das Format: {user_id}@<domain>
 * Beispiel: 550e8400-e29b-41d4-a716-446655440000@inbound.myimmohub.com
 */
function extractUserIdFromTo(to: string): string | null {
  const email = to.split(",")[0].trim().replace(/^.*<(.+)>$/, "$1");
  const localPart = email.split("@")[0];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(localPart) ? localPart : null;
}

function sanitizeFileName(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

export async function POST(request: Request) {
  // Optionale Token-Prüfung (Header: X-Webhook-Token)
  if (POSTMARK_WEBHOOK_TOKEN) {
    const token = request.headers.get("x-webhook-token");
    if (token !== POSTMARK_WEBHOOK_TOKEN) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing Supabase env vars." }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let payload: PostmarkInboundPayload;
  try {
    payload = (await request.json()) as PostmarkInboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { From: from, To: to, Subject: subject, TextBody: textBody, Attachments: attachments } = payload;

  if (!to) {
    return NextResponse.json({ error: "Missing To address." }, { status: 400 });
  }

  const userId = extractUserIdFromTo(to);
  if (!userId) {
    return NextResponse.json(
      { error: `Konnte user_id nicht aus Empfängeradresse ermitteln: ${to}` },
      { status: 400 },
    );
  }

  const results: { fileName: string; documentId: string }[] = [];
  const errors: { fileName: string; error: string }[] = [];

  if (!attachments || attachments.length === 0) {
    return NextResponse.json({
      message: "E-Mail empfangen, aber keine Anhänge gefunden.",
      from,
      subject,
    });
  }

  for (const attachment of attachments) {
    const originalFilename = attachment.Name;
    const safeName = sanitizeFileName(originalFilename);
    const storagePath = `${userId}/email/${Date.now()}_${safeName}`;

    // Base64 → Buffer
    const fileBuffer = Buffer.from(attachment.Content, "base64");

    // In Supabase Storage hochladen
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, fileBuffer, {
        contentType: attachment.ContentType,
        upsert: false,
      });

    if (uploadError) {
      errors.push({ fileName: originalFilename, error: uploadError.message });
      continue;
    }

    // Eintrag in documents-Tabelle anlegen
    const { data: doc, error: insertError } = await supabase
      .from("documents")
      .insert({
        user_id: userId,
        property_id: null,
        storage_path: storagePath,
        file_name: safeName,
        original_filename: originalFilename,
        source: "email",
        status: "pending_analysis",
        email_from: from,
        email_subject: subject,
        email_body: textBody ?? null,
      })
      .select("id")
      .single();

    if (insertError) {
      errors.push({ fileName: originalFilename, error: insertError.message });
      continue;
    }

    results.push({ fileName: originalFilename, documentId: doc.id });
  }

  return NextResponse.json({
    received: attachments.length,
    saved: results,
    errors,
  });
}
