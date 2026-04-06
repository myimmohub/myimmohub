import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

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

function sanitizeFileName(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
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

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: gmailUser,
      pass: gmailPassword,
    },
    logger: false,
  });

  await client.connect();

  const results: ProcessedEmail[] = [];

  try {
    await client.mailboxOpen("INBOX");

    // Alle ungelesenen E-Mails suchen
    const messages = client.fetch({ seen: false }, { source: true, uid: true });

    for await (const message of messages) {
      const parsed = await simpleParser(message.source);

      const fromAddress = parsed.from as AddressObject | undefined;
      const from = fromAddress?.text ?? "Unbekannt";
      const subject = parsed.subject ?? "(kein Betreff)";
      const attachments: ProcessedAttachment[] = [];
      const errors: { fileName: string; error: string }[] = [];

      for (const attachment of parsed.attachments ?? []) {
        const filename = attachment.filename ?? `attachment_${Date.now()}`;

        // Nur erlaubte Dateitypen verarbeiten
        const mimeAllowed = ALLOWED_MIME_TYPES.includes(attachment.contentType);
        const extAllowed = hasAllowedExtension(filename);
        if (!mimeAllowed && !extAllowed) continue;

        const safeName = sanitizeFileName(filename);
        const storagePath = `inbox/${Date.now()}_${safeName}`;

        // In Supabase Storage hochladen
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

        // Eintrag in documents-Tabelle anlegen
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

        attachments.push({
          documentId: doc.id,
          originalFilename: filename,
          storagePath,
        });
      }

      // E-Mail als gelesen markieren
      await client.messageFlagsAdd({ uid: message.uid }, ["\\Seen"], { uid: true });

      results.push({ from, subject, attachments, errors });
    }
  } finally {
    await client.logout();
  }

  return results;
}
