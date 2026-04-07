/**
 * Teilt eine Kredit-Transaktion (Annuität) in zwei Teil-Transaktionen auf:
 *   1. Zinsanteil    → category: schuldzinsen,   is_tax_deductible: true,  Anlage V Z. 35
 *   2. Tilgungsanteil → category: tilgung_kredit, is_tax_deductible: false, anlage_v_zeile: null
 *
 * Die Original-Transaktion bleibt erhalten und wird mit category = 'aufgeteilt'
 * markiert, damit sie bei Summenberechnungen herausgefiltert werden kann.
 * Beide Splits erhalten split_from_transaction_id = ID der Original-Transaktion.
 *
 * Nur server-seitig nutzbar (Supabase Service-Role-Client).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Typen ─────────────────────────────────────────────────────────────────────

export type SplitInput = {
  /** ID der aufzuteilenden Original-Transaktion */
  transactionId: string;
  /** Zinsanteil in Euro (positiver Wert, wird intern negiert da Ausgabe) */
  interestAmount: number;
  /** Tilgungsanteil in Euro (positiver Wert, wird intern negiert da Ausgabe) */
  principalAmount: number;
  /** Supabase-User-ID des anfragenden Nutzers (für Ownership-Prüfung) */
  userId: string;
};

export type SplitResult = {
  /** Neu angelegte Zinsen-Transaktion */
  interestTransaction: SplitTransaction;
  /** Neu angelegte Tilgungs-Transaktion */
  principalTransaction: SplitTransaction;
  /** Aktualisierte Original-Transaktion (category = 'aufgeteilt') */
  originalTransaction: SplitTransaction;
};

export type SplitTransaction = {
  id: string;
  date: string;
  amount: number;
  description: string | null;
  counterpart: string | null;
  category: string;
  is_tax_deductible: boolean | null;
  anlage_v_zeile: number | null;
  split_from_transaction_id: string | null;
};

// ── Toleranz für Rundungsfehler ───────────────────────────────────────────────
const ROUNDING_TOLERANCE = 0.02; // ± 2 Cent

// ── Kern-Funktion ─────────────────────────────────────────────────────────────

/**
 * Liest die Original-Transaktion, validiert die Aufteilung und legt zwei
 * Teil-Transaktionen in Supabase an. Läuft in einer logischen Sequenz von
 * drei DB-Operationen (kein echtes Transaction-Support in Supabase JS).
 *
 * @throws Error bei fehlenden Rechten, ungültiger Aufteilung oder DB-Fehler
 */
export async function splitTransaction(
  db: SupabaseClient,
  input: SplitInput,
): Promise<SplitResult> {
  const { transactionId, interestAmount, principalAmount, userId } = input;

  // ── 1. Original-Transaktion laden und Eigentümerschaft prüfen ─────────────
  const { data: original, error: fetchError } = await db
    .from("transactions")
    .select(
      "id, user_id, date, amount, description, counterpart, property_id, category",
    )
    .eq("id", transactionId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !original) {
    throw new Error(
      fetchError?.message ?? "Transaktion nicht gefunden oder kein Zugriff.",
    );
  }

  // ── 2. Bereits aufgeteilt? ─────────────────────────────────────────────────
  if (original.category === "aufgeteilt") {
    throw new Error(
      "Diese Transaktion wurde bereits aufgeteilt. Bitte die bestehenden Splits bearbeiten.",
    );
  }

  // ── 3. Beträge validieren ──────────────────────────────────────────────────
  if (interestAmount < 0 || principalAmount < 0) {
    throw new Error(
      "Zins- und Tilgungsanteil müssen positive Werte sein.",
    );
  }

  const originalAbs = Math.abs(Number(original.amount));
  const splitSum = interestAmount + principalAmount;

  if (Math.abs(splitSum - originalAbs) > ROUNDING_TOLERANCE) {
    throw new Error(
      `Summe der Anteile (${splitSum.toFixed(2)} €) stimmt nicht mit dem Originalbetrag (${originalAbs.toFixed(2)} €) überein. Maximale Abweichung: ${ROUNDING_TOLERANCE.toFixed(2)} €.`,
    );
  }

  // Vorzeichen vom Original übernehmen (Kreditrate ist normalerweise negativ)
  const sign = Number(original.amount) < 0 ? -1 : 1;

  // ── 4. Zwei Teil-Transaktionen anlegen ────────────────────────────────────
  const splits = [
    {
      user_id:                   userId,
      property_id:               original.property_id ?? null,
      date:                      original.date,
      amount:                    sign * interestAmount,
      description:               original.description
                                   ? `Zinsanteil: ${original.description}`
                                   : "Zinsanteil",
      counterpart:               original.counterpart,
      category:                  "schuldzinsen",
      is_tax_deductible:         true,
      anlage_v_zeile:            35,
      split_from_transaction_id: transactionId,
      source:                    "csv_import",
    },
    {
      user_id:                   userId,
      property_id:               original.property_id ?? null,
      date:                      original.date,
      amount:                    sign * principalAmount,
      description:               original.description
                                   ? `Tilgungsanteil: ${original.description}`
                                   : "Tilgungsanteil",
      counterpart:               original.counterpart,
      category:                  "tilgung_kredit",
      is_tax_deductible:         false,
      anlage_v_zeile:            null,
      split_from_transaction_id: transactionId,
      source:                    "csv_import",
    },
  ];

  const { data: inserted, error: insertError } = await db
    .from("transactions")
    .insert(splits)
    .select(
      "id, date, amount, description, counterpart, category, is_tax_deductible, anlage_v_zeile, split_from_transaction_id",
    );

  if (insertError || !inserted || inserted.length < 2) {
    throw new Error(
      insertError?.message ?? "Teil-Transaktionen konnten nicht angelegt werden.",
    );
  }

  // ── 5. Original als 'aufgeteilt' markieren ────────────────────────────────
  // category = 'aufgeteilt' → wird bei Summen / Anlage-V-Auswertung übersprungen
  const { data: updatedOriginal, error: updateError } = await db
    .from("transactions")
    .update({ category: "aufgeteilt" })
    .eq("id", transactionId)
    .select(
      "id, date, amount, description, counterpart, category, is_tax_deductible, anlage_v_zeile, split_from_transaction_id",
    )
    .single();

  if (updateError || !updatedOriginal) {
    // Splits sind angelegt — Original-Markierung schlägt fehl → Warnung, kein Hard-Error
    console.warn(
      "splitTransaction: Original konnte nicht als 'aufgeteilt' markiert werden:",
      updateError?.message,
    );
  }

  const [interestTransaction, principalTransaction] =
    inserted as SplitTransaction[];

  return {
    interestTransaction,
    principalTransaction,
    originalTransaction: (updatedOriginal as SplitTransaction) ?? {
      ...original,
      category: "aufgeteilt",
      is_tax_deductible: null,
      anlage_v_zeile: null,
      split_from_transaction_id: null,
    },
  };
}
