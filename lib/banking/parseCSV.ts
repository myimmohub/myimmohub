import Papa from "papaparse";

// ── Typen ─────────────────────────────────────────────────────────────────────

/** Spalten-Mapping: Datenbankfeld → CSV-Spaltenname */
export type ColumnMapping = {
  /** Pflichtfeld: Spalte die das Buchungsdatum enthält */
  date: string;
  /** Pflichtfeld: Spalte die den Betrag enthält */
  amount: string;
  /** Optional: Verwendungszweck / Buchungstext */
  description?: string;
  /** Optional: Auftraggeber oder Empfänger */
  counterpart?: string;
};

/** Eine bereinigte, importfertige Transaktion */
export type ParsedTransaction = {
  /** ISO-Datum: YYYY-MM-DD */
  date: string;
  /** Dezimalzahl; negativ = Ausgabe, positiv = Einnahme */
  amount: number;
  description: string | null;
  counterpart: string | null;
  /** Originalzeile (0-basiert, ohne Headerzeile) für Fehlerberichte */
  _rowIndex: number;
};

/** Ergebnis von parseCSV */
export type ParseCSVResult = {
  transactions: ParsedTransaction[];
  errors: ParseRowError[];
};

/** Fehler für eine einzelne CSV-Zeile */
export type ParseRowError = {
  /** 1-basierte Zeilennummer (ohne Headerzeile) */
  row: number;
  field: "date" | "amount" | "general";
  message: string;
  rawValue: string;
};

// ── Datums-Parser ─────────────────────────────────────────────────────────────

/**
 * Wandelt gängige Datumsformate in ISO 8601 (YYYY-MM-DD) um.
 *
 * Unterstützte Eingaben:
 *   DD.MM.YYYY   → 31.12.2024  (deutsche Banken)
 *   DD.MM.YY     → 31.12.24    (Kurzjahr, 2000–2099)
 *   YYYY-MM-DD   → 2024-12-31  (bereits korrekt)
 *   DD/MM/YYYY   → 31/12/2024
 *   MM/DD/YYYY   → 12/31/2024  (US-Format, Fallback)
 *   YYYYMMDD     → 20241231    (kompaktes ISO)
 */
export function parseDate(raw: string): string {
  const s = raw.trim();

  // DD.MM.YYYY
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  // DD.MM.YY (Kurzjahr)
  const dmyShort = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (dmyShort) {
    const year = parseInt(dmyShort[3], 10);
    const fullYear = year >= 0 && year <= 99 ? 2000 + year : year;
    return `${fullYear}-${dmyShort[2].padStart(2, "0")}-${dmyShort[1].padStart(2, "0")}`;
  }

  // YYYY-MM-DD (bereits ISO)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  // YYYYMMDD (kompaktes ISO)
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }

  // DD/MM/YYYY
  const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmySlash) {
    // Heuristik: wenn erster Teil > 12, muss es DD/MM sein
    const first = parseInt(dmySlash[1], 10);
    if (first > 12) {
      return `${dmySlash[3]}-${dmySlash[2].padStart(2, "0")}-${dmySlash[1].padStart(2, "0")}`;
    }
    // Sonst als DD/MM/YYYY interpretieren (häufiger in DE/EU)
    return `${dmySlash[3]}-${dmySlash[2].padStart(2, "0")}-${dmySlash[1].padStart(2, "0")}`;
  }

  // Letzter Versuch via Date.parse (behandelt viele englische Formate)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }

  throw new Error(`Unbekanntes Datumsformat: "${raw}"`);
}

// ── Betrags-Parser ────────────────────────────────────────────────────────────

/**
 * Wandelt Betragsstrings in eine JavaScript-Zahl um.
 *
 * Unterstützte Eingaben:
 *   1.234,56   → 1234.56   (deutsch: Punkt = Tausender, Komma = Dezimal)
 *   -1.234,56  → -1234.56
 *   1,234.56   → 1234.56   (englisch: Komma = Tausender, Punkt = Dezimal)
 *   1234,56    → 1234.56   (kein Tausendertrenner, Komma = Dezimal)
 *   1234.56    → 1234.56   (kein Tausendertrenner, Punkt = Dezimal)
 *   1.234      → 1234      (ganzer Betrag mit Tausenderpunkt, kein Dezimal)
 *   „1.234,56 €" oder „EUR 1.234,56" → 1234.56
 */
