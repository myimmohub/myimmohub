/**
 * Kategorisiert eine Banktransaktion via Claude und gibt steuerrelevante
 * Metadaten für die deutsche Anlage V zurück.
 *
 * Nur server-seitig nutzbar (ANTHROPIC_API_KEY erforderlich).
 * Verwendet raw fetch statt Anthropic SDK → kein Modul-Level-Client-Problem.
 */

// ── Kategorie-Typen ────────────────────────────────────────────────────────────

export type AnlageVCategory =
  // Einnahmen
  | "miete_einnahmen_wohnen"       // Kaltmiete Wohnnutzung (Z. 9)
  | "miete_einnahmen_gewerbe"      // Kaltmiete Gewerbenutzung (Z. 10)
  | "nebenkosten_einnahmen"        // Nebenkostenvorauszahlung Mieter (Z. 13)
  | "mietsicherheit_einnahme"      // Kaution erhalten – nicht steuerpflichtig
  | "sonstige_einnahmen"           // Entschädigungen, Sonstiges (Z. 17)
  // Werbungskosten (steuerlich absetzbar)
  | "schuldzinsen"                 // NUR Zinsanteil Darlehen (Z. 35)
  | "geldbeschaffungskosten"       // Disagio, Bankgebühren für Kredit (Z. 36)
  | "erhaltungsaufwand"            // Reparaturen, Handwerker, Wartung (Z. 40)
  | "versicherungen"               // Gebäude-, Haftpflichtversicherung (Z. 45)
  | "verwaltungskosten"            // Hausverwaltung, Steuerberatung, Kontoführung (Z. 46)
  | "grundsteuer"                  // Laufende Grundsteuer (Z. 47)
  | "betriebskosten"               // Heizung, Wasser, Müll (Z. 48)
  | "reinigung"                    // Treppenhausreinigung, Gartenarbeit (Z. 49)
  | "maklerkosten"                 // Provision bei Neuvermietung (Z. 50)
  | "fahrtkosten"                  // Fahrten zur Immobilie (Z. 51)
  | "rechtskosten"                 // Anwalts-/Gerichtskosten (Z. 52)
  | "sonstiges_werbungskosten"     // Porto, Telefon, Kleinbeträge (Z. 53)
  // Nicht steuerlich absetzbar
  | "tilgung_kredit"               // Tilgungsanteil – nicht in Anlage V
  | "mietsicherheit_ausgabe"       // Kaution zurückgezahlt
  | "sonstiges_nicht_absetzbar";   // Alles andere

/** Anzeigetexte — browser-sicher exportiert für UI-Komponenten */
export const ANLAGE_V_CATEGORY_LABELS: Record<AnlageVCategory, string> = {
  miete_einnahmen_wohnen:    "Mieteinnahme (Wohnen)",
  miete_einnahmen_gewerbe:   "Mieteinnahme (Gewerbe)",
  nebenkosten_einnahmen:     "Nebenkosteneinnahme",
  mietsicherheit_einnahme:   "Kaution erhalten",
  sonstige_einnahmen:        "Sonstige Einnahmen",
  schuldzinsen:              "Schuldzinsen",
  geldbeschaffungskosten:    "Geldbeschaffungskosten",
  erhaltungsaufwand:         "Erhaltungsaufwand / Reparatur",
  versicherungen:            "Versicherung",
  verwaltungskosten:         "Verwaltungskosten",
  grundsteuer:               "Grundsteuer",
  betriebskosten:            "Betriebskosten",
  reinigung:                 "Reinigung / Gartenpflege",
  maklerkosten:              "Maklerkosten (Neuvermietung)",
  fahrtkosten:               "Fahrtkosten",
  rechtskosten:              "Rechts- / Gerichtskosten",
  sonstiges_werbungskosten:  "Sonstige Werbungskosten",
  tilgung_kredit:            "Tilgung (nicht absetzbar)",
  mietsicherheit_ausgabe:    "Kaution zurückgezahlt",
  sonstiges_nicht_absetzbar: "Sonstiges (nicht absetzbar)",
};

export const ALL_ANLAGE_V_CATEGORIES: AnlageVCategory[] = [
  "miete_einnahmen_wohnen",
  "miete_einnahmen_gewerbe",
  "nebenkosten_einnahmen",
  "mietsicherheit_einnahme",
  "sonstige_einnahmen",
  "schuldzinsen",
  "geldbeschaffungskosten",
  "erhaltungsaufwand",
  "versicherungen",
  "verwaltungskosten",
  "grundsteuer",
  "betriebskosten",
  "reinigung",
  "maklerkosten",
  "fahrtkosten",
  "rechtskosten",
  "sonstiges_werbungskosten",
  "tilgung_kredit",
  "mietsicherheit_ausgabe",
  "sonstiges_nicht_absetzbar",
];

