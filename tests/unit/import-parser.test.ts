/**
 * Unit-Tests für `lib/tax/importParser.ts`.
 *
 * Schwerpunkte:
 *   - JSON-Extraktion aus Markdown-Code-Fences
 *   - Deutsches Zahlenformat (1.234,56 vs. amerikanisch 1,234.56)
 *   - OCR-typische Whitespace-Probleme (NBSP, Doppelblanks, em-dash)
 *   - asNullable*-Familie inkl. Claude-Wrapper { value, confidence }
 *   - Datumsformate (DE, ISO, Garbage-Fallback)
 *   - ELSTER-Block-Erkennung aus PDF-OCR-Text
 *   - Maintenance-Normalisierung (Carry-Forward, Distribution-Years-Clamping)
 */

import { describe, it, expect } from "vitest";
import {
  asNullableBoolean,
  asNullableDateString,
  asNullableInteger,
  asNullableNumber,
  asNullableString,
  extractJsonText,
  inferMaintenanceSourceYear,
  normalizeImportedMaintenanceDistribution,
  parseGermanAmount,
  parseOfficialElsterValuesFromText,
  reconcileMaintenanceDistributionsWithExpenseBlocks,
  unwrapExtractedValue,
  type ImportedExpenseBlock,
  type ImportedMaintenanceDistribution,
} from "@/lib/tax/importParser";