export function parseAmount(raw: string): number {
  // Währungssymbole, Leerzeichen und bekannte Währungskürzel entfernen
  let s = raw.trim().replace(/[€$£¥\s]|EUR|USD|GBP/gi, "").trim();

  if (s === "" || s === "-" || s === "+") {
    throw new Error(`Leerer Betrag: "${raw}"`);
  }

  // Vorzeichen merken und entfernen für saubere Mustererkennung
  const negative = s.startsWith("-");
  const positive = s.startsWith("+");
  if (negative || positive) s = s.slice(1).trim();

  let normalized: string;

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    // Deutsches Format mit Tausenderpunkten: 1.234,56 oder 1.234
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    // Englisches Format mit Tausenderkommas: 1,234.56 oder 1,234
    normalized = s.replace(/,/g, "");
  } else if (/^\d+,\d+$/.test(s)) {
    // Kein Tausendertrenner, Komma als Dezimalzeichen: 1234,56
    normalized = s.replace(",", ".");
  } else if (/^\d+(\.\d+)?$/.test(s)) {
    // Bereits normales Dezimalformat oder ganze Zahl: 1234 oder 1234.56
    normalized = s;
  } else {
    throw new Error(`Unbekanntes Betragsformat: "${raw}"`);
  }

  const value = parseFloat(normalized);
  if (isNaN(value)) throw new Error(`Betrag nicht lesbar: "${raw}"`);

  return negative ? -value : value;
}

// ── Haupt-Funktion ────────────────────────────────────────────────────────────

/**
 * Liest eine CSV-Datei ein, wendet das Spalten-Mapping an, bereinigt die Daten
 * und gibt ein Array von ParsedTransaction-Objekten zurück.
 *
 * Zeilen mit ungültigem Datum oder Betrag werden in `errors` gesammelt und
 * nicht in `transactions` aufgenommen — der Rest wird trotzdem importiert.
 *
 * @param file    - Die CSV-Datei aus einem <input type="file"> oder Drag & Drop
 * @param mapping - Welche CSV-Spalte welchem Datenbankfeld entspricht
 */
export function parseCSV(file: File, mapping: ColumnMapping): Promise<ParseCSVResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,

      complete(result) {
        const transactions: ParsedTransaction[] = [];
        const errors: ParseRowError[] = [];

        for (let i = 0; i < result.data.length; i++) {
          const row = result.data[i];
          const rowNumber = i + 1; // 1-basiert für Fehlermeldungen

          // ── Datum parsen ──
          const rawDate = row[mapping.date]?.trim() ?? "";
          let date: string;
          try {
            if (!rawDate) throw new Error("Wert fehlt");
            date = parseDate(rawDate);
          } catch (err) {
            errors.push({
              row: rowNumber,
              field: "date",
              message: err instanceof Error ? err.message : "Datum ungültig",
              rawValue: rawDate,
            });
            continue; // Zeile überspringen
          }

          // ── Betrag parsen ──
          const rawAmount = row[mapping.amount]?.trim() ?? "";
          let amount: number;
          try {
            if (!rawAmount) throw new Error("Wert fehlt");
            amount = parseAmount(rawAmount);
          } catch (err) {
            errors.push({
              row: rowNumber,
              field: "amount",
              message: err instanceof Error ? err.message : "Betrag ungültig",
              rawValue: rawAmount,
            });
            continue; // Zeile überspringen
          }

          // ── Optionale Felder ──
          const description = mapping.description
            ? (row[mapping.description]?.trim() || null)
            : null;

          const counterpart = mapping.counterpart
            ? (row[mapping.counterpart]?.trim() || null)
            : null;

          transactions.push({ date, amount, description, counterpart, _rowIndex: i });
        }

        // Papa-interne Parse-Fehler anhängen
        for (const e of result.errors) {
          errors.push({
            row: (e.row ?? 0) + 1,
            field: "general",
            message: e.message,
            rawValue: "",
          });
        }

        resolve({ transactions, errors });
      },

      error(err) {
        reject(new Error(`CSV konnte nicht gelesen werden: ${err.message}`));
      },
    });
  });
}
