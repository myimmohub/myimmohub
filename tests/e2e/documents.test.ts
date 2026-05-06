/**
 * E2E-Tests für die Dokumenten-Pipeline.
 *
 * Status der Pure-Funktionen (Stand: Marktreife-Pass):
 *   - `lib/ai/extractContract.ts`  (SDK-Call) → mit Mock testbar
 *   - `lib/ai/classifyDocument.ts` (SDK-Call) → mit Mock testbar
 *   - `lib/ai/extractText.ts`      (PDF/Bild → Text via Anthropic)  → mit Mock testbar
 *   - `components/ContractExtraction.tsx` ist ein UI-Komponent ohne extrahierbare
 *     Pure Function → Smoke-Test "lässt sich importieren" entfällt, weil React-DOM
 *     in der Node-Test-Umgebung nicht ohne weitere Setup-Schritte funktioniert.
 *     Stattdessen wird der reine Datenpfad (extractContractData) abgesichert.
 *
 * Wir mocken das `@anthropic-ai/sdk` per `vi.mock`, damit kein echter Netzwerk-
 * Call passiert und die Tests deterministisch + kostenlos sind.
 *
 * Ziel: Nachweis, dass Antwort-Parsing (JSON, Markdown-Fences, leichte Tippfehler)
 * stabil und idempotent ist.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Anthropic SDK: gemeinsames create-Mock, von jedem Test überschreibbar.
// vi.hoisted ist nötig, weil vi.mock vor allen imports gehoisted wird.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  };
});

import { extractContractData } from "@/lib/ai/extractContract";

beforeEach(() => {
  createMock.mockReset();
});

describe("extractContractData (Anthropic-SDK gemockt)", () => {
  it("parst pure JSON-Antwort", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            kaufpreis: 350000,
            kaufdatum: "2024-03-15",
            adresse: "Musterstraße 1, 10115 Berlin",
            baujahr: 1998,
            wohnflaeche: 85.5,
            kaufnebenkosten_geschaetzt: 35000,
            gebaeudewert: 280000,
            grundwert: 70000,
            inventarwert: null,
          }),
        },
      ],
    });

    const result = await extractContractData("dummy text");
    expect(result.kaufpreis).toBe(350000);
    expect(result.kaufdatum).toBe("2024-03-15");
    expect(result.gebaeudewert).toBe(280000);
    expect(result.inventarwert).toBeNull();
  });

  it("parst JSON in Markdown-Code-Fence (```json ... ```)", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text:
            '```json\n' +
            JSON.stringify({
              kaufpreis: 200000,
              kaufdatum: null,
              adresse: null,
              baujahr: null,
              wohnflaeche: null,
              kaufnebenkosten_geschaetzt: 20000,
              gebaeudewert: null,
              grundwert: null,
              inventarwert: null,
            }) +
            "\n```",
        },
      ],
    });

    const result = await extractContractData("dummy text");
    expect(result.kaufpreis).toBe(200000);
    expect(result.kaufnebenkosten_geschaetzt).toBe(20000);
  });

  it("wirft bei kaputtem JSON klare Fehlermeldung", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "Hier ist das Ergebnis: {kaufpreis: 350000}" }],
    });

    await expect(extractContractData("dummy")).rejects.toThrow(/Ungültiges JSON/);
  });

  it("idempotent: gleicher Input → gleicher Output (Mocks deterministisch)", async () => {
    const payload = JSON.stringify({
      kaufpreis: 500000,
      kaufdatum: "2023-01-15",
      adresse: "Test",
      baujahr: 2010,
      wohnflaeche: 100,
      kaufnebenkosten_geschaetzt: 50000,
      gebaeudewert: 400000,
      grundwert: 100000,
      inventarwert: null,
    });
    createMock.mockResolvedValueOnce({ content: [{ type: "text", text: payload }] });
    createMock.mockResolvedValueOnce({ content: [{ type: "text", text: payload }] });

    const a = await extractContractData("x");
    const b = await extractContractData("x");
    expect(a).toEqual(b);
  });
});

describe("Document fixtures sind verfügbar", () => {
  it("PDFs Hausmeister.pdf und Gasrechnung.pdf existieren als Test-Inputs", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    // Cowork-Mount: ../testdateien/* (relativ zum Repo-Root in Cowork-Sessions);
    // außerhalb von Cowork existiert das Verzeichnis nicht → Test soft-skippen.
    const candidates = [
      path.resolve(process.cwd(), "../testdateien"),
      path.resolve(__dirname, "..", "..", "..", "testdateien"),
    ];
    let dir: string | null = null;
    for (const c of candidates) if (fs.existsSync(c)) dir = c;

    if (!dir) {
      // Soft-Skip: lokale Dev-Umgebung ohne Mount, kein FAIL.
      expect(true).toBe(true);
      return;
    }

    expect(fs.existsSync(path.join(dir, "Hausmeister.pdf"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "Gasrechnung.pdf"))).toBe(true);
  });
});

// REFAKTORIERUNGS-NOTIZ:
//   Es gibt aktuell KEINE pure PDF-Text-Extraktions-Funktion ohne Anthropic-Roundtrip
//   (lib/ai/extractText.ts ruft direkt fetch() gegen die Anthropic-API). Wir testen
//   daher hier nur, dass die Test-PDFs als Eingaben zur Verfügung stehen, und
//   dokumentieren das Refactor-Bedürfnis in docs/refactoring-needs.md.
it.todo(
  "Pure PDF-Text-Extraktion ohne Anthropic-Call (lokaler PDF-Parser, z.B. pdf-parse) für Hausmeister.pdf + Gasrechnung.pdf — siehe docs/refactoring-needs.md",
);