describe("importParser · extractJsonText", () => {
  it("parst plaines JSON ohne Fence", () => {
    expect(extractJsonText('{"a":1}')).toEqual({ a: 1 });
  });

  it("toleriert ```json ...``` Markdown-Fence", () => {
    const raw = '```json\n{"rent_income": 12625, "tax_year": 2024}\n```';
    expect(extractJsonText(raw)).toEqual({ rent_income: 12625, tax_year: 2024 });
  });

  it("toleriert generischen ``` ...``` Fence ohne json-Hinweis", () => {
    const raw = '```\n{"a":1}\n```';
    expect(extractJsonText(raw)).toEqual({ a: 1 });
  });

  it("Substring-Fallback für Antworten mit umliegendem Text", () => {
    const raw = 'Hier das Ergebnis:\n{"a": 1, "b": [1,2,3]}\nVielen Dank.';
    expect(extractJsonText(raw)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it("wirft, wenn keinerlei JSON-Struktur erkennbar ist", () => {
    expect(() => extractJsonText("kein JSON hier")).toThrow();
  });

  it("leerer String wirft", () => {
    expect(() => extractJsonText("")).toThrow();
  });
});

describe("importParser · parseGermanAmount", () => {
  it("Standard 1.234,56 → 1234.56", () => {
    expect(parseGermanAmount("1.234,56")).toBe(1234.56);
  });

  it("12.625 (Tausenderpunkt vor 3 Ziffern) → 12625", () => {
    expect(parseGermanAmount("12.625")).toBe(12625);
  });

  it("Whitespace ringsum egal: ' 12,5 '", () => {
    expect(parseGermanAmount(" 12,5 ")).toBe(12.5);
  });

  it("Dezimalwert ohne Tausenderpunkt: 0,00 → 0", () => {
    expect(parseGermanAmount("0,00")).toBe(0);
  });

  it("Mehrere Tausenderpunkte: 1.234.567,89 → 1234567.89", () => {
    expect(parseGermanAmount("1.234.567,89")).toBe(1234567.89);
  });

  it("Leerstring → null", () => {
    expect(parseGermanAmount("")).toBeNull();
  });

  it("null → null", () => {
    expect(parseGermanAmount(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(parseGermanAmount(undefined)).toBeNull();
  });

  it("Garbage-String → null", () => {
    expect(parseGermanAmount("not a number")).toBeNull();
  });

  it("Amerikanisch 12,625.50 wird hier NICHT korrekt geparst (das ist erwartet — Format ist deutsch)", () => {
    // Komma würde als Dezimalpunkt interpretiert → 12.625
    // Wir halten dieses Verhalten als Doku fest, damit niemand den Helper als "universal" missversteht.
    expect(parseGermanAmount("12,625.50")).toBe(NaN || null); // toleriert NaN/null
    // Realiter liefert Number("12.625.50") NaN → null
    expect(parseGermanAmount("12,625.50")).toBeNull();
  });
});

describe("importParser · unwrapExtractedValue", () => {
  it("Plain Value bleibt unverändert", () => {
    expect(unwrapExtractedValue(42)).toBe(42);
    expect(unwrapExtractedValue("foo")).toBe("foo");
  });

  it("Claude-Wrapper { value, confidence } → unwrapped", () => {
    expect(unwrapExtractedValue({ value: 12625, confidence: "high" })).toBe(12625);
    expect(unwrapExtractedValue({ value: "Müller", confidence: "medium" })).toBe("Müller");
  });

  it("null/undefined unverändert", () => {
    expect(unwrapExtractedValue(null)).toBeNull();
    expect(unwrapExtractedValue(undefined)).toBeUndefined();
  });
});

describe("importParser · asNullableNumber", () => {
  it("Number-Input direkt", () => {
    expect(asNullableNumber(123)).toBe(123);
  });

  it("Wrapper { value: 123, confidence: 'high' }", () => {
    expect(asNullableNumber({ value: 123, confidence: "high" })).toBe(123);
  });

  it("Deutscher String '1.234,56'", () => {
    expect(asNullableNumber("1.234,56")).toBe(1234.56);
  });

  it("OCR-typischer NBSP+Komma: '1 234,56' → 1234.56", () => {
    //   ist Non-Breaking-Space, kommt in OCR häufig vor.
    expect(asNullableNumber("1 234,56")).toBe(1234.56);
  });

  it("Leerstring → null", () => {
    expect(asNullableNumber("")).toBeNull();
  });

  it("null → null, undefined → null", () => {
    expect(asNullableNumber(null)).toBeNull();
    expect(asNullableNumber(undefined)).toBeNull();
  });

  it("Infinity / NaN → null", () => {
    expect(asNullableNumber(Infinity)).toBeNull();
    expect(asNullableNumber(NaN)).toBeNull();
  });
});

describe("importParser · asNullableInteger", () => {
  it("Truncate Decimal", () => {
    expect(asNullableInteger("3.7")).toBe(3);
    expect(asNullableInteger("-3.7")).toBe(-3);
  });

  it("Wrapper-Format akzeptiert", () => {
    expect(asNullableInteger({ value: 365 })).toBe(365);
  });
});

describe("importParser · asNullableString", () => {
  it("String unverändert", () => {
    expect(asNullableString("Müller")).toBe("Müller");
  });

  it("Number → String", () => {
    expect(asNullableString(123)).toBe("123");
  });

  it("Wrapper-Format", () => {
    expect(asNullableString({ value: "Foo", confidence: "high" })).toBe("Foo");
  });

  it("Leerstring → null", () => {
    expect(asNullableString("")).toBeNull();
  });
});

describe("importParser · asNullableBoolean", () => {
  it("Boolean direkt", () => {
    expect(asNullableBoolean(true)).toBe(true);
    expect(asNullableBoolean(false)).toBe(false);
  });

  it("Strings 'ja'/'nein' (deutsch)", () => {
    expect(asNullableBoolean("ja")).toBe(true);
    expect(asNullableBoolean("nein")).toBe(false);
  });

  it("Strings 'true'/'false'", () => {
    expect(asNullableBoolean("TRUE")).toBe(true);
    expect(asNullableBoolean("False")).toBe(false);
  });

  it("Number 0 → false, 1 → true", () => {
    expect(asNullableBoolean(0)).toBe(false);
    expect(asNullableBoolean(1)).toBe(true);
  });

  it("Unbekannter String → null", () => {
    expect(asNullableBoolean("vielleicht")).toBeNull();
  });
});

describe("importParser · asNullableDateString", () => {
  it("Deutsches DD.MM.YYYY", () => {
    expect(asNullableDateString("11.08.2022")).toBe("2022-08-11");
  });

  it("Deutsches D.M.YYYY (ohne führende Nullen)", () => {
    expect(asNullableDateString("1.3.2024")).toBe("2024-03-01");
  });

  it("ISO YYYY-MM-DD bleibt", () => {
    expect(asNullableDateString("2024-12-31")).toBe("2024-12-31");
  });

  it("ISO mit T-Suffix wird gekürzt", () => {
    expect(asNullableDateString("2024-12-31T23:59:59Z")).toBe("2024-12-31");
  });

  it("Garbage-Input bleibt als String erhalten (toleranter Fallback)", () => {
    // Wenn der Date-Parser nicht erkennt, geben wir den Original-String zurück,
    // damit der Aufrufer das Feld als low-confidence behandeln kann.
    expect(asNullableDateString("nicht-ein-datum")).toBe("nicht-ein-datum");
  });

  it("null/leer → null", () => {
    expect(asNullableDateString(null)).toBeNull();
    expect(asNullableDateString("")).toBeNull();
  });
});

describe("importParser · parseOfficialElsterValuesFromText", () => {
  const SAMPLE_PDF_TEXT = [
    "Anlage V 2024",
    "Angeschafft am 11.08.2022",
    "35 Abzugsfähige Werbungskosten 11.935",
    "45 Abzugsfähige Werbungskosten 2.289",
    "75 Abzugsfähige Werbungskosten 4.360",
    "78 Abzugsfähige Werbungskosten 413",
    "82 Abzugsfähige Werbungskosten 5.981",
    "57 Gesamtaufwand 2024 7.541,41",
    "59 Gesamtbetrag in EUR, Ct 2.513,80",
    "60 Abzugsfähige Werbungskosten 2.396",
    "68 Gesamtbetrag in EUR, Ct 6.320,00",
    "69 Abzugsfähige Werbungskosten 1.205",
    "71 Gesamtbetrag in EUR, Ct 3.060,00",
    "72 Abzugsfähige Werbungskosten 583",
  ].join("\n");

  it("Acquisition-Date wird erkannt und ISO-formatiert", () => {
    const out = parseOfficialElsterValuesFromText({ text: SAMPLE_PDF_TEXT, taxYear: 2024 });
    expect(out.acquisition_date).toBe("2022-08-11");
  });

  it("AfA Gebäude (Z.35) und AfA Inventar (Z.45) werden geparst", () => {
    const out = parseOfficialElsterValuesFromText({ text: SAMPLE_PDF_TEXT, taxYear: 2024 });
    expect(out.depreciation_building).toBe(11935);
    expect(out.depreciation_fixtures).toBe(2289);
  });

  it("Expense-Blocks werden für Z.75/Z.78/Z.82 gebaut", () => {
    const out = parseOfficialElsterValuesFromText({ text: SAMPLE_PDF_TEXT, taxYear: 2024 });
    const keys = out.expense_blocks.map((b) => b.key);
    expect(keys).toContain("allocated_costs");
    expect(keys).toContain("non_allocated_costs");
    expect(keys).toContain("other_expenses");
    expect(out.expense_blocks.find((b) => b.key === "allocated_costs")?.amount).toBe(4360);
  });

  it("Maintenance-Distributions für aktuelles Jahr + 2022/2023 erzeugt", () => {
    const out = parseOfficialElsterValuesFromText({ text: SAMPLE_PDF_TEXT, taxYear: 2024 });
    expect(out.maintenance_distributions).toHaveLength(3);
    const sources = out.maintenance_distributions.map((m) => m.source_year).sort();
    expect(sources).toEqual([2022, 2023, 2024]);
  });

  it("OCR mit em-dash und NBSP wird normalisiert", () => {
    const ocrText = `Angeschafft am 11.08.2022 — 35 Abzugsfähige Werbungskosten 11.935`;
    const out = parseOfficialElsterValuesFromText({ text: ocrText, taxYear: 2024 });
    expect(out.acquisition_date).toBe("2022-08-11");
    expect(out.depreciation_building).toBe(11935);
  });

  it("Leerer Text → leere Arrays, alle Werte null", () => {
    const out = parseOfficialElsterValuesFromText({ text: "", taxYear: 2024 });
    expect(out.acquisition_date).toBeNull();
    expect(out.depreciation_building).toBeNull();
    expect(out.expense_blocks).toEqual([]);
    expect(out.maintenance_distributions).toEqual([]);
  });
});

describe("importParser · inferMaintenanceSourceYear", () => {
  function buildItem(overrides: Partial<ImportedMaintenanceDistribution>): ImportedMaintenanceDistribution {
    return {
      label: "Erhaltungsaufwand",
      source_year: null,
      total_amount: 1000,
      classification: "maintenance_expense",
      deduction_mode: "distributed",
      distribution_years: 5,
      current_year_share_override: null,
      apply_rental_ratio: true,
      note: null,
      ...overrides,
    };
  }

  it("source_year explizit gesetzt → bleibt", () => {
    expect(inferMaintenanceSourceYear(buildItem({ source_year: 2022 }), 2024)).toBe(2022);
  });

  it("Label 'Erhaltungsaufwand aus 2022' → 2022", () => {
    expect(
      inferMaintenanceSourceYear(buildItem({ label: "Erhaltungsaufwand aus 2022" }), 2024),
    ).toBe(2022);
  });

  it("Note 'aus 2023' → 2023", () => {
    expect(
      inferMaintenanceSourceYear(buildItem({ note: "Stammt aus 2023" }), 2024),
    ).toBe(2023);
  });

  it("Kein Hinweis → fallback auf taxYear", () => {
    expect(inferMaintenanceSourceYear(buildItem({}), 2024)).toBe(2024);
  });
});

describe("importParser · normalizeImportedMaintenanceDistribution", () => {
  function buildItem(overrides: Partial<ImportedMaintenanceDistribution>): ImportedMaintenanceDistribution {
    return {
      label: "Erhaltungsaufwand 2022",
      source_year: 2022,
      total_amount: 6320,
      classification: "maintenance_expense",
      deduction_mode: "immediate",
      distribution_years: null,
      current_year_share_override: null,
      apply_rental_ratio: true,
      note: null,
      ...overrides,
    };
  }

  it("Carry-Forward (Quelljahr < Steuerjahr): erzwingt distributed", () => {
    const out = normalizeImportedMaintenanceDistribution(buildItem({}), 2024);
    expect(out.deduction_mode).toBe("distributed");
  });

  it("Distribution-Years werden auf [2..5] geclampt", () => {
    const out = normalizeImportedMaintenanceDistribution(
      buildItem({ distribution_years: 99 }),
      2024,
    );
    expect(out.distribution_years).toBeLessThanOrEqual(5);
  });

  it("Aktuelles Jahr + immediate bleibt immediate, distribution_years = 1", () => {
    const out = normalizeImportedMaintenanceDistribution(
      buildItem({ source_year: 2024, deduction_mode: "immediate", distribution_years: null }),
      2024,
    );
    expect(out.deduction_mode).toBe("immediate");
    expect(out.distribution_years).toBe(1);
  });
});

describe("importParser · reconcileMaintenanceDistributionsWithExpenseBlocks", () => {
  it("Setzt current_year_share_override aus passendem Block", () => {
    const blocks: ImportedExpenseBlock[] = [
      {
        key: "maintenance_prior_year_2022",
        label: "Verteilter Erhaltungsaufwand aus 2022",
        amount: 1264,
        detail: "Aus offiziellem ELSTER-Block Zeile 69 übernommen",
      },
    ];
    const dists: ImportedMaintenanceDistribution[] = [
      {
        label: "Erhaltungsaufwand 2022",
        source_year: 2022,
        total_amount: 6320,
        classification: "maintenance_expense",
        deduction_mode: "distributed",
        distribution_years: 5,
        current_year_share_override: null,
        apply_rental_ratio: true,
        note: null,
      },
    ];
    const out = reconcileMaintenanceDistributionsWithExpenseBlocks({
      blocks,
      taxYear: 2024,
      distributions: dists,
    });
    expect(out[0].current_year_share_override).toBe(1264);
    expect(out[0].apply_rental_ratio).toBe(false);
  });

  it("Block ohne passendes Quelljahr → keine Mutation", () => {
    const blocks: ImportedExpenseBlock[] = [
      { key: "allocated_costs", label: "Umlagefähige Kosten", amount: 4360, detail: null },
    ];
    const dists: ImportedMaintenanceDistribution[] = [
      {
        label: "Erhaltungsaufwand 2022",
        source_year: 2022,
        total_amount: 6320,
        classification: "maintenance_expense",
        deduction_mode: "distributed",
        distribution_years: 5,
        current_year_share_override: null,
        apply_rental_ratio: true,
        note: null,
      },
    ];
    const out = reconcileMaintenanceDistributionsWithExpenseBlocks({
      blocks,
      taxYear: 2024,
      distributions: dists,
    });
    expect(out[0].current_year_share_override).toBeNull();
  });

  it("Empty Inputs → empty Output", () => {
    const out = reconcileMaintenanceDistributionsWithExpenseBlocks({
      blocks: [],
      taxYear: 2024,
      distributions: [],
    });
    expect(out).toEqual([]);
  });
});
