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
  category: string;
  is_tax_deductible: boolean;
  anlage_v_zeile: number | null;
  /** 0–1: Konfidenz der KI-Einschätzung */
  confidence: number;
  /** Kurzbegründung auf Deutsch (1–2 Sätze) */
  reason: string;
};

/** Kategorie-Daten aus der Datenbank (für dynamischen KI-Prompt) */
export type DbCategoryForPrompt = {
  label: string;
  icon: string;
  gruppe: string;
  typ: string;
  anlage_v: string | null;
  description: string | null;
};

// ── Prompt-Bausteine ─────────────────────────────────────────────────────────

// Erkennt alte Kategorien, bei denen "(Anlage V" im Label selbst steht
// (Altformat z.B. "Energieversorgung (Anlage V Z. 48)").
function isOldStyleLabel(label: string): boolean {
  return /\(Anlage V/i.test(label);
}

function buildDynamicCategoryBlock(cats: DbCategoryForPrompt[]): string {
  const grouped = new Map<string, DbCategoryForPrompt[]>();
  for (const cat of cats) {
    if (!grouped.has(cat.gruppe)) grouped.set(cat.gruppe, []);
    grouped.get(cat.gruppe)!.push(cat);
  }
  const lines: string[] = [];
  for (const [gruppe, items] of grouped) {
    // Wenn in dieser Gruppe neue Kategorien (ohne Anlage-V im Label) vorhanden sind,
    // Altformat-Kategorien ausblenden — Claude sieht so nur eine Option pro Konzept.
    const hasNewStyle = items.some((c) => !isOldStyleLabel(c.label));
    const filtered = hasNewStyle ? items.filter((c) => !isOldStyleLabel(c.label)) : items;

    lines.push(`\n${gruppe}:`);
    for (const cat of filtered) {
      const anlage = cat.anlage_v ? ` (Anlage V ${cat.anlage_v})` : "";
      const desc = cat.description ? ` – ${cat.description}` : "";
      lines.push(`- ${cat.label}${anlage}${desc}`);
    }
  }
  return lines.join("\n");
}

function buildLegacyCategoryBlock(): string {
  return `
Einnahmen:
- Mieteinnahmen (Anlage V Z. 9 / 10 / 11)
- Ferienvermietung – Einnahmen (Z. 9)
- Nebenkostenerstattungen (Z. 13)
- Sonstige Einnahmen (Z. 14)

Ausgaben (steuerlich absetzbar):
- Grundsteuer (Z. 47)
- Versicherungen (Z. 48)
- Hausverwaltung / WEG-Kosten (Z. 48)
- Handwerkerleistungen (Z. 40)
- Hausmeisterdienste (Z. 48)
- Materialkosten (Z. 40)
- Energieversorgung (Z. 48)
- Wasser & Abwasser (Z. 48)
- Müllentsorgung (Z. 48)
- Internet / Telefon / TV (Z. 48)
- Einrichtung / Möbel (Z. 33–39 / 48)
- Haushaltsbedarf / Kleinausstattung (Z. 48)
- Kreditzinsen / Schuldzinsen (Z. 35)
- Steuerberatung / Rechtskosten (Z. 48)
- Inserate & Vermarktung (Z. 48)
- Fahrtkosten (Z. 48)
- Bürokosten / Verwaltungsaufwand (Z. 48)`;
}

// ── Kategorisierungs-Funktion ─────────────────────────────────────────────────

/**
 * Ruft die Claude-API auf und kategorisiert eine einzelne Banktransaktion.
 *
 * @throws Error wenn ANTHROPIC_API_KEY fehlt, die API nicht erreichbar ist
 *         oder eine nicht-parsierbare Antwort zurückkommt.
 */
export async function categorizeTransaction(
  input: CategorizeInput,
  dbCategories?: DbCategoryForPrompt[],
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

  // Dynamische Kategorie-Liste aus der Datenbank
  const categoryBlock = dbCategories && dbCategories.length > 0
    ? buildDynamicCategoryBlock(dbCategories)
    : buildLegacyCategoryBlock();

  const prompt = `Du bist ein deutscher Steuerexperte für Vermieter. Kategorisiere diese Immobilien-Transaktion mit der korrekten Kategorie.

TRANSAKTION:
- Datum: ${input.date}
- Betrag: ${amountFormatted} (${direction})
- Verwendungszweck: ${input.description ?? "—"}
- Auftraggeber / Empfänger: ${input.counterpart ?? "—"}

VERFÜGBARE KATEGORIEN:
${categoryBlock}

SONDERREGELN:
1. Kreditrate (Annuität): Enthält der Verwendungszweck "Rate", "Annuität", "Darlehen" oder ähnliches, handelt es sich um eine Kreditrate. Wähle "Kreditzinsen / Schuldzinsen" und weise in reason darauf hin, dass eine Aufteilung in Zins (absetzbar) und Tilgung (nicht absetzbar) nötig sein kann.
2. Grundsteuer vs. Grunderwerbsteuer: Die laufende Grundsteuer (wiederkehrend) → "Grundsteuer". Die einmalige Grunderwerbsteuer beim Kauf gehört NICHT zu den laufenden Kosten.
3. Wähle immer die spezifischste passende Kategorie.

WICHTIG: Der Wert von "category" MUSS exakt einem der oben genannten Kategorienamen entsprechen (Groß-/Kleinschreibung beachten).

Antworte ausschließlich mit einem JSON-Objekt ohne Markdown-Codeblock:
{
  "category": "<exakter Kategoriename>",
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

  let parsed: { category: string; confidence: number; reason: string };
  try {
    parsed = JSON.parse(cleaned) as typeof parsed;
  } catch {
    throw new Error(
      `categorizeTransaction: Ungültiges JSON in API-Antwort: ${cleaned.slice(0, 300)}`,
    );
  }

  const category = parsed.category;

  // Resolve tax-deductible and Anlage-V from DB categories if available
  if (dbCategories && dbCategories.length > 0) {
    const dbCat = dbCategories.find((c) => c.label === category);
    const anlageVZeile = dbCat?.anlage_v ? parseInt(dbCat.anlage_v.match(/(\d+)/)?.[1] ?? "") || null : null;
    return {
      category,
      is_tax_deductible: dbCat ? dbCat.typ === "ausgabe" : false,
      anlage_v_zeile:    anlageVZeile,
      confidence:        parsed.confidence,
      reason:            parsed.reason,
    };
  }

  // Fallback: old static lookups
  return {
    category,
    is_tax_deductible: TAX_DEDUCTIBLE[category as AnlageVCategory] ?? false,
    anlage_v_zeile:    ANLAGE_V_ZEILEN[category as AnlageVCategory] ?? null,
    confidence:        parsed.confidence,
    reason:            parsed.reason,
  };
}

// ── Batch-Funktion (mehrere TX in einem API-Call) ─────────────────────────────

export type BatchCategorizeResult = {
  index: number;
  result: CategorizeResult | null;
  error: string | null;
};

/**
 * Kategorisiert mehrere Transaktionen in EINEM einzigen Claude-API-Call.
 * Deutlich günstiger als Einzel-Calls, da die Kategorienliste nur einmal gesendet wird.
 *
 * Max. ~10 Transaktionen pro Batch empfohlen (Antwort-JSON bleibt überschaubar).
 */
export async function categorizeTransactionBatch(
  transactions: CategorizeInput[],
  dbCategories?: DbCategoryForPrompt[],
): Promise<CategorizeResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");
  if (transactions.length === 0) return [];

  const categoryBlock = dbCategories && dbCategories.length > 0
    ? buildDynamicCategoryBlock(dbCategories)
    : buildLegacyCategoryBlock();

  // Nummerierte Transaktionsliste aufbauen
  const txLines = transactions.map((tx, i) => {
    const amt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(tx.amount);
    const dir = tx.amount >= 0 ? "Einnahme" : "Ausgabe";
    return `[${i + 1}] Datum: ${tx.date} | Betrag: ${amt} (${dir}) | Verwendungszweck: ${tx.description ?? "—"} | Auftraggeber/Empfänger: ${tx.counterpart ?? "—"}`;
  }).join("\n");

  const prompt = `Du bist ein deutscher Steuerexperte für Vermieter. Kategorisiere die folgenden ${transactions.length} Immobilien-Transaktionen.

TRANSAKTIONEN:
${txLines}

VERFÜGBARE KATEGORIEN:
${categoryBlock}

SONDERREGELN:
1. Kreditrate (Annuität): Enthält der Verwendungszweck "Rate", "Annuität", "Darlehen" o.Ä., wähle "Kreditzinsen / Schuldzinsen" und weise in reason auf mögliche Zins/Tilgungs-Aufteilung hin.
2. Grundsteuer vs. Grunderwerbsteuer: Laufende Grundsteuer (wiederkehrend) → "Grundsteuer". Einmalige Grunderwerbsteuer beim Kauf → nicht laufende Kosten.
3. Wähle immer die spezifischste passende Kategorie.

WICHTIG: "category" MUSS exakt einem der Kategorienamen entsprechen (Groß-/Kleinschreibung beachten).

Antworte ausschließlich mit einem JSON-Array mit exakt ${transactions.length} Objekten in derselben Reihenfolge wie die Transaktionen. Kein Markdown:
[
  {"category": "<exakter Kategoriename>", "confidence": <0.0-1.0>, "reason": "<max. 8 Wörter>"},
  ...
]`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256 * transactions.length, // ~256 Tokens pro Ergebnis-Objekt
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API Fehler ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const raw = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("") ?? "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let parsed: Array<{ category: string; confidence: number; reason: string }>;
  try {
    parsed = JSON.parse(cleaned) as typeof parsed;
    if (!Array.isArray(parsed)) throw new Error("Kein Array");
  } catch {
    throw new Error(`categorizeTransactionBatch: Ungültiges JSON: ${cleaned.slice(0, 300)}`);
  }

  // Ergebnisse zusammenbauen — fehlende Einträge mit Fallback befüllen
  return transactions.map((_, i) => {
    const p = parsed[i];
    if (!p?.category) return {
      category:          "sonstiges_nicht_absetzbar",
      is_tax_deductible: false,
      anlage_v_zeile:    null,
      confidence:        0,
      reason:            "Keine KI-Antwort",
    };
    const category = p.category;
    if (dbCategories && dbCategories.length > 0) {
      const dbCat = dbCategories.find((c) => c.label === category);
      const anlageVZeile = dbCat?.anlage_v ? parseInt(dbCat.anlage_v.match(/(\d+)/)?.[1] ?? "") || null : null;
      return { category, is_tax_deductible: dbCat ? dbCat.typ === "ausgabe" : false, anlage_v_zeile: anlageVZeile, confidence: p.confidence, reason: p.reason };
    }
    return {
      category,
      is_tax_deductible: TAX_DEDUCTIBLE[category as AnlageVCategory] ?? false,
      anlage_v_zeile:    ANLAGE_V_ZEILEN[category as AnlageVCategory] ?? null,
      confidence:        p.confidence,
      reason:            p.reason,
    };
  });
}

/**
 * Kategorisiert mehrere Transaktionen nacheinander (sequenziell, Einzel-Calls).
 * @deprecated Nutze stattdessen den Batch-Loop in der Route (chunked + retry).
 */
export async function categorizeTransactions(
  transactions: CategorizeInput[],
  onProgress?: (done: number, total: number) => void,
  dbCategories?: DbCategoryForPrompt[],
): Promise<BatchCategorizeResult[]> {
  const results: BatchCategorizeResult[] = [];

  for (let i = 0; i < transactions.length; i++) {
    try {
      const result = await categorizeTransaction(transactions[i], dbCategories);
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
