import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `Du bist ein Spezialist fuer die Extraktion von Daten aus Gesellschaftervertraegen (GbR).
Extrahiere folgende Felder als JSON-Objekt:

- name: Name der GbR (z.B. "Immobilien-GbR Müller & Schmidt")
- steuernummer: Steuernummer der GbR (oder null)
- finanzamt: Zustaendiges Finanzamt (oder null)
- partner: Array von Objekten mit { name: string, anteil: number (Prozent), email: string | null }

Antworte ausschliesslich mit dem JSON-Objekt — kein Text davor oder danach.
Felder die du nicht erkennst: setze auf null bzw. leeres Array.
Anteile immer als Prozentzahl (z.B. 50 fuer 50%).`;

export async function POST(request: Request) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY nicht konfiguriert." }, { status: 500 });
  }

  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const body = (await request.json()) as { pdf_base64: string };
  if (!body.pdf_base64) {
    return NextResponse.json({ error: "pdf_base64 fehlt." }, { status: 400 });
  }

  // 10 MB limit
  if (body.pdf_base64.length > 10 * 1024 * 1024 * 1.37) {
    return NextResponse.json({ error: "Datei zu gross (max 10 MB)." }, { status: 413 });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: body.pdf_base64,
                },
              },
              {
                type: "text",
                text: "Extrahiere alle GbR-Daten aus diesem Gesellschaftervertrag als JSON.",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: `Claude API Fehler: ${text.slice(0, 200)}` }, { status: 502 });
    }

    const data = (await response.json()) as {
      content: { type: string; text?: string }[];
    };

    const rawText = data.content.find((b) => b.type === "text")?.text ?? "";
    // Strip markdown code fences
    const jsonStr = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const extracted = JSON.parse(jsonStr);

    return NextResponse.json(extracted);
  } catch (err) {
    return NextResponse.json({ error: `Extraktion fehlgeschlagen: ${(err as Error).message}` }, { status: 500 });
  }
}
