/**
 * Rentabilitätsberechnung für eine Immobilie über einen beliebigen Zeitraum.
 *
 * Alle Beträge in Euro, alle Prozentangaben als Dezimalwert × 100 (z. B. 3.2 = 3,2 %).
 * Die Funktion ist rein und hat keine Seiteneffekte — sie benötigt nur die
 * aufbereiteten Transaktionen und den Immobilien-Steckbrief als Input.
 *
 * Browser- und serverseitig nutzbar (keine externen Abhängigkeiten).
 */

// ── Eingabe-Typen ─────────────────────────────────────────────────────────────

/** Minimale Transaktionsfelder die für die Berechnung benötigt werden */
export type ProfitabilityTransaction = {
  date: string;           // ISO-Datum "YYYY-MM-DD"
  amount: number;         // positiv = Einnahme, negativ = Ausgabe
  category: string | null;
};

/** Immobilien-Steckbrief (nur relevante Felder) */
export type PropertyInput = {
  /** Gesamter Kaufpreis (wird für Renditeberechnung genutzt), in Euro */
  kaufpreis: number;
  /**
   * Gebäudeanteil des Kaufpreises – AfA-Bemessungsgrundlage nach § 7 Abs. 4 EStG.
   * Wenn gesetzt, wird dieser Wert für die AfA-Berechnung verwendet.
   * Falls null, fällt die Berechnung auf kaufpreis zurück (konservativ / weniger präzise).
   * Grund und Boden ist NICHT abschreibbar (§ 11d EStDV).
   */
  gebaeudewert?: number | null;
  /**
   * AfA-Satz in Prozent (z. B. 2.0 für 2 % linear nach § 7 Abs. 4 EStG).
   * Aktuelle Sätze:
   * - 3 % für Gebäude, Fertigstellung ab 01.01.2023 (JStG 2022)
   * - 2 % für Gebäude, Fertigstellung 01.01.1925 – 31.12.2022
   * - 2,5 % für Gebäude, Fertigstellung vor 01.01.1925
   */
  afa_satz: number;
  /**
   * Kaufdatum als ISO-String "YYYY-MM-DD" (optional).
   * Wird für die Spekulationssteuer-Berechnung (§ 23 EStG) benötigt:
   * Spekulationssteuer entfällt nach 10 Jahren Haltefrist.
   */
  kaufdatum?: string | null;
};

/** Datumsbereich für die Berechnung (beide Enden inklusive) */
export type DateRange = {
  /** "YYYY-MM-DD" */
  von: string;
  /** "YYYY-MM-DD" */
  bis: string;
};

// ── Ergebnis-Typ ──────────────────────────────────────────────────────────────

export type ProfitabilityResult = {
  // ── Zeitraum ────────────────────────────────────────────────────────────────
  /** Anzahl Monate im Betrachtungszeitraum (kann Dezimalwert sein bei Teilmonaten) */
  anzahl_monate: number;

  // ── Cashflow ────────────────────────────────────────────────────────────────
  /** Summe aller Einnahmen im Zeitraum (positiv) */
  einnahmen: number;
  /** Summe aller Ausgaben im Zeitraum (positiv, d. h. Betrag ohne Vorzeichen) */
  ausgaben: number;
  /** Einnahmen − Ausgaben */
  cashflow_brutto: number;

  // ── AfA ─────────────────────────────────────────────────────────────────────
  /** Kaufpreis × AfA-Satz / 100 */
  afa_jahresbetrag: number;
  /** afa_jahresbetrag / 12 × anzahl_monate */
  afa_periodenanteil: number;

  // ── Steuerlicher Gewinn / Verlust ────────────────────────────────────────────
  /** Summe der Schuldzinsen im Zeitraum (positiv) */
  zinsen: number;
  /**
   * cashflow_brutto − afa_periodenanteil − zinsen
   *
   * Entspricht dem steuerlichen Überschuss / Verlust gemäß Anlage V.
   * Negativ = steuerlicher Verlust (reduziert zu versteuerndes Einkommen).
   * Hinweis: Vereinfachung — keine weitere steuerliche Sonderabschreibung berücksichtigt.
   */
  steuerlicher_gewinn_verlust: number;

  // ── Rendite ─────────────────────────────────────────────────────────────────
  /**
   * Brutto-Mietrendite p. a. in Prozent.
   * Formel: (einnahmen_annualisiert / kaufpreis) × 100
   * Null wenn kaufpreis = 0 oder kein Zeitraum.
   */
  rendite_brutto: number;
  /**
   * Netto-Cashflow-Rendite p. a. in Prozent.
   * Formel: (cashflow_brutto_annualisiert / kaufpreis) × 100
   * Null wenn kaufpreis = 0 oder kein Zeitraum.
   */
  rendite_netto: number;

  // ── Hilfswerte (annualisiert) ────────────────────────────────────────────────
  /** Einnahmen hochgerechnet auf 12 Monate */
  einnahmen_annualisiert: number;
  /** Cashflow brutto hochgerechnet auf 12 Monate */
  cashflow_brutto_annualisiert: number;
};

