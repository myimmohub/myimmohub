import Anthropic from "@anthropic-ai/sdk";

export type ContractData = {
  kaufpreis: number | null;
  kaufdatum: string | null;
  adresse: string | null;
  baujahr: number | null;
  wohnflaeche: number | null;
  kaufnebenkosten_geschaetzt: number | null;
  /** Gebäudeanteil – nur befüllen wenn explizit im Vertrag angegeben */
  gebaeudewert: number | null;
  /** Grundstücksanteil – nur befüllen wenn explizit im Vertrag angegeben */
  grundwert: number | null;
  /** Inventar / bewegliche Wirtschaftsgüter – nur befüllen wenn explizit angegeben */
  inventarwert: number | null;
};

const client = new Anthropic();

export async function extractContractData(text: string): Promise<ContractData> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Extrahiere die folgenden Informationen aus diesem deutschen Immobilien-Kaufvertrag und gib sie als gültiges JSON zurück. Falls ein Wert nicht gefunden wird, setze ihn auf null.

Felder:
- kaufpreis: Gesamter Kaufpreis in Euro als Zahl (z.B. 350000)
- kaufdatum: Datum des Kaufvertrags als String im Format YYYY-MM-DD (z.B. "2024-03-15")
- adresse: Vollständige Adresse des Objekts als String
- baujahr: Baujahr als Zahl (z.B. 1998)
- wohnflaeche: Wohnfläche in m² als Zahl (z.B. 85.5)
- kaufnebenkosten_geschaetzt: Geschätzte Kaufnebenkosten in Euro (Grunderwerbsteuer + Notar + Grundbuch + ggf. Makler). Falls nicht explizit angegeben, berechne ca. 10% des Kaufpreises.
- gebaeudewert: Wert des Gebäudes / der aufstehenden Bebauung in Euro, NUR wenn im Vertrag explizit ausgewiesen (z.B. in einer Kaufpreisaufteilung für steuerliche Zwecke). Sonst null.
- grundwert: Wert des Grund und Bodens / Grundstücks in Euro, NUR wenn explizit ausgewiesen. Sonst null.
- inventarwert: Wert des mitverkauften Inventars / beweglicher Wirtschaftsgüter (z.B. Möbel, Einbauküche, Heizungsanlage als separater Posten) in Euro, NUR wenn explizit ausgewiesen. Sonst null.

Hinweis zur Kaufpreisaufteilung: Viele Notarverträge enthalten eine Aufteilung des Kaufpreises in Gebäude und Grundstück für steuerliche Zwecke (§ 7 EStG / Grunderwerbsteuer). Suche nach Formulierungen wie "entfällt auf das Gebäude", "auf den Grund und Boden entfallen", "Inventar", "bewegliches Zubehör" oder ähnlichen Abschnitten.

Antworte ausschließlich mit dem JSON-Objekt, ohne Erklärungen oder Markdown.

Vertragstext:
${text}`,
      },
    ],
  });

  const raw = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("");

  // Claude umhüllt die Antwort manchmal mit Markdown-Code-Fences (```json … ```)
  // obwohl der Prompt "nur JSON" verlangt — diese hier defensiv entfernen.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as ContractData;
  } catch {
    throw new Error(`extractContractData: Ungültiges JSON in API-Antwort: ${raw.slice(0, 200)}`);
  }
}
