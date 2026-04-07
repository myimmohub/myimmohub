import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";

type RouteParams = { params: Promise<{ id: string }> };

// ── GET /api/receipts/[id] ────────────────────────────────────────────────────
// Returns a signed URL (60 min) for the receipt file

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const {
    data: { user },
  } = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = serviceRoleClient();

  // Ownership check
  const { data: receipt, error: fetchError } = await db
    .from("receipts")
    .select("id, file_path, user_id")
    .eq("id", id)
    .single();

  if (fetchError || !receipt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (receipt.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: signedData, error: signError } = await db.storage
    .from("documents")
    .createSignedUrl(receipt.file_path, 3600);

  if (signError || !signedData) {
    return NextResponse.json(
      { error: `Signed URL failed: ${signError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ signedUrl: signedData.signedUrl });
}

// ── DELETE /api/receipts/[id] ─────────────────────────────────────────────────
// ?deleteFile=true  → delete row + storage file
// (default)         → unlink only (set transaction_id = null)

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const {
    data: { user },
  } = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleteFile = req.nextUrl.searchParams.get("deleteFile") === "true";
  const db = serviceRoleClient();

  // Ownership check
  const { data: receipt, error: fetchError } = await db
    .from("receipts")
    .select("id, file_path, user_id")
    .eq("id", id)
    .single();

  if (fetchError || !receipt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (receipt.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deleteFile) {
    // Delete storage file
    await db.storage.from("documents").remove([receipt.file_path]);
    // Delete row
    const { error: deleteError } = await db
      .from("receipts")
      .delete()
      .eq("id", id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  } else {
    // Unlink only
    const { error: unlinkError } = await db
      .from("receipts")
      .update({ transaction_id: null, linked_at: null })
      .eq("id", id);
    if (unlinkError) {
      return NextResponse.json({ error: unlinkError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
