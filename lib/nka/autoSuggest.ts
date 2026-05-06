/**
 * Auto-Suggest für NKA-Kostenpositionen aus Bank-Transaktionen.
 *
 * Pure Funktion: deterministisch, keine Side-Effects, keine I/O. Wird von
 * `/api/nka/periods/[id]/suggest` aufgerufen, das die Inputs aus der DB lädt.
 *
 * Logik:
 *   - Nur Transaktionen mit `amount < 0` werden vorgeschlagen (Ausgaben).
 *     Positive Transaktionen → `skipped_positive`.
 *   - Bereits in `nka_kostenpositionen` verlinkte transaction_ids werden
 *     übersprungen → `skipped_already_linked`.
 *   - Confidence:
 *       * "high"   – `category` matched ein Mapping (Default oder User-Override)
 *       * "medium" – Counterpart enthält BetrKV-typisches Wort (Word-Boundary)
 *       * "low"    – nur Description matched ein Stichwort
 *   - Sortierung: (date ASC, transaction_id ASC) → Determinismus.
 *
 * Word-Boundary-Match (`containsWord`) verhindert den klassischen
 * Müll/Müller-Bug: "Müller GmbH" matcht NICHT auf "müll".
 */

import type { BetrkvPosition } from "./distribute";

// ─── Public Types ────────────────────────────────────────────────────────────

export type CategoryToBetrkvMapping = Record<string, BetrkvPosition>;

/**
 * Default-Mapping. User-Categories aus DB können das per `mapping`-Param
 * überschreiben.
 */
export const DEFAULT_CATEGORY_MAPPING: CategoryToBetrkvMapping = {
  "Grundsteuer": "grundsteuer",
  "Müllabfuhr": "muellabfuhr",
  "Wasserversorgung": "wasser",
  "Abwasser": "abwasser",
  "Heizung": "heizung",
  "Heizkosten": "heizung",
  "Warmwasser": "warmwasser",
  "Hausversicherungen": "sach_haftpflicht_versicherung",
  "Hauswart": "hauswart",
  "Hausmeister": "hauswart",
  "Schornsteinreinigung": "schornsteinreinigung",
  "Hausbeleuchtung": "beleuchtung",
  "Allgemeinstrom": "beleuchtung",
  "Gebäudereinigung": "gebaeudereinigung",
  "Gartenpflege": "gartenpflege",
  "Straßenreinigung": "strassenreinigung",
};

export type AutoSuggestInput = {
  /** Banking-Transaktionen, eingeschränkt auf das relevante Jahr/Property. */
  transactions: Array<{
    id: string;
    date: string; // ISO yyyy-mm-dd
    amount: number; // Negativ für Ausgaben
    category: string | null;
    counterpart: string | null;
    description: string | null;
  }>;
  /** Periode, in der die Suggestions liegen sollen (nur tx mit date ∈ Periode). */
  periodStart: string;
  periodEnd: string;
  /** Bereits verlinkte transaction_ids — werden zum Dedup übersprungen. */
  linkedTransactionIds: string[];
  /** Optional: User-spezifisches Mapping. Überschreibt den Default. */
  mapping?: CategoryToBetrkvMapping;
};

export type AutoSuggestion = {
  transaction_id: string;
  position: BetrkvPosition;
  brutto_cents: number;
  date: string;
  counterpart: string | null;
  description: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export type AutoSuggestOutput = {
  suggestions: AutoSuggestion[];
  /** Transaktionen, die bereits einer NKA-Position verlinkt sind (skipped). */
  skipped_already_linked: string[];
  /** Transaktionen mit positiver Summe (Einnahme — kein NKA-Vorschlag). */
  skipped_positive: string[];
};

// ─── Internals ───────────────────────────────────────────────────────────────

/**
 * Wort-Heuristiken pro BetrKV-Position. Reihenfolge ist Reihenfolge der Prüfung;
 * bei mehreren Matches wird das erste Stichwort als reason genannt.
 *
 * Wichtig: Wir matchen mit Word-Boundaries (siehe `containsWord`), damit
 * "Müll" NICHT auf "Müller" matcht.
 */
const WORD_HEURISTICS: Array<{
  position: BetrkvPosition;
  words: string[];
}> = [
  { position: "muellabfuhr", words: ["müllabfuhr", "abfallwirtschaft", "müllgebühr", "abfall"] },
  { position: "wasser", words: ["stadtwerke wasser", "wasserwerke", "wasserversorgung"] },
  { position: "abwasser", words: ["abwasser", "abwasserentsorgung", "kanalgebühr"] },
  { position: "heizung", words: ["heizöl", "gasversorgung", "fernwärme", "heizung"] },
  { position: "warmwasser", words: ["warmwasser"] },
  { position: "strassenreinigung", words: ["straßenreinigung", "stadtreinigung"] },
  { position: "gebaeudereinigung", words: ["hausreinigung", "gebäudereinigung", "treppenhausreinigung"] },
  { position: "gartenpflege", words: ["gartenpflege", "garten"] },
  { position: "beleuchtung", words: ["allgemeinstrom", "hausbeleuchtung"] },
  { position: "schornsteinreinigung", words: ["schornsteinfeger", "kaminkehrer", "schornsteinreinigung"] },
  { position: "sach_haftpflicht_versicherung", words: ["gebäudeversicherung", "haftpflichtversicherung", "wohngebäudeversicherung"] },
  { position: "hauswart", words: ["hauswart", "hausmeister"] },
  { position: "grundsteuer", words: ["grundsteuer"] },
  { position: "wartung", words: ["wartung", "aufzugswartung"] },
];

/**
 * Word-Boundary-Match: prüft, ob `haystack` `needle` als komplettes Wort
 * (umgeben von Nicht-Wort-Zeichen oder Stringgrenzen) enthält. Case-insensitive,
 * Unicode-aware (\p{L} statt ASCII \w), damit "Müller" als ein Wort gilt.
 *
 * Achtung: `needle` darf Sonderzeichen wie "ß" oder "ä" enthalten — wir
 * escapen Regex-Metazeichen, aber lassen Unicode-Zeichen unverändert.
 */
export function containsWord(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // (?<![\p{L}\p{N}]) und (?![\p{L}\p{N}]) als Word-Boundaries (Unicode).
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "iu",
  );
  return pattern.test(haystack);
}

