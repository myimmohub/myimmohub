import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

// What Claude returns
type ClaudeExtraction = {
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

// What the UI consumes — each field has { value, confidence }
export type LeaseExtractionResponse = {
  first_name?: { value: string; confidence: number };
  last_name?: { value: string; confidence: number };
  lease_start?: { value: string; confidence: number };
  lease_end?: { value: string; confidence: number };
  cold_rent_cents?: { value: string; confidence: number };
  additional_costs_cents?: { value: string; confidence: number };
  deposit_cents?: { value: string; confidence: number };
  document_id?: string;
  document_path?: string;
};

function field(value: string | null | undefined, confidence: number): { value: string; confidence: number } | undefined {
  if (value == null || value === "") return undefined;
  return { value: String(value), confidence };
}

function extractJsonFromText(text: string): ClaudeExtraction | null {
  try { return JSON.parse(text) as ClaudeExtraction; } catch { /* fall through */ }
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()) as ClaudeExtraction; } catch { /* fall through */ }
  }
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s !== -1 && e > s) {
    try { return JSON.parse(text.slice(s, e + 1)) as ClaudeExtraction; } catch { /* fall through */ }
  }
  return null;
}

function sanitize(name: string) {
  return name.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "Fehlende Umgebungsvariable: ANTHROPIC_API_KEY." }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file");
    const unit_id = formData.get("unit_id") as string | null;

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Datei fehlt oder ist ungültig." }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Nur PDF-Dateien werden unterstützt." }, { status: 400 });
    }

    // Verify unit ownership + get property_id
    let property_id: string | null = null;
    if (unit_id) {
      const { data: unit } = await supabase
        .from("units")
        .select("id, property_id, properties!inner(user_id)")
        .eq("id", unit_id)
        .single();

      if (!unit) {
        return NextResponse.json({ error: "Einheit nicht gefunden." }, { status: 404 });
      }
      const rawProp = (unit as Record<string, unknown>).properties;
      const prop = Array.isArray(rawProp)
        ? (rawProp as { user_id: string }[])[0]
        : (rawProp as { user_id: string } | null);
      if (prop?.user_id !== user.id) {
        return NextResponse.json({ error: "Kein Zugriff auf diese Einheit." }, { status: 403 });
      }
      property_id = (unit as Record<string, unknown>).property_id as string;
    }

    // Read bytes once — used for both Storage upload and Claude
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    const base64data = bytes.toString("base64");
    const originalName = (file as File).name ?? "mietvertrag.pdf";

    // ── 1. Upload to Supabase Storage ─────────────────────────────────────
    const safeName = sanitize(originalName);
    const storagePath = `${user.id}/${property_id ?? "unassigned"}/Mietvertraege/${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });

    let document_id: string | undefined;
    let document_path: string | undefined;

    if (!uploadError) {
      document_path = storagePath;

      // ── 2. Insert into documents table ──────────────────────────────────
      const { data: docRow } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          property_id: property_id ?? null,
          unit_id: unit_id ?? null,
          storage_path: storagePath,
          file_name: safeName,
          original_filename: originalName,
          source: "manual",
          status: "confirmed",
        })
        .select("id")
        .single();

      document_id = docRow?.id as string | undefined;
    }
    // Storage errors are non-fatal — extraction still proceeds

    // ── 3. Claude extraction ──────────────────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "Du bist ein Experte für deutsche Mietverträge. Extrahiere strukturierte Daten aus dem beigefügten PDF-Mietvertrag als JSON. Fehlende Felder setzt du auf null, nie auf einen Schätzwert.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64data },
            },
            {
              type: "text",
              text: `Extrahiere die Mietvertragsdaten als JSON:
{
  "tenant_names": string[] | null,
  "lease_start": string | null,             // ISO-Datum YYYY-MM-DD
  "lease_end": string | null,               // ISO-Datum oder null (unbefristet)
  "cold_rent_cents": number | null,         // Kaltmiete in Cent
  "additional_costs_cents": number | null,  // Nebenkosten in Cent
  "unit_description": string | null,
  "area_sqm": number | null,
  "payment_reference": string | null,
  "confidence_scores": {
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
Antworte ausschließlich mit dem JSON-Objekt.`,
            },
          ],
        },
      ],
    });

    const responseText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");

    const raw = extractJsonFromText(responseText);
    if (!raw) {
      return NextResponse.json(
        { error: "Claude-Antwort konnte nicht geparst werden.", raw: responseText },
        { status: 502 },
      );
    }

    const cs = raw.confidence_scores ?? {};

    // ── 4. Split tenant_names → first_name / last_name ───────────────────
    const primaryName = raw.tenant_names?.[0] ?? null;
    let first_name: string | undefined;
    let last_name: string | undefined;
    if (primaryName) {
      const parts = primaryName.trim().split(/\s+/);
      if (parts.length === 1) {
        last_name = parts[0];
      } else {
        first_name = parts[0];
        last_name = parts.slice(1).join(" ");
      }
    }

    // ── 5. Build UI-compatible response ──────────────────────────────────
    const result: LeaseExtractionResponse = {
      first_name: field(first_name, cs.tenant_names ?? 0),
      last_name:  field(last_name,  cs.tenant_names ?? 0),
      lease_start: field(raw.lease_start, cs.lease_start ?? 0),
      lease_end:   field(raw.lease_end,   cs.lease_end   ?? 0),
      cold_rent_cents:        field(raw.cold_rent_cents        != null ? String(raw.cold_rent_cents)        : null, cs.cold_rent_cents        ?? 0),
      additional_costs_cents: field(raw.additional_costs_cents != null ? String(raw.additional_costs_cents) : null, cs.additional_costs_cents ?? 0),
      document_id,
      document_path,
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
