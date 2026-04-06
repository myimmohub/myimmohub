import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { fetchGmailEmails } from "@/lib/email/fetchGmailEmails";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");

  // Cron-Aufruf via GitHub Actions (Bearer Secret)
  const isCronCall = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;

  if (!isCronCall) {
    // Manueller Aufruf — eingeloggten Nutzer prüfen
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) =>
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            ),
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
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
    console.error("[email-fetch]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
