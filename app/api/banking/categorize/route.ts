import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";
import {
  categorizeTransaction,
  categorizeTransactionBatch,
  type DbCategoryForPrompt,
} from "@/lib/banking/categorizeTransaction";

// Batch-Verarbeitung: N Batches × ~3 s — deutlich schneller als Einzel-Calls
export const maxDuration = 300;

/** Hilfsfunktion: Array in Chunks aufteilen */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

/** Wartet ms Millisekunden */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Anzahl Transaktionen pro Batch-Call (5 = gute Balance aus Speed & Zuverlässigkeit) */
const BATCH_SIZE = 5;

type CategorizeResponse = {
  total: number;
  categorized: number;
  errors: number;
  firstError: string | null;
};

/** GET /api/banking/categorize — Anzahl unkategorisierter Transaktionen */
export async function GET(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "new";
  const db = serviceRoleClient();

  let query = db
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (mode === "fixold") {
    query = query.like("category", "%(Anlage V%");
  } else if (mode === "force") {
    query = query.not("category", "is", null);
  } else {
    query = query.or("category.is.null,category.neq.aufgeteilt");
  }

  const { count } = await query;
  return NextResponse.json({ count: count ?? 0 });
}

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

  // ── KI-Kategorisierung in Batches ─────────────────────────────────────────
  // Mehrere Transaktionen pro API-Call → weniger Token-Overhead, deutlich schneller.
  // Bei 429-Fehler: 60 s warten und Batch einmal wiederholen.
  let categorized = 0;
  let errors = 0;
  let firstError: string | null = null;

  const chunks = chunkArray(transactions, BATCH_SIZE);

  for (const chunk of chunks) {
    const inputs = chunk.map((tx) => ({
      date:        tx.date as string,
      amount:      Number(tx.amount),
      description: tx.description as string | null,
      counterpart: tx.counterpart as string | null,
    }));

    let results: Awaited<ReturnType<typeof categorizeTransactionBatch>> | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        results = await categorizeTransactionBatch(
          inputs,
          dbCategories.length > 0 ? dbCategories : undefined,
        );
        break; // Erfolg → kein Retry nötig
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const is429 = msg.includes("429");
        if (is429 && attempt === 0) {
          // Rate-Limit: 60 s warten und nochmal versuchen
          await sleep(60_000);
          continue;
        }
        if (attempt === 0 && !is429) {
          // Bei JSON-Fehler: Fallback auf Einzel-Calls für diesen Chunk
          const singleResults = await Promise.allSettled(
            inputs.map((inp) =>
              categorizeTransaction(inp, dbCategories.length > 0 ? dbCategories : undefined),
            ),
          );
          results = singleResults.map((r) =>
            r.status === "fulfilled" ? r.value : null,
          ) as Awaited<ReturnType<typeof categorizeTransactionBatch>>;
          break;
        }
        // Kein Retry mehr möglich → gesamten Chunk als Fehler markieren
        errors += chunk.length;
        firstError ??= msg;
        break;
      }
    }

    if (!results) continue;

    // DB-Updates für jeden Treffer im Chunk
    for (let i = 0; i < chunk.length; i++) {
      const tx = chunk[i];
      const result = results[i];
      if (!result) { errors++; continue; }

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
    }
  }

  return NextResponse.json<CategorizeResponse>({ total, categorized, errors, firstError });
}
