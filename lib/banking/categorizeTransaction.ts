import Anthropic from "@anthropic-ai/sdk";

export type AnlageVCategory =
  // Einnahmen
  | "miete_einnahmen_wohnen"
  | "miete_einnahmen_gewerbe"
  | "nebenkosten_einnahmen"
  | "mietsicherheit_einnahme"
  | "sonstige_einnahmen"
  // Werbungskosten (steuerlich absetzbar)
  | "schuldzinsen"
  | "geldbeschaffungskosten"
  | "erhaltungsaufwand"
  | "versicherungen"
  | "verwaltungskosten"
  | "grundsteuer"
  | "betriebskosten"
  | "reinigung"
  | "maklerkosten"
  | "fahrtkosten"
  | "rechtskosten"
  | "sonstiges_werbungskosten"
  // Nicht steuerlich absetzbar
  | "tilgung_kredit"
  | "mietsicherheit_ausgabe"
  | "sonstiges_nicht_absetzbar";

export type CategorizationResult = {
  category: AnlageVCategory;
  is_tax_deductible: boolean;
  anlage_v_zeile: number | null;
  confidence: number;
  reason: string;
};

type TransactionInput = {
  datum: string;         // ISO-Datum, z.B. "2024-03-15"
  betrag: number;        // positiv = Einnahme, negativ = Ausgabe
  verwendungszweck: string;
  empfaenger: string;
};

const ANLAGE_V_ZEILEN: Record<AnlageVCategory, number | null> = {
  miete_einnahmen_wohnen: 9,
  miete_einnahmen_gewerbe: 10,
  nebenkosten_einnahmen: 13,
  mietsicherheit_einnahme: null,
  sonstige_einnahmen: 17,
  schuldzinsen: 35,
  geldbeschaffungskosten: 36,
  erhaltungsaufwand: 40,
  versicherungen: 45,
  verwaltungskosten: 46,
  grundsteuer: 47,
  betriebskosten: 48,
  reinigung: 49,
  maklerkosten: 50,
  fahrtkosten: 51,
  rechtskosten: 52,
  sonstiges_werbungskosten: 53,
  tilgung_kredit: null,
  mietsicherheit_ausgabe: null,
  sonstiges_nicht_absetzbar: null,
};

const TAX_DEDUCTIBLE: Record<AnlageVCategory, boolean> = {
  miete_einnahmen_wohnen: false,
  miete_einnahmen_gewerbe: false,
  nebenkosten_einnahmen: false,
  mietsicherheit_einnahme: false,
  sonstige_einnahmen: false,
  schuldzinsen: true,
  geldbeschaffungskosten: true,
  erhaltungsaufwand: true,
  versicherungen: true,
  verwaltungskosten: true,
  grundsteuer: true,
  betriebskosten: true,
  reinigung: true,
  maklerkosten: true,
  fahrtkosten: true,
  rechtskosten: true,
  sonstiges_werbungskosten: true,
  tilgung_kredit: false,
  mietsicherheit_ausgabe: false,
  sonstiges_nicht_absetzbar: false,
};

const client = new Anthropic();

export async function categorizeTransaction(
  transaction: TransactionInput
): Promise<CategorizationResult> {
  const { datum, betrag, verwendungszweck, empfaenger } = transaction;
  const richtung = betrag >= 0 ? `Einnahme (+${betrag} €)` : `Ausgabe (${betrag} €)`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Du bist ein deutscher Steuerexperte für Vermieter. Kategorisiere diese Immobilien-Transaktion mit der korrekten Anlage-V-Kategorie.

TRANSAKTION:
- Datum: ${datum}
- Betrag: ${richtung}
- Verwendungszweck: ${verwendungszweck}
- Empfänger/Absender: ${empfaenger}

VERFÜGBARE KATEGORIEN:
Einnahmen:
- miete_einnahmen_wohnen (Kaltmiete Wohnnutzung, Zeile 9)
- miete_einnahmen_gewerbe (Kaltmiete Gewerbenutzung, Zeile 10)
- nebenkosten_einnahmen (Nebenkostenvorauszahlungen vom Mieter, Zeile 13)
- mietsicherheit_einnahme (Kaution erhalten – NICHT steuerpflichtig)
- sonstige_einnahmen (Entschädigungen, Sonstiges, Zeile 17)

Werbungskosten (steuerlich absetzbar):
- schuldzinsen (NUR der Zinsanteil eines Darlehens, NICHT die Tilgung, Zeile 35)
- geldbeschaffungskosten (Disagio, Bankgebühren für Kredit, Zeile 36)
- erhaltungsaufwand (Reparaturen, Handwerker, Wartung, Zeile 40)
- versicherungen (Gebäude-, Haftpflichtversicherung, Zeile 45)
- verwaltungskosten (Hausverwaltung, Steuerberatung, Kontoführung, Zeile 46)
- grundsteuer (Grundsteuer ans Finanzamt – NICHT Grunderwerbsteuer, Zeile 47)
- betriebskosten (Heizung, Wasser, Müll soweit Vermieter trägt, Zeile 48)
- reinigung (Treppenhausreinigung, Gartenarbeit, Zeile 49)
- maklerkosten (Maklerprovision bei Neuvermietung – NICHT bei Kauf, Zeile 50)
- fahrtkosten (Fahrten zur Immobilie, Zeile 51)
- rechtskosten (Anwalts-/Gerichtskosten, Zeile 52)
- sonstiges_werbungskosten (Porto, Telefon, Kleinbeträge, Zeile 53)

Nicht steuerlich absetzbar:
- tilgung_kredit (Tilgungsanteil – WICHTIG: nicht in Anlage V absetzbar)
- mietsicherheit_ausgabe (Kaution zurückgezahlt)
- sonstiges_nicht_absetzbar

WICHTIGE SONDERREGELN:
1. Kreditraten: Enthält der Verwendungszweck Hinweise auf eine Kreditrate ("Rate", "Annuität", "Darlehen"), ist dies wahrscheinlich eine gemischte Zahlung aus Zinsen + Tilgung. Wähle "tilgung_kredit" und weise in reason darauf hin, dass eine manuelle Aufteilung in Zins/Tilgung nötig ist.
2. Kaution (Mietsicherheit): Ist NICHT steuerpflichtig – weder Einnahme noch Ausgabe in der Anlage V. Nutze mietsicherheit_einnahme oder mietsicherheit_ausgabe.
3. Maklerkosten: Nur bei Neuvermietung absetzbar (maklerkosten). Maklerkosten beim Immobilienkauf erhöhen die AfA-Basis – dann sonstiges_nicht_absetzbar.
4. Grundsteuer vs. Grunderwerbsteuer: Laufende Grundsteuer = grundsteuer (absetzbar). Einmalige Grunderwerbsteuer beim Kauf = sonstiges_nicht_absetzbar (erhöht AfA-Basis).

Antworte ausschließlich mit einem JSON-Objekt ohne Markdown:
{
  "category": "<kategorie>",
  "confidence": <0.0-1.0>,
  "reason": "<Begründung auf Deutsch, max. 2 Sätze>"
}`,
      },
    ],
  });

  const raw = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("");

  const parsed = JSON.parse(raw) as {
    category: AnlageVCategory;
    confidence: number;
    reason: string;
  };

  const category = parsed.category;

  return {
    category,
    is_tax_deductible: TAX_DEDUCTIBLE[category] ?? false,
    anlage_v_zeile: ANLAGE_V_ZEILEN[category] ?? null,
    confidence: parsed.confidence,
    reason: parsed.reason,
  };
}
