import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";
import {
  categorizeTransaction,
  ANLAGE_V_ZEILEN,
  TAX_DEDUCTIBLE,
  type AnlageVCategory,
} from "@/lib/banking/categorizeTransaction";

// 31 sequenzielle Claude-Calls × ~3 s = ~90 s — Timeout explizit hochsetzen
export const maxDuration = 300;

type CategorizeResponse = {
  total: number;
  categorized: number;
  errors: number;
  firstError: string | null;
};

export async function POST(request: Request) {
  // ── Authentifizierung ──────────────────────────────────────────────────────
  const { data: { user } } = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // force=true kategorisiert auch bereits kategorisierte Transaktionen neu
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  const db = serviceRoleClient();

  // ── Unkategorisierte Transaktionen laden ───────────────────────────────────
  // Hinweis: .neq("category","aufgeteilt") schließt NULL-Werte in SQL aus,
  // daher wird .is() bzw. .or() statt .neq() verwendet.
  let query = db
    .from("transactions")
    .select("id, date, amount, description, counterpart")
    .eq("user_id", user.id);

  if (!force) {
    query = query.is("category", null);
  } else {
    query = query.or("category.is.null,category.neq.aufgeteilt");
  }

  const { data: txData, error: fetchError } = await query.order("date", { ascending: false });

  if (fetchError) {
    return NextResponse.json(
      { error: `Fehler beim Laden der Transaktionen: ${fetchError.message}` },
      { status: 500 },
    );
  }

  const transactions = txData ?? [];
  const total = transactions.length;

  if (total === 0) {
    return NextResponse.json<CategorizeResponse>(
      { total: 0, categorized: 0, errors: 0, firstError: null },
    );
  }

  // ── KI-Kategorisierung sequenziell ────────────────────────────────────────
  // Sequenziell statt parallel, um Rate-Limits zu respektieren.
  // Fehler einzelner Transaktionen unterbrechen den Batch nicht.
  let categorized = 0;
  let errors = 0;
  let firstError: string | null = null;

  for (const tx of transactions) {
    try {
      const result = await categorizeTransaction({
        date:        tx.date as string,
        amount:      Number(tx.amount),
        description: tx.description as string | null,
        counterpart: tx.counterpart as string | null,
      });

      const cat = result.category as AnlageVCategory;

      const { error: updateError } = await db
        .from("transactions")
        .update({
          category:          cat,
          confidence:        result.confidence,
          is_tax_deductible: TAX_DEDUCTIBLE[cat] ?? null,
          anlage_v_zeile:    ANLAGE_V_ZEILEN[cat] ?? null,
        })
        .eq("id", tx.id);

      if (updateError) {
        errors++;
        firstError ??= `DB-Update fehlgeschlagen: ${updateError.message}`;
      } else {
        categorized++;
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      firstError ??= msg; // Ersten Fehler für Diagnose merken
    }
  }

  return NextResponse.json<CategorizeResponse>({ total, categorized, errors, firstError });
}
