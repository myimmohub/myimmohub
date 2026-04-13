import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function createClient() {
  const cookieStore = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => (cookieStore as unknown as { getAll: () => { name: string; value: string }[] }).getAll(),
    },
  });
}

type ExtractionResult = {
  tenant_names: string[] | null;
  lease_start: string | null;
  lease_end: string | null;
  cold_rent_cents: number | null;
  additional_costs_cents: number | null;
  unit_description: string | null;
  area_sqm: number | null;
  payment_reference: string | null;
  confidence_scores: Record<string, number>;
};

function extractJsonFromText(text: string): ExtractionResult | null {
  // Try direct parse first
  try {
    return JSON.parse(text) as ExtractionResult;
  } catch {
    // Fall through
  }

  // Try to extract JSON block from markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as ExtractionResult;
    } catch {
      // Fall through
    }
  }

  // Try to find a JSON object in the raw text
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
    try {
      return JSON.parse(text.slice(braceStart, braceEnd + 1)) as ExtractionResult;
    } catch {
      // Fall through
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "Fehlende Umgebungsvariable: ANTHROPIC_API_KEY." }, { status: 500 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file");
    const unit_id = formData.get("unit_id") as string | null;

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Datei fehlt oder ist ungültig." }, { status: 400 });
    }

    // Validate PDF
    const mimeType = file.type;
    if (mimeType !== "application/pdf") {
      return NextResponse.json(
        { error: "Nur PDF-Dateien werden unterstützt." },
        { status: 400 },
      );
    }

    // Verify unit ownership if unit_id provided
    if (unit_id) {
      const { data: unit } = await supabase
        .from("units")
        .select("id, properties!inner(user_id)")
        .eq("id", unit_id)
        .single();

      if (!unit) {
        return NextResponse.json({ error: "Einheit nicht gefunden." }, { status: 404 });
      }

      const rawProp = (unit as Record<string, unknown>).properties;
      const property = Array.isArray(rawProp)
        ? (rawProp as { user_id: string }[])[0]
        : (rawProp as { user_id: string } | null);

      if (property?.user_id !== user.id) {
        return NextResponse.json({ error: "Kein Zugriff auf diese Einheit." }, { status: 403 });
      }
    }

    // Read file as ArrayBuffer and convert to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64data = Buffer.from(arrayBuffer).toString("base64");

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt =
      "Du bist ein Experte für deutsche Mietverträge. Extrahiere strukturierte Daten aus dem beigefügten PDF-Mietvertrag als JSON. Fehlende Felder setzt du auf null, nie auf einen Schätzwert. Gib für jedes Feld einen confidence_score (0.0–1.0) an.";

    const userPrompt = `Extrahiere die Mietvertragsdaten als JSON mit folgendem Schema:
{
  "tenant_names": string[] | null,
  "lease_start": string | null,   // ISO-Datum (YYYY-MM-DD)
  "lease_end": string | null,     // ISO-Datum oder null bei unbefristetem Mietvertrag
  "cold_rent_cents": number | null,       // Kaltmiete in Cent
  "additional_costs_cents": number | null, // Nebenkosten in Cent
  "unit_description": string | null,  // Beschreibung der Mieteinheit
  "area_sqm": number | null,           // Wohnfläche in qm
  "payment_reference": string | null,  // Verwendungszweck / Zahlungsreferenz
  "confidence_scores": {              // Konfidenz 0.0–1.0 für jedes Feld
    "tenant_names": number,
    "lease_start": number,
    "lease_end": number,
    "cold_rent_cents": number,
    "additional_costs_cents": number,
    "unit_description": number,
    "area_sqm": number,
    "payment_reference": number
  }
}

Antworte ausschließlich mit dem JSON-Objekt, ohne weitere Erklärungen.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64data,
              },
            },
            {
              type: "text",
              text: userPrompt,
            },
          ],
        },
      ],
    });

    const responseText = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    const extracted = extractJsonFromText(responseText);

    if (!extracted) {
      return NextResponse.json(
        { error: "Claude-Antwort konnte nicht als JSON geparst werden.", raw: responseText },
        { status: 502 },
      );
    }

    return NextResponse.json({ extraction: extracted, unit_id: unit_id ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
