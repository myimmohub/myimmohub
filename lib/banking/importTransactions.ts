import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedTransaction, ParseRowError } from "@/lib/banking/parseCSV";

export type ImportOptions = {
  /** Bereits durch parseCSV() aufbereitete Transaktionen */
  transactions: ParsedTransaction[];
  /** Supabase-User-ID des importierenden Nutzers */
  userId: string;
  /** Optional: alle Transaktionen einer Immobilie zuordnen */
  propertyId?: string | null;
  /** Parse-Fehler die bereits im Browser aufgetreten sind (werden an Antwort angehängt) */
  parseErrors?: ParseRowError[];
};

export type ImportSummary = {
  /** Anzahl neu eingefügter Transaktionen */
  inserted: number;
  /** Anzahl übersprungener Duplikate (import_hash bereits vorhanden) */
  skipped: number;
  /** Zeilen-Fehler aus dem CSV-Parsing sowie etwaige DB-Fehler */
  errors: { row: number; error: string }[];
  /** IDs der neu eingefügten Transaktionen (für nachgelagerte Lern-Schleife) */
  insertedIds: string[];
};

/**
 * Berechnet für jede Transaktion einen SHA-256-Fingerabdruck (import_hash),
 * speichert nur neue Einträge in Supabase und gibt eine Zusammenfassung zurück.
 *
 * Der import_hash setzt sich zusammen aus:
 *   user_id : date : amount : counterpart : description
 * Damit wird derselbe CSV beliebig oft hochgeladen ohne Duplikate zu erzeugen.
 */
export async function importTransactions(
  db: SupabaseClient,
  options: ImportOptions,
): Promise<ImportSummary> {
  const { transactions, userId, propertyId, parseErrors = [] } = options;

  // Parse-Fehler aus dem Browser direkt in die Antwort übernehmen
  const errors: ImportSummary["errors"] = parseErrors.map((e) => ({
    row: e.row,
    error: e.message,
  }));

  if (transactions.length === 0) {
    return { inserted: 0, skipped: 0, errors, insertedIds: [] };
  }

  // ── import_hash für jede Transaktion berechnen ──────────────────────────────
  const toInsert = transactions.map((tx) => ({
    user_id: userId,
    property_id: propertyId ?? null,
    date: tx.date,
    amount: tx.amount,
    description: tx.description,
    counterpart: tx.counterpart,
    source: "csv_import" as const,
    import_hash: createHash("sha256")
      .update(`${userId}:${tx.date}:${tx.amount}:${tx.counterpart ?? ""}:${tx.description ?? ""}`)
      .digest("hex"),
  }));

  // ── Bulk-Upsert: Konflikt auf import_hash → Zeile stillschweigend überspringen
  const { data: insertedRows, error: dbError } = await db
    .from("transactions")
    .upsert(toInsert, { onConflict: "import_hash", ignoreDuplicates: true })
    .select("id");

  if (dbError) {
    throw new Error(dbError.message);
  }

  const inserted = insertedRows?.length ?? 0;
  const skipped = toInsert.length - inserted;
  const insertedIds = (insertedRows ?? []).map((r) => r.id as string);

  return { inserted, skipped, errors, insertedIds };
}
