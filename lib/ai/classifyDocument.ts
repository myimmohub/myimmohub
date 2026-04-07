import Anthropic from "@anthropic-ai/sdk";
export type { DocumentCategory } from "@/lib/ai/categories";
export { CATEGORY_LABELS, ALL_CATEGORIES } from "@/lib/ai/categories";
import type { DocumentCategory } from "@/lib/ai/categories";

export type Property = {
  id: string;
  name: string;
  address: string;
  type: string;
};

export type ClassificationResult = {
  category: DocumentCategory;
  amount: number | null;
  date: string | null; // ISO-Format YYYY-MM-DD oder null
  property_id: string | null;
  confidence: number;
};

const client = new Anthropic();

export async function classifyDocument(
  text: string,
  properties: Property[]
): Promise<ClassificationResult> {
  const propertyList =
    properties.length > 0
      ? properties
          .map((p) => `- ID: ${p.id} | Name: "${p.name}" | Adresse: "${p.address}" | Typ: ${p.type}`)
          .join("\n")
      : "Keine Immobilien vorhanden.";

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Du bist ein Assistent für deutsche Immobilienverwaltung. Analysiere diesen Dokumententext und gib eine strukturierte Klassifizierung zurück.

VERFÜGBARE IMMOBILIEN:
${propertyList}

KATEGORIEN:
- miete: Mietvertrag, Mietrechnung, Mietquittung
- rechnung_handwerk: Handwerkerrechnung, Reparatur, Wartung, Instandhaltung
- rechnung_verwaltung: Hausverwaltungsrechnung, Steuerberatung, Kontoführungsgebühren
- versicherung: Gebäude-, Haftpflicht- oder sonstige Immobilienversicherung
- nebenkostenabrechnung: Betriebskostenabrechnung, Heizkostenabrechnung
- zinsen: Zinsabrechnung, Darlehensabrechnung (NUR Zinsanteil)
- sonstiges: Alles was nicht in die obigen Kategorien passt

AUFGABE:
1. Bestimme die passendste Kategorie.
2. Extrahiere den Gesamtbetrag in Euro (nur Zahl, z.B. 1250.00) – falls mehrere Beträge, nimm den Endbetrag/Gesamtbetrag. null wenn nicht eindeutig.
3. Extrahiere das Hauptdatum des Dokuments (Rechnungsdatum, Vertragsdatum o.ä.) im Format YYYY-MM-DD. null wenn nicht gefunden.
4. Ordne die Immobilie zu, deren Name oder Adresse am besten zum Dokumentinhalt passt. Gibt es keinen klaren Bezug, setze property_id auf null.
5. Schätze deine Konfidenz (0.0–1.0).

Antworte ausschließlich mit einem JSON-Objekt ohne Markdown:
{
  "category": "<kategorie>",
  "amount": <zahl oder null>,
  "date": "<YYYY-MM-DD oder null>",
  "property_id": "<id oder null>",
  "confidence": <0.0-1.0>
}

DOKUMENTTEXT:
${text}`,
      },
    ],
  });

  const raw = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("");

  try {
    return JSON.parse(raw) as ClassificationResult;
  } catch {
    throw new Error(`classifyDocument: Ungültiges JSON in API-Antwort: ${raw.slice(0, 200)}`);
  }
}
