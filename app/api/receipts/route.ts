import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";
import { matchReceipt, type TransactionRow } from "@/lib/banking/matchReceipt";

// ── GET /api/receipts ─────────────────────────────────────────────────────────
// Returns unlinked receipts (transaction_id IS NULL) for the current user

export async function GET() {
  const {
    data: { user },
  } = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = serviceRoleClient();
  const { data, error } = await db
    .from("receipts")
    .select("id, filename, extracted_amount, extracted_date, extracted_counterpart, created_at")
    .eq("user_id", user.id)
    .is("transaction_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ── POST /api/receipts ────────────────────────────────────────────────────────
// Upload + analyse a receipt, optionally link to a transaction

export async function POST(req: NextRequest) {
  const {
    data: { user },
  } = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const transactionId = (formData.get("transaction_id") as string | null) || null;

  // ── 1. Upload to Supabase Storage ─────────────────────────────────────────
  const db = serviceRoleClient();

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

  const storagePath = `receipts/${user.id}/${Date.now()}_${file.name}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from("documents")
    .upload(storagePath, fileBuffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  // ── 2. Download file and encode as base64 ────────────────────────────────
  const { data: downloadData, error: downloadError } = await db.storage
    .from("documents")
    .download(storagePath);

  if (downloadError || !downloadData) {
    return NextResponse.json(
      { error: `Download failed: ${downloadError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  const base64 = Buffer.from(await downloadData.arrayBuffer()).toString("base64");
  const mimeType = file.type;
  const isPdf = mimeType === "application/pdf";

  // ── 3. Call Claude to extract receipt data ───────────────────────────────
  const contentBlock = isPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: mimeType, data: base64 },
      }
    : {
        type: "image",
        source: { type: "base64", media_type: mimeType, data: base64 },
      };

  let extracted: {
    amount: number | null;
    date: string | null;
    counterpart: string | null;
    description: string | null;
  } = { amount: null, date: null, counterpart: null, description: null };

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system:
          "Extrahiere aus diesem Beleg/Quittung: Betrag (Zahl ohne Währung), Datum (YYYY-MM-DD), " +
          "Auftraggeber/Empfänger, kurze Beschreibung. Antworte als JSON: {amount, date, counterpart, description}. " +
          "Wenn ein Feld nicht erkennbar ist, setze null.",
        messages: [
          {
            role: "user",
            content: [contentBlock, { type: "text", text: "Bitte extrahiere die Daten aus diesem Beleg." }],
          },
        ],
      }),
    });

    if (claudeRes.ok) {
      const claudeBody = (await claudeRes.json()) as {
        content: { type: string; text: string }[];
      };
      const rawText = claudeBody.content.find((b) => b.type === "text")?.text ?? "";
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
      extracted = JSON.parse(cleaned) as typeof extracted;
    }
  } catch {
    // Extraction failed — continue with nulls
  }

  // ── 4. Insert receipt row ────────────────────────────────────────────────
  const { data: insertedRow, error: insertError } = await db
    .from("receipts")
    .insert({
      user_id: user.id,
      transaction_id: transactionId,
      file_path: storagePath,
      filename: file.name,
      extracted_amount: extracted.amount,
      extracted_date: extracted.date,
      extracted_counterpart: extracted.counterpart,
      extracted_text: extracted.description,
      linked_by: transactionId ? "user" : "user",
      linked_at: transactionId ? new Date().toISOString() : null,
      source: "manual",
    })
    .select()
    .single();

  if (insertError || !insertedRow) {
    return NextResponse.json(
      { error: `Insert failed: ${insertError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // ── 5. Auto-match if no transaction_id was supplied ───────────────────────
  let autoLinked = false;
  let matchScore: number | null = null;

  if (!transactionId) {
    const { data: txRows } = await db
      .from("transactions")
      .select("id, amount, date, counterpart")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(200);

    if (txRows && txRows.length > 0) {
      const candidates = txRows as TransactionRow[];
      const match = matchReceipt(
        {
          extracted_amount: extracted.amount,
          extracted_date: extracted.date,
          extracted_counterpart: extracted.counterpart,
        },
        candidates,
      );

      if (match) {
        const { error: linkError } = await db
          .from("receipts")
          .update({
            transaction_id: match.transactionId,
            match_score: match.score,
            linked_by: "auto",
            linked_at: new Date().toISOString(),
          })
          .eq("id", insertedRow.id);

        if (!linkError) {
          autoLinked = true;
          matchScore = match.score;
        }
      }
    }
  }

  return NextResponse.json({
    receipt: insertedRow,
    autoLinked,
    matchScore,
  });
}