/** Findet ein Stichwort-Match in counterpart oder description. */
function findWordMatch(
  text: string | null,
): { position: BetrkvPosition; word: string } | null {
  if (!text) return null;
  for (const { position, words } of WORD_HEURISTICS) {
    for (const w of words) {
      if (containsWord(text, w)) return { position, word: w };
    }
  }
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function suggestNkaCostItems(input: AutoSuggestInput): AutoSuggestOutput {
  const linkedSet = new Set(input.linkedTransactionIds);
  const mapping = input.mapping ?? DEFAULT_CATEGORY_MAPPING;
  const skippedAlreadyLinked: string[] = [];
  const skippedPositive: string[] = [];
  const suggestions: AutoSuggestion[] = [];

  for (const tx of input.transactions) {
    // Periode-Filter: tx.date ∈ [periodStart, periodEnd]
    if (tx.date < input.periodStart || tx.date > input.periodEnd) continue;

    if (linkedSet.has(tx.id)) {
      skippedAlreadyLinked.push(tx.id);
      continue;
    }

    if (tx.amount >= 0) {
      // Wenn die Transaktion positiv ist UND kategorisiert wäre, melden wir sie
      // dennoch als skipped_positive — sonst würden Stadtwerke-Gutschriften lautlos
      // verschwinden und der User würde sie nie finden.
      const wouldHaveCategoryMatch =
        tx.category !== null && mapping[tx.category] !== undefined;
      const wouldHaveWordMatch =
        findWordMatch(tx.counterpart) !== null ||
        findWordMatch(tx.description) !== null;
      if (wouldHaveCategoryMatch || wouldHaveWordMatch) {
        skippedPositive.push(tx.id);
      }
      continue;
    }

    // 1) Direct category match → high confidence
    let position: BetrkvPosition | null = null;
    let confidence: "high" | "medium" | "low" | null = null;
    let reason = "";

    if (tx.category && mapping[tx.category]) {
      position = mapping[tx.category];
      confidence = "high";
      reason = `Kategorie "${tx.category}" → ${position}`;
    } else {
      // 2) Counterpart-Heuristik → medium
      const cpMatch = findWordMatch(tx.counterpart);
      if (cpMatch) {
        position = cpMatch.position;
        confidence = "medium";
        reason = `Counterpart enthält "${cpMatch.word}" → ${position}`;
      } else {
        // 3) Description-Heuristik → low
        const descMatch = findWordMatch(tx.description);
        if (descMatch) {
          position = descMatch.position;
          confidence = "low";
          reason = `Verwendungszweck enthält "${descMatch.word}" → ${position}`;
        }
      }
    }

    if (position && confidence) {
      const brutto_cents = Math.round(Math.abs(tx.amount) * 100);
      suggestions.push({
        transaction_id: tx.id,
        position,
        brutto_cents,
        date: tx.date,
        counterpart: tx.counterpart,
        description: tx.description,
        confidence,
        reason,
      });
    }
  }

  // Determinismus: (date ASC, transaction_id ASC)
  suggestions.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.transaction_id < b.transaction_id ? -1 : 1;
  });
  skippedAlreadyLinked.sort();
  skippedPositive.sort();

  return {
    suggestions,
    skipped_already_linked: skippedAlreadyLinked,
    skipped_positive: skippedPositive,
  };
}
