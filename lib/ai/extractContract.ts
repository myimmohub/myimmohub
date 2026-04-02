import Anthropic from "@anthropic-ai/sdk";

export type ContractData = {
  kaufpreis: number | null;
  kaufdatum: string | null;
  adresse: string | null;
  baujahr: number | null;
  wohnflaeche: number | null;
  kaufnebenkosten_geschaetzt: number | null;
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
- kaufpreis: Kaufpreis in Euro als Zahl (z.B. 350000)
- kaufdatum: Datum des Kaufvertrags als String im Format YYYY-MM-DD (z.B. "2024-03-15")
- adresse: Vollständige Adresse des Objekts als String
- baujahr: Baujahr als Zahl (z.B. 1998)
- wohnflaeche: Wohnfläche in m² als Zahl (z.B. 85.5)
- kaufnebenkosten_geschaetzt: Geschätzte Kaufnebenkosten in Euro als Zahl (Grunderwerbsteuer + Notar + Grundbuch + ggf. Makler). Falls nicht explizit angegeben, berechne ca. 10% des Kaufpreises.

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

  return JSON.parse(raw) as ContractData;
}
