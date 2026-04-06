import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";
import type { ParsedTransaction, ParseRowError } from "@/lib/banking/parseCSV";

type ImportRequest = {
  /** Bereits durch parseCSV() aufbereitete Transaktionen */
  transactions: ParsedTransaction[];
  propertyId?: string | null;
  /** Parse-Fehler die bereits im Browser aufgetreten sind */
  parseErrors?: ParseRowError[];
};

type ImportResponse = {
  inserted: number;
  skipped: number;
  errors: { row: number; error: string }[];
};

export async function POST(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: ImportRequest;
  try {
    body = (await request.json()) as ImportRequest;
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const { transactions, propertyId, parseErrors = [] } = body;

  if (!transactions?.length) {
    return NextResponse.json({ inserted: 0, skipped: 0, errors: parseErrors.map((e) => ({ row: e.row, error: e.message })) });
  }

  // Transaktionen in DB-Zeilen umwandeln + import_hash generieren
  const toInsert = transactions.map((tx) => ({
    user_id: user.id,
    property_id: propertyId ?? null,
    date: tx.date,
    amount: tx.amount,
    description: tx.description,
    counterpart: tx.counterpart,
    source: "csv_import",
    // SHA-256-Fingerabdruck — verhindert Doppel-Importe beim erneuten Upload
    import_hash: createHash("sha256")
      .update(`${user.id}:${tx.date}:${tx.amount}:${tx.counterpart ?? ""}:${tx.description ?? ""}`)
      .digest("hex"),
  }));

  // Bulk-Upsert: Konflikt auf import_hash → Zeile stillschweigend überspringen
  const { data: insertedRows, error: insertError } = await serviceRoleClient()
    .from("transactions")
    .upsert(toInsert, { onConflict: "import_hash", ignoreDuplicates: true })
    .select("id");

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const inserted = insertedRows?.length ?? 0;
  const skipped = toInsert.length - inserted;

  // Parse-Fehler aus dem Browser mit zurückgeben
  const errors = parseErrors.map((e) => ({ row: e.row, error: e.message }));

  return NextResponse.json({ inserted, skipped, errors } satisfies ImportResponse);
}
