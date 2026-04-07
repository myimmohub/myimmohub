/**
 * Lern-Schleife: Wendet bestätigte Kategorisierungen automatisch auf neu
 * importierte Transaktionen an, wenn Auftraggeber und/oder Verwendungszweck
 * mit einer früheren, vom Nutzer bestätigten Buchung übereinstimmen.
 *
 * Beispiel: "Abschluss" wurde manuell auf "Kontoführungsgebühren" geändert und
 * bestätigt → alle zukünftigen Buchungen mit "Abschluss" im Verwendungszweck
 * erhalten diese Kategorie ohne KI-Lauf.
 *
 * Matching-Priorität (absteigend):
 *   1. Auftraggeber (normalisiert) + Verwendungszweck-Präfix (40 Zeichen)
 *   2. Auftraggeber allein (wenn eindeutig, mind. 4 Zeichen)
 *   3. Verwendungszweck-Präfix allein (mind. 5 Zeichen)
 *
 * Neu übernommene Transaktionen erhalten confidence = 0.95 (hohes Vertrauen,
 * da Nutzers eigene Bestätigung als Grundlage dient) und is_confirmed = false,
 * damit der Nutzer die Übernahme im Review noch sehen und korrigieren kann.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Typen ──────────────────────────────────────────────────────────────────────

type LearningRule = {
  category: string;
  is_tax_deductible: boolean | null;
  anlage_v_zeile: number | null;
};

type RawTransaction = {
  id: string;
  description: string | null;
  counterpart: string | null;
};

export type ApplyLearningResult = {
  /** Anzahl der Transaktionen, auf die eine Lernregel angewendet wurde */
  applied: number;
};

// ── Normalisierung ────────────────────────────────────────────────────────────

/** Kleinschreibung, Whitespace zusammenführen, Sonderzeichen entfernen */
function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")  // Sonderzeichen → Leerzeichen
    .replace(/\s+/g, " ")       // mehrfache Leerzeichen zusammenführen
    .trim();
}

/** Aufbau der Lookup-Keys in absteigender Spezifität */
function makeKeys(counterpart: string | null, description: string | null): string[] {
  const cp   = normalize(counterpart);
  const desc = normalize(description).slice(0, 40);
  const keys: string[] = [];

  // Höchste Spezifität: beides vorhanden
  if (cp.length >= 4 && desc.length >= 4) {
    keys.push(`cp:${cp}|desc:${desc}`);
  }
  // Mittlere Spezifität: nur Auftraggeber
  if (cp.length >= 4) {
    keys.push(`cp:${cp}`);
  }
  // Niedrigste Spezifität: nur Verwendungszweck
  if (desc.length >= 5) {
    keys.push(`desc:${desc}`);
  }

  return keys;
}

// ── Hauptfunktion ─────────────────────────────────────────────────────────────

/**
 * @param db              Supabase-Client (service-role empfohlen)
 * @param userId          ID des Nutzers dessen bestätigte Regeln als Grundlage dienen
 * @param newIds          IDs der gerade neu importierten Transaktionen
 */
export async function applyLearning(
  db: SupabaseClient,
  userId: string,
  newIds: string[],
): Promise<ApplyLearningResult> {
  if (newIds.length === 0) return { applied: 0 };

  // ── Schritt 1: Bestätigte Regeln laden (neueste zuerst → gewinnt bei Konflikten) ──
  const { data: confirmed, error: confirmedErr } = await db
    .from("transactions")
    .select("description, counterpart, category, is_tax_deductible, anlage_v_zeile")
    .eq("user_id", userId)
    .eq("is_confirmed", true)
    .not("category", "is", null)
    .neq("category", "aufgeteilt")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (confirmedErr || !confirmed?.length) return { applied: 0 };

  // ── Schritt 2: Regel-Map aufbauen ─────────────────────────────────────────
  // Ältere Einträge werden durch neuere überschrieben (da wir desc-sortiert lesen,
  // setzen wir in umgekehrter Reihenfolge — letzter Schreiber verliert → neueste gewinnt)
  const rules = new Map<string, LearningRule>();

  // Rückwärts iterieren damit die neueste Bestätigung gewinnt
  for (let i = confirmed.length - 1; i >= 0; i--) {
    const c = confirmed[i];
    const rule: LearningRule = {
      category:          c.category as string,
      is_tax_deductible: c.is_tax_deductible as boolean | null,
      anlage_v_zeile:    c.anlage_v_zeile as number | null,
    };
    for (const key of makeKeys(c.counterpart as string | null, c.description as string | null)) {
      rules.set(key, rule);
    }
  }

  if (rules.size === 0) return { applied: 0 };

  // ── Schritt 3: Neue Transaktionen laden ───────────────────────────────────
  const { data: newTxs, error: newErr } = await db
    .from("transactions")
    .select("id, description, counterpart")
    .in("id", newIds)
    .is("category", null);     // nur noch unkategorisierte anfassen

  if (newErr || !newTxs?.length) return { applied: 0 };

  // ── Schritt 4: Matching + Batch-Update ───────────────────────────────────
  type Update = { id: string } & LearningRule & { confidence: number };
  const updates: Update[] = [];

  for (const tx of newTxs as RawTransaction[]) {
    for (const key of makeKeys(tx.counterpart, tx.description)) {
      const rule = rules.get(key);
      if (rule) {
        updates.push({ id: tx.id, ...rule, confidence: 0.95 });
        break; // erster (spezifischster) Treffer gewinnt
      }
    }
  }

  if (updates.length === 0) return { applied: 0 };

  // Parallele Updates (je Transaktion ein PATCH — Supabase unterstützt kein
  // bulk-update mit unterschiedlichen Werten pro Zeile)
  await Promise.all(
    updates.map(({ id, category, is_tax_deductible, anlage_v_zeile, confidence }) =>
      db
        .from("transactions")
        .update({ category, is_tax_deductible, anlage_v_zeile, confidence })
        .eq("id", id)
        .eq("user_id", userId),
    ),
  );

  return { applied: updates.length };
}
