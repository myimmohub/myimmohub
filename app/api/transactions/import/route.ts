import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";

type Mapping = {
  date: string;
  amount: string;
  description?: string;
  counterpart?: string;
};

type ImportRequest = {
  rows: Record<string, string>[];
  mapping: Mapping;
  propertyId?: string | null;
};

type RowError = { row: number; error: string };

/** Wandelt deutsches Datumsformat (DD.MM.YYYY) und andere gängige Formate in ISO um. */
function parseDate(raw: string): string {
  const cleaned = raw.trim();
  // DD.MM.YYYY
  const dmy = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  // YYYY-MM-DD (bereits korrekt)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  // DD/MM/YYYY
  const dmy2 = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy2) return `${dmy2[3]}-${dmy2[2].padStart(2, "0")}-${dmy2[1].padStart(2, "0")}`;
  // Fallback via Date.parse
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  throw new Error(`Ungültiges Datum: "${raw}"`);
}

/**
 * Wandelt deutschen Betrag (1.234,56 oder -1.234,56) und englisches Format
 * (1,234.56) in eine Zahl um.
 */
function parseAmount(raw: string): number {
  let cleaned = raw.trim().replace(/[€$£\s]/g, "");
  // Deutsches Format: Punkt als Tausendertrenner, Komma als Dezimal → 1.234,56
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  // Englisches Format: Komma als Tausendertrenner, Punkt als Dezimal → 1,234.56
  else if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, "");
  }
  // Nur Komma als Dezimalzeichen → 1234,56
  else {
    cleaned = cleaned.replace(",", ".");
  }
  const value = parseFloat(cleaned);
  if (isNaN(value)) throw new Error(`Ungültiger Betrag: "${raw}"`);
  return value;
}

export async function POST(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: ImportRequest;
  try {
    body = (await request.json()) as ImportRequest;
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const { rows, mapping, propertyId } = body;

  if (!rows?.length) {
    return NextResponse.json({ error: "Keine Zeilen zum Importieren." }, { status: 400 });
  }
  if (!mapping?.date || !mapping?.amount) {
    return NextResponse.json({ error: "Pflichtfelder date und amount müssen zugeordnet sein." }, { status: 400 });
  }

  const db = serviceRoleClient();
  const toInsert: Record<string, unknown>[] = [];
  const rowErrors: RowError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const rawDate = row[mapping.date]?.trim() ?? "";
      const rawAmount = row[mapping.amount]?.trim() ?? "";

      if (!rawDate || !rawAmount) {
        rowErrors.push({ row: i + 1, error: "Datum oder Betrag leer — Zeile übersprungen." });
        continue;
      }

      const date = parseDate(rawDate);
      const amount = parseAmount(rawAmount);
      const description = mapping.description ? (row[mapping.description]?.trim() || null) : null;
      const counterpart = mapping.counterpart ? (row[mapping.counterpart]?.trim() || null) : null;

      // Eindeutiger Fingerabdruck — verhindert Doppel-Importe
      const importHash = createHash("sha256")
        .update(`${user.id}:${date}:${amount}:${counterpart ?? ""}:${description ?? ""}`)
        .digest("hex");

      toInsert.push({
        user_id: user.id,
        property_id: propertyId || null,
        date,
        amount,
        description,
        counterpart,
        source: "csv_import",
        import_hash: importHash,
      });
    } catch (err) {
      rowErrors.push({ row: i + 1, error: err instanceof Error ? err.message : "Unbekannter Fehler" });
    }
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: 0, errors: rowErrors });
  }

  // Bulk-Insert: bei Konflikt auf import_hash wird die Zeile stillschweigend übersprungen.
  // ignoreDuplicates: true → nur tatsächlich eingefügte Zeilen werden zurückgegeben.
  const { data: insertedRows, error: insertError } = await db
    .from("transactions")
    .upsert(toInsert, { onConflict: "import_hash", ignoreDuplicates: true })
    .select("id");

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const inserted = insertedRows?.length ?? 0;
  const skipped = toInsert.length - inserted;

  return NextResponse.json({ inserted, skipped, errors: rowErrors });
}
