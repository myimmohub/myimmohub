import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";
import { importTransactions, type ImportSummary } from "@/lib/banking/importTransactions";
import type { ParsedTransaction, ParseRowError } from "@/lib/banking/parseCSV";

type RequestBody = {
  /** Durch parseCSV() im Browser aufbereitete Transaktionen */
  transactions: ParsedTransaction[];
  /** Optional: alle Transaktionen einer Immobilie zuordnen */
  propertyId?: string | null;
  /** Parse-Fehler die bereits im Browser aufgetreten sind */
  parseErrors?: ParseRowError[];
};

export async function POST(request: Request) {
  // ── Authentifizierung ──────────────────────────────────────────────────────
  const { data: { user } } = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // ── Request-Body lesen ─────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  if (!Array.isArray(body.transactions)) {
    return NextResponse.json(
      { error: "Feld 'transactions' fehlt oder ist kein Array." },
      { status: 400 },
    );
  }

  // ── Import durchführen ─────────────────────────────────────────────────────
  let summary: ImportSummary;
  try {
    summary = await importTransactions(serviceRoleClient(), {
      transactions: body.transactions,
      userId: user.id,
      propertyId: body.propertyId,
      parseErrors: body.parseErrors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Datenbankfehler." },
      { status: 500 },
    );
  }

  // ── Zusammenfassung zurückgeben ────────────────────────────────────────────
  return NextResponse.json({
    inserted: summary.inserted,
    skipped:  summary.skipped,
    errors:   summary.errors,
    message:
      summary.inserted === 0
        ? `Keine neuen Transaktionen — ${summary.skipped} Duplikat${summary.skipped !== 1 ? "e" : ""} übersprungen.`
        : `${summary.inserted} neue Transaktion${summary.inserted !== 1 ? "en" : ""} importiert` +
          (summary.skipped > 0 ? `, ${summary.skipped} Duplikat${summary.skipped !== 1 ? "e" : ""} übersprungen.` : "."),
  } satisfies ImportSummary & { message: string });
}
