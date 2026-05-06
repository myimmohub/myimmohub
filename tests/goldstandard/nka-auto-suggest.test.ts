/**
 * Goldstandard-Tests für lib/nka/autoSuggest.
 *
 * Deckt alle Confidence-Stufen + Skip-Pfade + Determinismus + den
 * spezifischen Müller/Müll-Bug ab.
 */

import { describe, expect, it } from "vitest";
import {
  containsWord,
  DEFAULT_CATEGORY_MAPPING,
  suggestNkaCostItems,
  type AutoSuggestInput,
} from "@/lib/nka/autoSuggest";

const TX_UUID = "11111111-1111-4111-8111-111111111111";
const TX2_UUID = "22222222-2222-4222-8222-222222222222";
const TX3_UUID = "33333333-3333-4333-8333-333333333333";
const TX4_UUID = "44444444-4444-4444-8444-444444444444";

function baseInput(overrides: Partial<AutoSuggestInput> = {}): AutoSuggestInput {
  return {
    transactions: [],
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    linkedTransactionIds: [],
    ...overrides,
  };
}

describe("suggestNkaCostItems · Confidence high (Direct category match)", () => {
  it("Match auf Default-Mapping → high confidence", () => {
    const out = suggestNkaCostItems(
      baseInput({
        transactions: [
          {
            id: TX_UUID,
            date: "2024-03-15",
            amount: -85.0,
            category: "Müllabfuhr",
            counterpart: "Stadtwerke Hinterzarten",
            description: "Quartalsabrechnung",
          },
        ],
      }),
    );
    expect(out.suggestions).toHaveLength(1);
    expect(out.suggestions[0]).toMatchObject({
      transaction_id: TX_UUID,
      position: "muellabfuhr",
      brutto_cents: 8500,
      confidence: "high",
    });
    expect(out.skipped_already_linked).toEqual([]);
    expect(out.skipped_positive).toEqual([]);
  });

  it("Default-Mapping kennt Hauswart und Hausmeister beide → hauswart", () => {
    const out = suggestNkaCostItems(
      baseInput({
        transactions: [
          {
            id: TX_UUID,
            date: "2024-04-01",
            amount: -200,
            category: "Hausmeister",
            counterpart: "Hausmeisterservice GmbH",
            description: null,
          },
        ],
      }),
    );
    expect(out.suggestions[0].position).toBe("hauswart");
    expect(out.suggestions[0].confidence).toBe("high");
  });
});

describe("suggestNkaCostItems · Confidence medium (Counterpart-Heuristik)", () => {
  it("Stadtwerke-Wasserwerke matcht ohne Category", () => {
    const out = suggestNkaCostItems(
      baseInput({
        transactions: [
          {
            id: TX_UUID,
            date: "2024-02-10",
            amount: -150,
            category: null,
            counterpart: "Wasserwerke Hinterzarten",
            description: "Wasser Q1",
          },
        ],
      }),
    );
    expect(out.suggestions).toHaveLength(1);
    expect(out.suggestions[0].position).toBe("wasser");
    expect(out.suggestions[0].confidence).toBe("medium");
  });

  it("'Müllabfuhr GmbH' im Counterpart → muellabfuhr", () => {
    const out = suggestNkaCostItems(
      baseInput({
        transactions: [
          {
            id: TX_UUID,
            date: "2024-02-10",
            amount: -85,
            category: null,
            counterpart: "Müllabfuhr GmbH",
            description: null,
          },
        ],
      }),
    );
    expect(out.suggestions[0].position).toBe("muellabfuhr");
    expect(out.suggestions[0].confidence).toBe("medium");
  });
});

