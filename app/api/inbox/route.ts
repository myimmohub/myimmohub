import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { fetchDocumentsWithProperties, serviceRoleClient } from "@/lib/supabase/queries";

export async function GET() {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data, error } = await fetchDocumentsWithProperties(
    serviceRoleClient(),
    user.id,
    "pending_review",
    true, // unzugeordnete IMAP-Emails einschließen
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json()) as {
    id: string;
    status: string;
    category?: string;
    property_id?: string | null;
    original_suggestion?: Record<string, unknown>;
    user_correction?: Record<string, unknown>;
  };

  const db = serviceRoleClient();

  const { error: updateError } = await db
    .from("documents")
    .update({
      user_id: user.id, // Dokument dem bestätigenden Nutzer zuordnen
      status: body.status,
      category: body.category,
      property_id: body.property_id ?? null,
    })
    .eq("id", body.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (body.original_suggestion && body.user_correction) {
    const { error: feedbackError } = await db.from("ai_feedback").insert({
      document_id: body.id,
      original_suggestion: body.original_suggestion,
      user_correction: body.user_correction,
    });
    if (feedbackError) {
      // Non-fatal: Feedback-Speicherung fehlgeschlagen, Bestätigung bleibt gültig
    }
  }

  return NextResponse.json({ ok: true });
}
