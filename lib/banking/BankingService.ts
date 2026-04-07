/**
 * Abstrakte Schnittstelle für den Zugriff auf Bankingdaten.
 *
 * Der Schnittstellenentwurf ist bewusst quellenneutral — die konkrete
 * Datenherkunft (CSV-Import, FinAPI, direkter Bank-Connector …) ist ein
 * Implementierungsdetail der jeweiligen Klasse, nicht der Schnittstelle.
 *
 * Alle Methoden geben Promises zurück; Fehler werden als abgelehnte
 * Promises (throw / reject) signalisiert — nie als Null-Rückgaben.
 */

import type { ColumnMapping } from "@/lib/banking/parseCSV";

// ── Shared-Typen ──────────────────────────────────────────────────────────────

/**
 * Vollständige Transaktionszeile wie sie aus der Datenquelle kommt.
 * Spiegelt das `transactions`-Schema in Supabase wider.
 */
export type BankingTransaction = {
  id: string;
  user_id: string;
  property_id: string | null;
  /** ISO-Datum "YYYY-MM-DD" */
  date: string;
  /** Vorzeichenbehaftet: negativ = Ausgabe, positiv = Einnahme */
  amount: number;
  description: string | null;
  counterpart: string | null;
  /**
   * Eine der 20 AnlageV-Kategorien oder null (noch nicht kategorisiert).
   * "aufgeteilt" = aufgesplittete Ursprungstransaktion (wird normalerweise
   * gefiltert und nicht an Aufrufer zurückgegeben).
   */
  category: string | null;
  /** Herkunft: "csv_import" | "finapi" | … */
  source: string;
  /** SHA-256-Fingerabdruck zur Duplikatserkennung */
  import_hash: string | null;
  /** Steuerlich absetzbar gemäß § 9 EStG / Anlage V */
  is_tax_deductible: boolean | null;
  /** Zeile in der Anlage V der Einkommensteuererklärung */
  anlage_v_zeile: number | null;
  /** Referenz auf die Ursprungstransaktion wenn per splitTransaction erzeugt */
  split_from_transaction_id: string | null;
  /** KI-Konfidenz der Kategorisierung (0–1) */
  confidence: number | null;
  /** Wurde die Kategorisierung vom Nutzer manuell bestätigt? */
  is_confirmed: boolean;
  created_at: string;
};

/**
 * Aggregierter Kontostand für eine Immobilie (oder alle Immobilien).
 * Split-Ursprünge (category = "aufgeteilt") sind bereits herausgefiltert.
 */
export type AccountBalance = {
  /** Summe aller Eingänge (Betrag > 0) im Zeitraum */
  einnahmen: number;
  /** Summe der absoluten Beträge aller Ausgaben (Betrag < 0) im Zeitraum */
  ausgaben: number;
  /** einnahmen − ausgaben */
  cashflow: number;
  /** Anzahl der berücksichtigten Transaktionen */
  transactionCount: number;
};

/**
 * Ergebnis eines CSV-Imports.
 * Identisch zu ImportSummary aus importTransactions.ts — als eigenständiger
 * Typ in dieser Schnittstelle definiert um Implementierungsdetails zu kapseln.
 */
export type ImportResult = {
  /** Anzahl neu eingefügter Transaktionen */
  inserted: number;
  /** Anzahl übersprungener Duplikate (import_hash bereits vorhanden) */
  skipped: number;
  /** Zeilen mit Parse- oder Datenbankfehler */
  errors: { row: number; error: string }[];
};

// Convenience-Re-Export damit Aufrufer nur dieses Modul importieren müssen
export type { ColumnMapping };

// ── Schnittstelle ─────────────────────────────────────────────────────────────

export interface BankingService {
  /**
   * Gibt alle Transaktionen eines Nutzers zurück, optional gefiltert nach
   * Immobilie und/oder Datumsbereich (beide Enden inklusive).
   *
   * Transaktionen mit `category === "aufgeteilt"` (aufgesplittete Ursprünge)
   * werden automatisch ausgeschlossen, um Doppelzählungen zu vermeiden.
   *
   * @param userId     Supabase-User-ID des Nutzers
   * @param propertyId Wenn angegeben, nur Transaktionen dieser Immobilie
   * @param dateFrom   Startdatum "YYYY-MM-DD" (inklusiv)
   * @param dateTo     Enddatum "YYYY-MM-DD" (inklusiv)
   */
  getTransactions(
    userId: string,
    propertyId?: string | null,
    dateFrom?: string | null,
    dateTo?: string | null,
  ): Promise<BankingTransaction[]>;

  /**
   * Liest eine CSV-Datei, wendet das Spalten-Mapping an und speichert die
   * Transaktionen in der Datenbank.
   *
   * Doppelte Einträge werden anhand des SHA-256-Fingerabdrucks (import_hash)
   * stillschweigend übersprungen — derselbe CSV kann beliebig oft hochgeladen
   * werden ohne Duplikate zu erzeugen.
   *
   * @param file       Rohe CSV-Datei aus einem <input type="file">
   * @param mapping    Welche CSV-Spalte welchem DB-Feld entspricht
   * @param propertyId Immobilie der alle importierten Transaktionen zugeordnet werden
   * @param userId     Eigentümer der Transaktionen
   */
  importFromCSV(
    file: File,
    mapping: ColumnMapping,
    propertyId: string,
    userId: string,
  ): Promise<ImportResult>;

  /**
   * Berechnet Einnahmen, Ausgaben und Cashflow für eine Immobilie.
   *
   * Split-Ursprünge (category = "aufgeteilt") werden ausgeschlossen.
   * Optionaler Datumsfilter schränkt den Betrachtungszeitraum ein.
   *
   * @param propertyId Immobilie
   * @param userId     Eigentümer (für RLS-sichere Abfragen)
   * @param dateFrom   Startdatum "YYYY-MM-DD" (inklusiv)
   * @param dateTo     Enddatum "YYYY-MM-DD" (inklusiv)
   */
  getAccountBalance(
    propertyId: string,
    userId: string,
    dateFrom?: string | null,
    dateTo?: string | null,
  ): Promise<AccountBalance>;
}
