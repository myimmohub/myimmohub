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
    false,
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

  const { data: existingDoc } = await db
    .from("documents")
    .select("id")
    .eq("id", body.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existingDoc) {
    return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });
  }

  if (body.property_id) {
    const { data: property } = await db
      .from("properties")
      .select("id")
      .eq("id", body.property_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!property) {
      return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 404 });
    }
  }

  const { error: updateError } = await db
    .from("documents")
    .update({
      status: body.status,
      category: body.category,
      property_id: body.property_id ?? null,
    })
    .eq("user_id", user.id)
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