// ── Statische Lookup-Tabellen ─────────────────────────────────────────────────

export const ANLAGE_V_ZEILEN: Record<AnlageVCategory, number | null> = {
  miete_einnahmen_wohnen:    9,
  miete_einnahmen_gewerbe:   10,
  nebenkosten_einnahmen:     13,
  mietsicherheit_einnahme:   null,
  sonstige_einnahmen:        17,
  schuldzinsen:              35,
  geldbeschaffungskosten:    36,
  erhaltungsaufwand:         40,
  versicherungen:            45,
  verwaltungskosten:         46,
  grundsteuer:               47,
  betriebskosten:            48,
  reinigung:                 49,
  maklerkosten:              50,
  fahrtkosten:               51,
  rechtskosten:              52,
  sonstiges_werbungskosten:  53,
  tilgung_kredit:            null,
  mietsicherheit_ausgabe:    null,
  sonstiges_nicht_absetzbar: null,
};

export const TAX_DEDUCTIBLE: Record<AnlageVCategory, boolean> = {
  miete_einnahmen_wohnen:    false,
  miete_einnahmen_gewerbe:   false,
  nebenkosten_einnahmen:     false,
  mietsicherheit_einnahme:   false,
  sonstige_einnahmen:        false,
  schuldzinsen:              true,
  geldbeschaffungskosten:    true,
  erhaltungsaufwand:         true,
  versicherungen:            true,
  verwaltungskosten:         true,
  grundsteuer:               true,
  betriebskosten:            true,
  reinigung:                 true,
  maklerkosten:              true,
  fahrtkosten:               true,
  rechtskosten:              true,
  sonstiges_werbungskosten:  true,
  tilgung_kredit:            false,
  mietsicherheit_ausgabe:    false,
  sonstiges_nicht_absetzbar: false,
};

// ── Eingabe / Ausgabe ─────────────────────────────────────────────────────────

export type CategorizeInput = {
  /** ISO-Datum YYYY-MM-DD */
  date: string;
  /** Positiv = Einnahme, negativ = Ausgabe */
  amount: number;
  description: string | null;
  counterpart: string | null;
};

export type CategorizeResult = {
  category: AnlageVCategory;
  is_tax_deductible: boolean;
  anlage_v_zeile: number | null;
  /** 0–1: Konfidenz der KI-Einschätzung */
  confidence: number;
  /** Kurzbegründung auf Deutsch (1–2 Sätze) */
  reason: string;
};

// ── Kategorisierungs-Funktion ─────────────────────────────────────────────────

/**
 * Ruft die Claude-API auf und kategorisiert eine einzelne Banktransaktion.
 *
 * @throws Error wenn ANTHROPIC_API_KEY fehlt, die API nicht erreichbar ist
 *         oder eine nicht-parsierbare Antwort zurückkommt.
 */
