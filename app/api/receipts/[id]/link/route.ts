import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";

type RouteParams = { params: Promise<{ id: string }> };

// ── POST /api/receipts/[id]/link ──────────────────────────────────────────────
// Body: { transaction_id: string | null }
// Sets the transaction link on a receipt (user-driven).

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const {
    data: { user },
  } = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { transaction_id?: string | null };
  const transactionId = body.transaction_id ?? null;

  const db = serviceRoleClient();

  // Ownership check
  const { data: receipt, error: fetchError } = await db
    .from("receipts")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (fetchError || !receipt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (receipt.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (transactionId) {
    const { data: transaction } = await db
      .from("transactions")
      .select("id")
      .eq("id", transactionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!transaction) {
      return NextResponse.json({ error: "Transaktion nicht gefunden." }, { status: 404 });
    }
  }

  const { error: updateError } = await db
    .from("receipts")
    .update({
      transaction_id: transactionId,
      linked_by: "user",
      linked_at: transactionId ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
