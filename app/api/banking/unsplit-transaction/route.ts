import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";

export async function POST(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as { originalTransactionId?: string };
  const { originalTransactionId } = body;

  if (!originalTransactionId) {
    return NextResponse.json({ error: "originalTransactionId fehlt." }, { status: 400 });
  }

  const db = serviceRoleClient();

  // ── 1. Original laden und Eigentümerschaft prüfen ─────────────────────────
  const { data: original, error: fetchError } = await db
    .from("transactions")
    .select("id, user_id, category")
    .eq("id", originalTransactionId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !original) {
    return NextResponse.json(
      { error: "Transaktion nicht gefunden oder kein Zugriff." },
      { status: 404 },
    );
  }

  if (original.category !== "aufgeteilt") {
    return NextResponse.json(
      { error: "Diese Transaktion wurde nicht aufgeteilt." },
      { status: 400 },
    );
  }

  // ── 2. Kind-Transaktionen löschen ─────────────────────────────────────────
  const { error: deleteError } = await db
    .from("transactions")
    .delete()
    .eq("split_from_transaction_id", originalTransactionId)
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json(
      { error: `Kind-Transaktionen konnten nicht gelöscht werden: ${deleteError.message}` },
      { status: 500 },
    );
  }

  // ── 3. Original zurücksetzen ───────────────────────────────────────────────
  const { data: restored, error: updateError } = await db
    .from("transactions")
    .update({
      category:          "tilgung_kredit",
      is_tax_deductible: false,
      anlage_v_zeile:    null,
      is_confirmed:      false,
    })
    .eq("id", originalTransactionId)
    .select("id, date, amount, description, counterpart, category, confidence, is_tax_deductible, anlage_v_zeile, is_confirmed, property_id, split_from_transaction_id")
    .single();

  if (updateError || !restored) {
    return NextResponse.json(
      { error: `Original konnte nicht zurückgesetzt werden: ${updateError?.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ transaction: restored });
}