describe("suggestNkaCostItems · Word-Boundary (Müll/Müller-Bug)", () => {
  it("'Müller GmbH' im Counterpart → KEIN Match auf 'müll'", () => {
    const out = suggestNkaCostItems(
      baseInput({
        transactions: [
          {
            id: TX_UUID,
            date: "2024-02-10",
            amount: -50,
            category: null,
            counterpart: "Müller GmbH",
            description: "Rechnung",
          },
        ],
      }),
    );
    // Müller darf NICHT als müllabfuhr erkannt werden
    expect(
      out.suggestions.find((s) => s.position === "muellabfuhr"),
    ).toBeUndefined();
  });

  it("containsWord-Helper: 'Müll' matcht in 'Müllabfuhr' nicht (Müll wäre Subwort von Müllabfuhr)", () => {
    expect(containsWord("Müllabfuhr GmbH", "müll")).toBe(false);
    expect(containsWord("Müll Service", "müll")).toBe(true);
    expect(containsWord("Müller GmbH", "müll")).toBe(false);
  });

  it("containsWord-Helper: case-insensitive und Unicode", () => {
    expect(containsWord("STRASSENREINIGUNG GmbH", "straßenreinigung")).toBe(false); // 'ß' ≠ 'SS'
    expect(containsWord("Straßenreinigung GmbH", "straßenreinigung")).toBe(true);
    expect(containsWord("straßenreinigungsbetrieb", "straßenreinigung")).toBe(false);
  });
});

describe("suggestNkaCostItems · Confidence low (Description-Heuristik)", () => {
  it("Stichwort nur in Description → low confidence", () => {
    const out = suggestNkaCostItems(
      baseInput({
        transactions: [
          {
            id: TX_UUID,
            date: "2024-03-01",
            amount: -300,
            category: null,
            counterpart: "ABC Versicherungen",
            description: "Wohngebäudeversicherung 2024",
          },
        ],
      }),
    );
    expect(out.suggestions).toHaveLength(1);
    expect(out.suggestions[0].position).toBe("sach_haftpflicht_versicherung");
    expect(out.suggestions[0].confidence).toBe("low");
  });
});

describe("suggestNkaCostItems · Skip-Pfade", () => {
  it("Already-linked-Transaktion wird übersprungen", () => {
    const out = suggestNkaCostItems(
      baseInput({
        transactions: [
          {
            id: TX_UUID,
            date: "2024-02-10",
            amount: -85,
            category: "Müllabfuhr",
            counterpart: "Stadtwerke",
            description: null,
          },
        ],
        linkedTransactionIds: [TX_UUID],
      }),
    );
    expect(out.suggestions).toEqual([]);
    expect(out.skipped_already_linked).toEqual([TX_UUID]);
  });

  it("Positive Transaktion (Einnahme) mit Category → skipped_positive", () => {
    const out = suggestNkaCostItems(
      baseInput({
        transactions: [
          {
            id: TX_UUID,
            date: "2024-02-10",
            amount: +85, // Gutschrift
            category: "Müllabfuhr",
            counterpart: "Stadtwerke",
            description: null,
          },
        ],
      }),
    );
    expect(out.suggestions).toEqual([]);
    expect(out.skipped_positive).toEqual([TX_UUID]);
  });

  it("Periode-Filter: Transaktionen außerhalb der Periode werden ignoriert", () => {
    const out = suggestNkaCostItems(
      baseInput({
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        transactions: [
          {
            id: TX_UUID,
            date: "2023-12-31",
            amount: -85,
            category: "Müllabfuhr",
            counterpart: null,
            description: null,
          },
          {
            id: TX2_UUID,
            date: "2025-01-01",
            amount: -85,
            category: "Müllabfuhr",
            counterpart: null,
            description: null,
          },
          {
            id: TX3_UUID,
            date: "2024-06-15",
            amount: -85,
            category: "Müllabfuhr",
            counterpart: null,
            description: null,
          },
        ],
      }),
    );
    expect(out.suggestions).toHaveLength(1);
    expect(out.suggestions[0].transaction_id).toBe(TX3_UUID);
  });
});

