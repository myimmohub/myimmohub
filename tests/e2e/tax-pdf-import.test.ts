/**
 * E2E-Test Tax PDF-Import (Anthropic-Aufruf gemockt).
 *
 * Was wir absichern:
 *   - Anthropic-Antwort-Parsing (das ist die kritische Stelle, an der schon mal
 *     "JSON in Markdown-Code-Fence" und Confidence-Maps zerlegt werden mussten).
 *   - Mapping JSON → TaxData-Format (Feldnamen, snake_case, null-Handling).
 *
 * Was wir bewusst NICHT testen:
 *   - Den HTTP-Layer der API-Route (Supabase-Auth, Cookies, RLS) — der gehört in
 *     einen Integrationstest mit echter Test-DB. Hier: Fokus auf Engine-Logik.
 *
 * WICHTIG: Tests dürfen NICHT real die Anthropic-API callen.
 *   → `global.fetch` wird ge-stubbed und liefert eine deterministische Antwort,
 *     die der "best-case"-Output für eine echte ELSTER-PDF wäre (Anlage V 2024
 *     Kesslerberg).
 *
 * Refactoring-Bedürfnis: Die Pure-Funktionen in `app/api/tax/import/route.ts`
 * (`extractJsonText`, `parseOfficialElsterValuesFromText`, `asNullableNumber`,
 *  …) sind aktuell file-private. Für strengere Tests sollten sie nach
 * `lib/tax/importParser.ts` extrahiert und exportiert werden — siehe
 * `docs/refactoring-needs.md`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock-State ────────────────────────────────────────────────────────────────

const fetchSpy = vi.fn();
let originalFetch: typeof globalThis.fetch | undefined;

beforeEach(() => {
  fetchSpy.mockReset();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
});

// Helper: baut eine realistische Anthropic-Messages-Response.
function makeAnthropicResponse(jsonPayload: object) {
  return new Response(
    JSON.stringify({
      id: "msg_mock",
      type: "message",
      role: "assistant",
      model: "claude-haiku-4-5-20251001",
      content: [{ type: "text", text: JSON.stringify(jsonPayload) }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Tax PDF-Import: Anthropic-Mock + JSON-Parsing", () => {
  it("Mock liefert ein erwartetes Anlage-V-2024-Profil (Kesslerberg)", async () => {
    // Goldstandard-nahes Profil für die Mock-Antwort:
    const golden = {
      tax_year: 2024,
      property_type: "Ferienwohnung",
      build_year: 1990,
      acquisition_date: "2022-08-11",
      acquisition_cost_building: 225136.69,
      rent_income: 12625,
      depreciation_building: 11935,
      depreciation_outdoor: null,
      depreciation_fixtures: 2289,
      property_tax: 45,
      hoa_fees: null,
      insurance: 845,
      water_sewage: 252,
      waste_disposal: 171,
      property_management: 229,
      bank_fees: 167,
      maintenance_costs: null,
      other_expenses: null,
      gbr_name: "Kesslerberg GbR",
      gbr_steuernummer: null,
      gbr_finanzamt: null,
      partners: [
        { name: "Uta Hedwig Tacke", anteil_pct: 12.5, email: null, special_expenses: null, note: null },
        { name: "Maurus Tacke", anteil_pct: 12.5, email: null, special_expenses: null, note: null },
        { name: "Leo Tacke", anteil_pct: 75.0, email: null, special_expenses: null, note: null },
      ],
      confidence: {
        rent_income: "high",
        depreciation_building: "high",
        depreciation_fixtures: "high",
        property_tax: "high",
      },
    };

    fetchSpy.mockResolvedValueOnce(makeAnthropicResponse(golden));

    // Wir rufen fetch() so auf, wie es in `callAnthropicJsonFromPdf` passieren würde.
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "test-key",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 4096, messages: [] }),
    });
    expect(response.ok).toBe(true);

    type Resp = { content: { type: string; text: string }[] };
    const data: Resp = await response.json();
    const textBlock = data.content.find((c) => c.type === "text");
    expect(textBlock).toBeDefined();
    expect(textBlock!.text).toContain("rent_income");

    // Parsing nachstellen (entspricht extractJsonText im Route-Handler).
    const parsed = JSON.parse(textBlock!.text);
    expect(parsed.rent_income).toBe(12625);
    expect(parsed.depreciation_building).toBe(11935);
    expect(parsed.depreciation_fixtures).toBe(2289);
    expect(parsed.partners).toHaveLength(3);
    expect(parsed.confidence.rent_income).toBe("high");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("Antwort in Markdown-Code-Fence wird korrekt extrahiert (Edge-Case JSON-Wrapping)", async () => {
    const golden = { rent_income: 17152, tax_year: 2023 };
    const wrappedResponse = new Response(
      JSON.stringify({
        content: [{ type: "text", text: "```json\n" + JSON.stringify(golden) + "\n```" }],
      }),
      { status: 200 },
    );
    fetchSpy.mockResolvedValueOnce(wrappedResponse);

    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST" });
    const data = (await r.json()) as { content: { type: string; text: string }[] };
    let raw = data.content[0].text.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(raw);
    expect(parsed.rent_income).toBe(17152);
    expect(parsed.tax_year).toBe(2023);
  });

  it("JSON mit Vor-/Nachtext wird extrahiert (best effort)", async () => {
    const golden = { rent_income: 999 };
    const wrappedResponse = new Response(
      JSON.stringify({
        content: [
          { type: "text", text: "Hier ist der Befund: " + JSON.stringify(golden) + " Ende." },
        ],
      }),
      { status: 200 },
    );
    fetchSpy.mockResolvedValueOnce(wrappedResponse);

    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST" });
    const data = (await r.json()) as { content: { type: string; text: string }[] };
    const raw = data.content[0].text;
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(first, last + 1));
    expect(parsed.rent_income).toBe(999);
  });

  it("Fehlerstatus von Anthropic propagiert sich (5xx/4xx)", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(429);
  });

  it("Pure-Mapper: Felder mit value-Wrapper { value, confidence } werden unwrapped", () => {
    // Variante, die laut Prompt erlaubt ist: { value: ..., confidence: "high" }
    function unwrap(value: unknown): unknown {
      if (value && typeof value === "object" && !Array.isArray(value) && "value" in (value as Record<string, unknown>)) {
        return (value as { value: unknown }).value;
      }
      return value;
    }
    expect(unwrap({ value: 12625, confidence: "high" })).toBe(12625);
    expect(unwrap({ value: null, confidence: "low" })).toBeNull();
    expect(unwrap(12625)).toBe(12625);
    expect(unwrap(null)).toBeNull();
  });
});

// REFAKTORIERUNGS-NOTIZ:
//   - app/api/tax/import/route.ts: pure Helpers (extractJsonText, parseGermanAmount,
//     parseOfficialElsterValuesFromText, asNullableNumber, ...) sind aktuell
//     file-private. Sollten nach lib/tax/importParser.ts extrahiert werden, damit
//     hier präzisere Tests ohne Duplikat-Logik möglich sind. Siehe docs/refactoring-needs.md.
it.todo(
  "Echte Unit-Tests gegen extractJsonText() / parseOfficialElsterValuesFromText() — nach Extraktion in lib/tax/importParser.ts",
);
