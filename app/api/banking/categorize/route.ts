import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";
import {
  categorizeTransaction,
  type DbCategoryForPrompt,
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

  const fixOld = url.searchParams.get("fixold") === "true";

  if (!force && !fixOld) {
    query = query.is("category", null);
  } else if (fixOld) {
    // Nur Transaktionen mit alten Kategorienamen (enthalten "(Anlage V")
    query = query.like("category", "%(Anlage V%");
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

  // ── Kategorien aus DB laden (für dynamischen KI-Prompt) ───────────────────
  let dbCategories: DbCategoryForPrompt[] = [];
  const { data: catData } = await db
    .from("categories")
    .select("label, icon, gruppe, typ, anlage_v, description")
    .is("deleted_at", null)
    .order("gruppe")
    .order("label");
  if (catData) dbCategories = catData as DbCategoryForPrompt[];

  // ── KI-Kategorisierung sequenziell ────────────────────────────────────────
  // Sequenziell statt parallel, um Rate-Limits zu respektieren.
  // Fehler einzelner Transaktionen unterbrechen den Batch nicht.
  let categorized = 0;
  let errors = 0;
  let firstError: string | null = null;

  for (const tx of transactions) {
    try {
      const result = await categorizeTransaction(
        {
          date:        tx.date as string,
          amount:      Number(tx.amount),
          description: tx.description as string | null,
          counterpart: tx.counterpart as string | null,
        },
        dbCategories.length > 0 ? dbCategories : undefined,
      );

      const { error: updateError } = await db
        .from("transactions")
        .update({
          category:          result.category,
          confidence:        result.confidence,
          is_tax_deductible: result.is_tax_deductible,
          anlage_v_zeile:    result.anlage_v_zeile,
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
      firstError ??= msg;
    }
  }

  return NextResponse.json<CategorizeResponse>({ total, categorized, errors, firstError });
}