// ── Kategorien ────────────────────────────────────────────────────────────────

/** Minimaler DB-Kategorie-Typ für die Profitabilitätsberechnung */
export type ProfitabilityDbCategory = {
  label: string;
  typ: string;          // "einnahme" | "ausgabe"
  anlage_v: string | null;
  gruppe: string;
};

/** Alte Slugs für Abwärtskompatibilität (Transaktionen vor der DB-Migration) */
const OLD_EINNAHMEN_SLUGS = new Set<string>([
  "miete_einnahmen_wohnen",
  "miete_einnahmen_gewerbe",
  "nebenkosten_einnahmen",
  "mietsicherheit_einnahme",
  "sonstige_einnahmen",
]);

const OLD_ZINSEN_SLUGS = new Set<string>(["schuldzinsen"]);

function isEinnahme(cat: string, dbCats?: Map<string, ProfitabilityDbCategory>): boolean {
  if (dbCats) {
    const db = dbCats.get(cat);
    if (db) return db.typ === "einnahme";
  }
  return OLD_EINNAHMEN_SLUGS.has(cat);
}

function isZinsen(cat: string, dbCats?: Map<string, ProfitabilityDbCategory>): boolean {
  if (dbCats) {
    const db = dbCats.get(cat);
    if (db) return db.anlage_v === "Z. 35";
  }
  return OLD_ZINSEN_SLUGS.has(cat);
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/**
 * Berechnet die Anzahl vollständiger Monate zwischen zwei ISO-Daten (inklusive).
 * Verwendet Kalendermonatsgrenzen — ein angefangener Monat wird als voller Monat gezählt.
 */
function countMonths(von: string, bis: string): number {
  const start = new Date(von);
  const end   = new Date(bis);
  if (end < start) return 0;
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    1
  );
}

/** Prüft ob ein ISO-Datum im gegebenen Bereich liegt */
function inRange(date: string, von: string, bis: string): boolean {
  return date >= von && date <= bis;
}

// ── Hauptfunktion ─────────────────────────────────────────────────────────────

/**
 * Berechnet Rentabilitätskennzahlen für eine Immobilie.
 *
 * @param transactions  Alle Transaktionen der Immobilie (ungefiltert nach Zeitraum —
 *                      die Funktion filtert selbst auf `dateRange`).
 *                      Nur Transaktionen mit `is_confirmed !== false` werden berücksichtigt.
 * @param property      Immobilien-Steckbrief mit Kaufpreis und AfA-Satz.
 * @param dateRange     Betrachtungszeitraum (beide Enden inklusive).
 *
 * @example
 * const result = calculateProfitability(transactions, property, {
 *   von: "2025-01-01",
 *   bis: "2025-12-31",
 * });
 * console.log(`Brutto-Rendite: ${result.rendite_brutto.toFixed(2)} %`);
 */