export async function categorizeTransaction(
  input: CategorizeInput,
): Promise<CategorizeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");
  }

  const amountFormatted = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(input.amount);
  const direction = input.amount >= 0 ? "Einnahme" : "Ausgabe";

  const prompt = `Du bist ein deutscher Steuerexperte für Vermieter. Kategorisiere diese Immobilien-Transaktion mit der korrekten Anlage-V-Kategorie.

TRANSAKTION:
- Datum: ${input.date}
- Betrag: ${amountFormatted} (${direction})
- Verwendungszweck: ${input.description ?? "—"}
- Auftraggeber / Empfänger: ${input.counterpart ?? "—"}

VERFÜGBARE KATEGORIEN:
Einnahmen:
- miete_einnahmen_wohnen: Kaltmiete Wohnnutzung (Anlage V Z. 9)
- miete_einnahmen_gewerbe: Kaltmiete Gewerbenutzung (Z. 10)
- nebenkosten_einnahmen: Nebenkostenvorauszahlung vom Mieter (Z. 13)
- mietsicherheit_einnahme: Kaution erhalten – NICHT steuerpflichtig
- sonstige_einnahmen: Entschädigungen, Sonstiges (Z. 17)

Werbungskosten (steuerlich absetzbar):
- schuldzinsen: NUR der Zinsanteil eines Darlehens, NICHT die Tilgung (Z. 35)
- geldbeschaffungskosten: Disagio, Bankgebühren für Kredit (Z. 36)
- erhaltungsaufwand: Reparaturen, Handwerker, Wartung (Z. 40)
- versicherungen: Gebäude-, Haftpflichtversicherung (Z. 45)
- verwaltungskosten: Hausverwaltung, Steuerberatung, Kontoführung (Z. 46)
- grundsteuer: Laufende Grundsteuer – NICHT Grunderwerbsteuer (Z. 47)
- betriebskosten: Heizung, Wasser, Müll soweit Vermieter trägt (Z. 48)
- reinigung: Treppenhausreinigung, Gartenarbeit (Z. 49)
- maklerkosten: Provision bei Neuvermietung – NICHT bei Immobilienkauf (Z. 50)
- fahrtkosten: Fahrten zur Immobilie (Z. 51)
- rechtskosten: Anwalts-/Gerichtskosten (Z. 52)
- sonstiges_werbungskosten: Porto, Telefon, Kleinbeträge (Z. 53)

Nicht steuerlich absetzbar:
- tilgung_kredit: Tilgungsanteil – WICHTIG: nicht in Anlage V absetzbar
- mietsicherheit_ausgabe: Kaution zurückgezahlt
- sonstiges_nicht_absetzbar: Grunderwerbsteuer, Kaufnebenkosten, etc.

SONDERREGELN:
1. Kreditrate (Annuität): Enthält der Verwendungszweck "Rate", "Annuität", "Darlehen" oder ähnliches, besteht die Zahlung aus einem Zins- UND einem Tilgungsanteil. Falls der Kontoauszug den Zinsanteil ausweist, wähle schuldzinsen. Falls nur der Gesamtbetrag erkennbar ist und keine Aufteilung vorliegt, wähle tilgung_kredit und weise in reason ausdrücklich darauf hin, dass eine manuelle Aufteilung in Zins (Zeile 35, absetzbar) und Tilgung (nicht absetzbar) beim Kreditinstitut erfragt werden sollte.
2. Kaution / Mietsicherheit: Eine empfangene oder zurückgezahlte Kaution ist NICHT steuerpflichtig und gehört NICHT in die Anlage V. Wähle mietsicherheit_einnahme bzw. mietsicherheit_ausgabe – niemals eine Einnahmen- oder Werbungskosten-Kategorie.
3. Maklerkosten: Provision bei Neuvermietung → maklerkosten (Werbungskosten, Zeile 50, absetzbar). Maklerprovision beim Immobilienkauf → sonstiges_nicht_absetzbar (erhöht die AfA-Bemessungsgrundlage, kein direkter Abzug).
4. Grundsteuer vs. Grunderwerbsteuer: Die laufende Grundsteuer (wiederkehrend, ans Finanzamt oder die Gemeinde) → grundsteuer (Werbungskosten, Zeile 47, absetzbar). Die einmalige Grunderwerbsteuer beim Kauf → sonstiges_nicht_absetzbar (erhöht die AfA-Bemessungsgrundlage, kein direkter Abzug in der Anlage V).

Antworte ausschließlich mit einem JSON-Objekt ohne Markdown-Codeblock:
{
  "category": "<kategorie>",
  "confidence": <0.0-1.0>,
  "reason": "<Begründung auf Deutsch, max. 8 Wörter>"
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Claude API Fehler ${response.status}: ${text.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const raw =
    data.content
      ?.filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("") ?? "";

  // Claude gibt gelegentlich ```json ... ``` zurück, obwohl wir reines JSON anfordern.
  // Markdown-Code-Fences entfernen, falls vorhanden.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")  // öffnende Fence (```json oder ```)
    .replace(/\s*```\s*$/i, "")        // schließende Fence
    .trim();

  let parsed: { category: AnlageVCategory; confidence: number; reason: string };
  try {
    parsed = JSON.parse(cleaned) as typeof parsed;
  } catch {
    throw new Error(
      `categorizeTransaction: Ungültiges JSON in API-Antwort: ${cleaned.slice(0, 300)}`,
    );
  }

  const category = parsed.category;

  return {
    category,
    is_tax_deductible: TAX_DEDUCTIBLE[category] ?? false,
    anlage_v_zeile:    ANLAGE_V_ZEILEN[category] ?? null,
    confidence:        parsed.confidence,
    reason:            parsed.reason,
  };
}

// ── Batch-Funktion ────────────────────────────────────────────────────────────

export type BatchCategorizeResult = {
  index: number;
  result: CategorizeResult | null;
  error: string | null;
};

/**
 * Kategorisiert mehrere Transaktionen nacheinander (sequenziell, um Rate-Limits
 * zu respektieren). Fehler einzelner Zeilen brechen den Batch nicht ab.
 *
 * @param transactions - Array von Transaktionen
 * @param onProgress   - Optionaler Callback nach jeder verarbeiteten Transaktion
 */
export async function categorizeTransactions(
  transactions: CategorizeInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<BatchCategorizeResult[]> {
  const results: BatchCategorizeResult[] = [];

  for (let i = 0; i < transactions.length; i++) {
    try {
      const result = await categorizeTransaction(transactions[i]);
      results.push({ index: i, result, error: null });
    } catch (err) {
      results.push({
        index: i,
        result: null,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
    onProgress?.(i + 1, transactions.length);
  }

  return results;
}