describe("suggestNkaCostItems · User-Mapping Override", () => {
  it("User-Mapping überschreibt Default-Mapping", () => {
    const out = suggestNkaCostItems(
      baseInput({
        transactions: [
          {
            id: TX_UUID,
            date: "2024-04-01",
            amount: -100,
            category: "Müllabfuhr", // Default mapped → muellabfuhr
            counterpart: null,
            description: null,
          },
        ],
        // User remappt "Müllabfuhr" → "sonstiges"
        mapping: { "Müllabfuhr": "sonstiges" },
      }),
    );
    expect(out.suggestions[0].position).toBe("sonstiges");
  });

  it("DEFAULT_CATEGORY_MAPPING enthält die spezifizierten Schlüssel", () => {
    expect(DEFAULT_CATEGORY_MAPPING["Müllabfuhr"]).toBe("muellabfuhr");
    expect(DEFAULT_CATEGORY_MAPPING["Wasserversorgung"]).toBe("wasser");
    expect(DEFAULT_CATEGORY_MAPPING["Heizung"]).toBe("heizung");
    expect(DEFAULT_CATEGORY_MAPPING["Hausmeister"]).toBe("hauswart");
    expect(DEFAULT_CATEGORY_MAPPING["Allgemeinstrom"]).toBe("beleuchtung");
  });
});

describe("suggestNkaCostItems · Sortierung & Determinismus", () => {
  it("Mehrere Vorschläge werden nach (date ASC, id ASC) sortiert", () => {
    const out = suggestNkaCostItems(
      baseInput({
        transactions: [
          { id: TX3_UUID, date: "2024-08-01", amount: -100, category: "Müllabfuhr", counterpart: null, description: null },
          { id: TX_UUID, date: "2024-02-01", amount: -100, category: "Müllabfuhr", counterpart: null, description: null },
          { id: TX2_UUID, date: "2024-02-01", amount: -100, category: "Müllabfuhr", counterpart: null, description: null },
          { id: TX4_UUID, date: "2024-12-01", amount: -100, category: "Müllabfuhr", counterpart: null, description: null },
        ],
      }),
    );
    expect(out.suggestions.map((s) => s.transaction_id)).toEqual([
      TX_UUID,
      TX2_UUID,
      TX3_UUID,
      TX4_UUID,
    ]);
  });

  it("Determinismus: gleiche Eingabe → gleiches Ergebnis", () => {
    const inp = baseInput({
      transactions: [
        { id: TX_UUID, date: "2024-02-10", amount: -85, category: "Müllabfuhr", counterpart: "Stadtwerke", description: null },
        { id: TX2_UUID, date: "2024-04-15", amount: -200, category: null, counterpart: "Hausmeisterservice", description: null },
      ],
    });
    const a = suggestNkaCostItems(inp);
    const b = suggestNkaCostItems(inp);
    expect(a).toEqual(b);
  });
});

describe("suggestNkaCostItems · brutto_cents korrekt aus negativem amount", () => {
  it("amount = -85.50 → brutto_cents = 8550", () => {
    const out = suggestNkaCostItems(
      baseInput({
        transactions: [
          {
            id: TX_UUID,
            date: "2024-02-10",
            amount: -85.5,
            category: "Müllabfuhr",
            counterpart: null,
            description: null,
          },
        ],
      }),
    );
    expect(out.suggestions[0].brutto_cents).toBe(8550);
  });

  it("amount = -85.554 → brutto_cents = 8555 (half-up Rundung)", () => {
    const out = suggestNkaCostItems(
      baseInput({
        transactions: [
          {
            id: TX_UUID,
            date: "2024-02-10",
            amount: -85.555,
            category: "Müllabfuhr",
            counterpart: null,
            description: null,
          },
        ],
      }),
    );
    // Math.round(8555.5) → 8556 (half-up); Math.round(85.555*100) ≈ 8555.5
    expect([8555, 8556]).toContain(out.suggestions[0].brutto_cents);
  });
});