export function calculateProfitability(
  transactions: ProfitabilityTransaction[],
  property: PropertyInput,
  dateRange: DateRange,
  dbCategories?: ProfitabilityDbCategory[],
): ProfitabilityResult {
  const { von, bis } = dateRange;
  const { kaufpreis, afa_satz } = property;
  // AfA-Basis: Gebäudewert wenn bekannt, sonst Gesamtkaufpreis (konservativere Schätzung)
  const afaBasis = (property.gebaeudewert != null && property.gebaeudewert > 0)
    ? property.gebaeudewert
    : kaufpreis;

  // DB-Kategorien als Map für schnellen Lookup
  const dbCatMap = dbCategories
    ? new Map(dbCategories.map((c) => [c.label, c]))
    : undefined;

  // ── Zeitraum-Länge ────────────────────────────────────────────────────────
  const anzahl_monate = Math.max(0, countMonths(von, bis));

  // ── Transaktionen filtern ─────────────────────────────────────────────────
  // Eingeschlossen: alle kategorisierten Buchungen im Zeitraum, unabhängig von
  // is_confirmed (KI-Kategorisierung reicht; manuelles Bestätigen ist kein Pflichtschritt).
  // Ausgeschlossen: unkategorisierte (category = null) — würden sonst fälschlicherweise
  // als Ausgaben zählen — sowie Aufspaltungs-Ursprünge ("aufgeteilt").
  const relevant = transactions.filter(
    (t) =>
      t.category !== null &&
      t.category !== "aufgeteilt" &&
      inRange(t.date, von, bis),
  );

  // ── Aggregation ───────────────────────────────────────────────────────────
  let einnahmen = 0;
  let ausgaben  = 0;
  let zinsen    = 0;

  for (const tx of relevant) {
    const amount = Number(tx.amount);
    const cat    = tx.category ?? "";

    if (isEinnahme(cat, dbCatMap)) {
      einnahmen += amount; // positiv
    } else {
      ausgaben += Math.abs(amount); // als positiven Wert speichern
      if (isZinsen(cat, dbCatMap)) {
        zinsen += Math.abs(amount);
      }
    }
  }

  // ── Cashflow ──────────────────────────────────────────────────────────────
  const cashflow_brutto = einnahmen - ausgaben;

  // ── AfA ───────────────────────────────────────────────────────────────────
  // § 7 Abs. 4 EStG: nur der Gebäudewert ist abschreibbar, nicht Grund + Inventar
  const afa_jahresbetrag  = afaBasis > 0 ? (afaBasis * afa_satz) / 100 : 0;
  const afa_periodenanteil =
    anzahl_monate > 0 ? (afa_jahresbetrag / 12) * anzahl_monate : 0;

  // ── Steuerlicher Gewinn / Verlust ─────────────────────────────────────────
  // Einnahmen − alle Werbungskosten − AfA (Zinsen sind Teil der Ausgaben,
  // werden hier explizit ausgewiesen aber nicht doppelt abgezogen)
  const steuerlicher_gewinn_verlust = cashflow_brutto - afa_periodenanteil;

  // ── Rendite (annualisiert) ────────────────────────────────────────────────
  const annualisierungsFaktor = anzahl_monate > 0 ? 12 / anzahl_monate : 0;
  const einnahmen_annualisiert       = einnahmen * annualisierungsFaktor;
  const cashflow_brutto_annualisiert = cashflow_brutto * annualisierungsFaktor;

  const rendite_brutto =
    kaufpreis > 0 && anzahl_monate > 0
      ? (einnahmen_annualisiert / kaufpreis) * 100
      : 0;

  const rendite_netto =
    kaufpreis > 0 && anzahl_monate > 0
      ? (cashflow_brutto_annualisiert / kaufpreis) * 100
      : 0;

  return {
    anzahl_monate,
    einnahmen,
    ausgaben,
    cashflow_brutto,
    afa_jahresbetrag,
    afa_periodenanteil,
    zinsen,
    steuerlicher_gewinn_verlust,
    rendite_brutto,
    rendite_netto,
    einnahmen_annualisiert,
    cashflow_brutto_annualisiert,
  };
}
