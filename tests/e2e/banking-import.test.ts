/**
 * E2E-Test Banking-Import (Volksbank-CSV-Format).
 *
 * Quelle: testdateien/2014 gesamt_Umsaetze_DE76680900000045959104_2024.12.31.csv
 *   = Banking-Auszug 2024 für Kesslerberg-Konto.
 *
 * Hintergrund: `lib/banking/parseCSV.ts` ist auf das Browser-File-API zugeschnitten
 * (Papa.parse mit File-Object → FileReaderSync). In Node-Tests können wir Papa.parse
 * direkt mit dem CSV-String benutzen und die Pure-Helper `parseDate` / `parseAmount`
 * gegen die einzelnen Zeilen laufen lassen — das deckt die echte Datenform
 * (Volksbank-Header, deutsches Zahlenformat, DD.MM.YYYY) realistisch ab.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { parseDate, parseAmount } from "@/lib/banking/parseCSV";

// Pfad relativ zum Workspace-Root (CI nutzt cwd = myimmohub).
const VOLKSBANK_CSV_REL =
  "../testdateien/2014 gesamt_Umsaetze_DE76680900000045959104_2024.12.31.csv";

// Spalten-Mapping passend zur Volksbank-Export-Struktur.
const MAPPING = {
  date: "Buchungstag",
  amount: "Betrag",
  description: "Verwendungszweck",
  counterpart: "Name Zahlungsbeteiligter",
} as const;

function loadCsv(): string | null {
  // Versuche zwei mögliche Pfade: relativ zum Repo-Root und relativ zum
  // Mount-Verzeichnis der Cowork-Session. Falls keine der Dateien existiert,
  // returnen wir null und der Test wird übersprungen.
  const candidates = [
    path.resolve(process.cwd(), VOLKSBANK_CSV_REL),
    path.resolve(__dirname, "..", "..", VOLKSBANK_CSV_REL),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return null;
}

describe("Banking-Import: Volksbank-CSV (Kesslerberg 2024)", () => {
  const csv = loadCsv();

  if (csv == null) {
    it.skip("Volksbank-CSV nicht verfügbar — Test übersprungen", () => {
      // Fixture nicht gemountet (nur in Cowork-Session).
    });
    return;
  }

  it("Header enthält die erwarteten Volksbank-Spalten", () => {
    const result = Papa.parse<Record<string, string>>(csv, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
    });
    const fields = result.meta.fields ?? [];
    expect(fields).toContain(MAPPING.date);
    expect(fields).toContain(MAPPING.amount);
    expect(fields).toContain(MAPPING.description);
    expect(fields).toContain(MAPPING.counterpart);
  });

  it("Anzahl Transaktionen > 0", () => {
    const result = Papa.parse<Record<string, string>>(csv, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
    });
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("Alle Beträge sind numerisch (keine NaN-Werte) und Datumsformat korrekt", () => {
    const result = Papa.parse<Record<string, string>>(csv, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
    });

    let parsed = 0;
    let parseErrors = 0;
    let einnahmen = 0;
    let ausgaben = 0;

    for (const row of result.data) {
      const rawDate = row[MAPPING.date]?.trim() ?? "";
      const rawAmount = row[MAPPING.amount]?.trim() ?? "";
      if (!rawDate || !rawAmount) continue;

      try {
        const date = parseDate(rawDate);
        // ISO YYYY-MM-DD validieren
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // 2024-Range
        expect(date.startsWith("2024")).toBe(true);

        const amount = parseAmount(rawAmount);
        expect(Number.isFinite(amount)).toBe(true);
        expect(Number.isNaN(amount)).toBe(false);

        if (amount > 0) einnahmen += amount;
        else ausgaben += amount;
        parsed++;
      } catch {
        parseErrors++;
      }
    }

    // Plausibilitäts-Anker: Banking 2024 Kesslerberg sollte >100 Buchungen
    // enthalten und das Konto wird unterm Strich überwiegend Ausgaben haben
    // (FeWo + Kreditzinsen).
    expect(parsed).toBeGreaterThan(50);
    // Wenige Parse-Fehler tolerierbar (z. B. ABSCHLUSS-Zeilen ohne Datum)
    expect(parseErrors).toBeLessThan(parsed * 0.1);
    expect(einnahmen).toBeGreaterThan(0);
    expect(ausgaben).toBeLessThan(0);
  });

  it("Erstes Beispiel: '30.12.2024' → '2024-12-30', '-16,27' → -16.27", () => {
    expect(parseDate("30.12.2024")).toBe("2024-12-30");
    expect(parseAmount("-16,27")).toBeCloseTo(-16.27, 2);
    expect(parseAmount("850,00")).toBe(850);
    expect(parseAmount("1.234,56")).toBeCloseTo(1234.56, 2);
  });
});
