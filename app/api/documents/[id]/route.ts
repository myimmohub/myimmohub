import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { fetchDocumentById, serviceRoleClient } from "@/lib/supabase/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const db = serviceRoleClient();

  const { data: doc, error } = await fetchDocumentById(db, user.id, id);

  if (error || !doc) {
    return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });
  }

  // Signierte URL für Vorschau + Download (1 Stunde gültig)
  const { data: signed, error: signedUrlError } = await db.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 3600);

  if (signedUrlError) {
    // Non-fatal: Vorschau nicht verfügbar, aber Metadaten werden trotzdem zurückgegeben
  }

  // Alle Properties des Nutzers für das Bearbeitungs-Dropdown
  const { data: properties } = await db
    .from("properties")
    .select("id, name")
    .eq("user_id", user.id);

  return NextResponse.json({
    doc,
    signedUrl: signed?.signedUrl ?? null,
    properties: properties ?? [],
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const db = serviceRoleClient();

  const body = (await request.json()) as {
    category?: string | null;
    amount?: number | null;
    document_date?: string | null;
    property_id?: string | null;
  };

  const { error } = await db
    .from("documents")
    .update({
      category: body.category ?? null,
      amount: body.amount ?? null,
      document_date: body.document_date ?? null,
      property_id: body.property_id ?? null,
    })
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const db = serviceRoleClient();

  const { data: doc, error: fetchError } = await db
    .from("documents")
    .select("id, storage_path, user_id")
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !doc) {
    return NextResponse.json({ error: "Dokument nicht gefunden." }, { status: 404 });
  }

  if (doc.storage_path) {
    await db.storage.from("documents").remove([doc.storage_path]);
  }

  const { error: deleteError } = await db
    .from("documents")
    .delete()
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .eq("id", id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
