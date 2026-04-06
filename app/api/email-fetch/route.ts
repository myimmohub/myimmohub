import { NextResponse } from "next/server";
import { fetchGmailEmails } from "@/lib/email/fetchGmailEmails";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  // Cron-Anfragen von Vercel mit Secret absichern
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const results = await fetchGmailEmails();

    const totalAttachments = results.reduce((sum, r) => sum + r.attachments.length, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    return NextResponse.json({
      emails_processed: results.length,
      attachments_saved: totalAttachments,
      errors: totalErrors,
      details: results.map((r) => ({
        from: r.from,
        subject: r.subject,
        attachments: r.attachments.length,
        errors: r.errors,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
