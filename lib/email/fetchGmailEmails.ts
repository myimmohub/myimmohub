import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { classifyDocument } from "@/lib/ai/classifyDocument";
import { extractText } from "@/lib/ai/extractText";
import { sanitizeFileName, ALLOWED_TYPES } from "@/lib/constants";

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

type RawEmail = {
  uid: number;
  source: Buffer;
};

type ProcessedAttachment = {
  documentId: string;
  originalFilename: string;
  storagePath: string;
};

type ProcessedEmail = {
  from: string;
  subject: string;
  attachments: ProcessedAttachment[];
  errors: { fileName: string; error: string }[];
};

function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Phase 1: pure IMAP — connect, collect raw email sources, mark as read, disconnect.
// No Supabase or other I/O happens here.
async function fetchRawEmails(gmailUser: string, gmailPassword: string): Promise<RawEmail[]> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: gmailUser, pass: gmailPassword },
    logger: false,
    connectionTimeout: 10000,
  });

  // Verbindungsfehler werden von ImapFlow intern behandelt
  client.on("error", () => { /* IMAP socket error — wird durch den connect()-Fehler propagiert */ });

  await client.connect();

  const raw: RawEmail[] = [];

  try {
    await client.mailboxOpen("INBOX");

    const searchResult = await client.search({ seen: false }, { uid: true });
    const limitedUids = Array.isArray(searchResult) ? searchResult.slice(0, 5) : [];

    if (limitedUids.length === 0) {
      return raw;
    }

    // Collect all sources first — no other I/O inside this loop
    const messages = client.fetch(limitedUids, { source: true, uid: true }, { uid: true });
    for await (const message of messages) {
      if (message.source) raw.push({ uid: message.uid, source: message.source });
    }

    // Mark as read only after the FETCH stream is fully done
    for (const { uid } of raw) {
      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // already disconnected — ignore
    }
  }

  return raw;
}

// Phase 2: parse raw sources and upload attachments to Supabase.
// IMAP connection is fully closed before this runs.
async function processEmails(
  raw: RawEmail[],
  supabase: SupabaseClient,
): Promise<ProcessedEmail[]> {
  const results: ProcessedEmail[] = [];

  for (const { source } of raw) {
    const parsed = await simpleParser(source);

    const fromAddress = parsed.from as AddressObject | undefined;
    const from = fromAddress?.text ?? "Unbekannt";
    const subject = parsed.subject ?? "(kein Betreff)";
    const attachments: ProcessedAttachment[] = [];
    const errors: { fileName: string; error: string }[] = [];

    for (const attachment of parsed.attachments ?? []) {
      const filename = attachment.filename ?? `attachment_${Date.now()}`;

      const mimeAllowed = ALLOWED_TYPES.includes(attachment.contentType);
      const extAllowed = hasAllowedExtension(filename);
      if (!mimeAllowed && !extAllowed) continue;

      const safeName = sanitizeFileName(filename);
      const storagePath = `inbox/${Date.now()}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, attachment.content, {
          contentType: attachment.contentType,
          upsert: false,
        });

      if (uploadError) {
        errors.push({ fileName: filename, error: uploadError.message });
        continue;
      }

      const { data: doc, error: insertError } = await supabase
        .from("documents")
        .insert({
          user_id: null,
          property_id: null,
          storage_path: storagePath,
          file_name: safeName,
          original_filename: filename,
          source: "email",
          status: "pending_analysis",
          email_from: from,
          email_subject: subject,
        })
        .select("id")
        .single();

      if (insertError) {
        errors.push({ fileName: filename, error: insertError.message });
        continue;
      }

      // OCR + Klassifikation
      const extractedText = await extractText(attachment.content, attachment.contentType);
      const textForClassification = extractedText ?? "";

      if (textForClassification) {
        try {
          const classification = await classifyDocument(textForClassification, []);
          const { error: updateError } = await supabase
            .from("documents")
            .update({
              extracted_text: extractedText,
              category: classification.category,
              amount: classification.amount,
              document_date: classification.date,
              ai_confidence: classification.confidence,
              status: "pending_review",
            })
            .eq("id", doc.id);

          if (updateError) {
            errors.push({ fileName: filename, error: `Update fehlgeschlagen: ${updateError.message}` });
          }
        } catch {
          // Klassifikation fehlgeschlagen — Dokument bleibt ohne Kategorie im Eingang
        }
      }

      attachments.push({
        documentId: doc.id,
        originalFilename: filename,
        storagePath,
      });
    }

    results.push({ from, subject, attachments, errors });
  }

  return results;
}

export async function fetchGmailEmails(): Promise<ProcessedEmail[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase env vars.");
  }
  if (!gmailUser || !gmailPassword) {
    throw new Error("Missing Gmail env vars (GMAIL_USER, GMAIL_APP_PASSWORD).");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Phase 1: IMAP only — fully isolated, no Supabase I/O
  const raw = await fetchRawEmails(gmailUser, gmailPassword);

  // Phase 2: Supabase — IMAP connection is already closed
  return processEmails(raw, supabase);
}
