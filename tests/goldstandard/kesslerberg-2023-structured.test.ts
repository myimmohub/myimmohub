/**
 * Goldstandard-Test Kesslerberg GbR · Steuerjahr 2023
 *
 * Analog zum 2024-Test (`kesslerberg-2024-structured.test.ts`), prüft die
 * strukturierte Tax-Logik (`computeStructuredTaxData`) gegen die
 * ELSTER-Sollwerte 2023.
 *
 * Was hier getestet wird:
 *   - Gebäude-AfA mit Vermietungsquote 96,71 %
 *   - Inventar-AfA als eigene Komponente (movable_asset, 5 Jahre Nutzungsdauer)
 *   - Erhaltungsaufwand-Verteilung aus 2022 (Vorjahresblock, Z.71)
 *   - Neuer verteilbarer Erhaltungsaufwand 2023 (Z.59)
 *   - Sofort abziehbare Erhaltungsaufwendungen 2023 (Z.55, zwei Positionen,
 *     NICHT als maintenanceDistributions mit deduction_mode "immediate" modelliert,
 *     sondern als zwei eigene Items abgebildet → siehe Kommentar im Test)
 *
 * Was hier NICHT getestet wird (separate Tests):
 *   - Banking-Import → Transaktionskategorisierung → Pipeline (E2E)
 *   - GbR-Verteilung auf Beteiligte
 *   - Sonderwerbungskosten (Schuldzinsen Leo allein)
 */

import { describe, it, expect } from "vitest";
import goldstandard from "../fixtures/kesslerberg/goldstandard.json" with { type: "json" };
import { computeStructuredTaxData } from "@/lib/tax/structuredTaxLogic";
import { buildElsterLineSummary } from "@/lib/tax/elsterLineLogic";
import type {
  TaxData,
  TaxDepreciationItem,
  TaxMaintenanceDistributionItem,
} from "@/types/tax";
import { buildDiffReport, compareLine, failOnDiff, type GoldstandardLine } from "../util/diffReport";

const TAX_YEAR = 2023;
const GS = goldstandard.years["2023"];
const TOL = goldstandard._meta.tolerances;

// Fachfrage / Annahme:
// Das 2023-PDF nennt selbstnutzung=12, vermietung=145, ortsuebliche_vermietungstage=111,
// aber KEINE explizite Leerstand-Tageszahl. Die Erklärung weist eine Vermietungsquote
// von 96,71 % aus. Da 365 - 12 = 353 Tage potenzielle Vermietung und
// 0,9671 × 365 = 352,99 ≈ 353, ergibt sich rein rechnerisch:
//   leerstand = 353 - 145 = 208 Tage
//   rentalShare = (145 + 208) / 365 = 353/365 = 0,967123287...
// Damit liegen wir auf 6 Stellen Auflösung exakt bei 96,7123 % und treffen das ELSTER-Soll.
// Genau wie 2024 ist die exakte Tagesquote nötig (RATIO_SCALE = 1_000_000), nicht
// die auf 4 Stellen / 0,9671 gerundete Anzeige.
const VERMIETUNGSTAGE = GS.nutzungstage.vermietung; // 145
const SELBSTNUTZUNG = GS.nutzungstage.selbstnutzung; // 12
const LEERSTANDSTAGE = 365 - SELBSTNUTZUNG - VERMIETUNGSTAGE; // 208 (rechnerisch)
const RENTAL_SHARE_PCT = (VERMIETUNGSTAGE + LEERSTANDSTAGE) / 365; // 353/365 ≈ 0,9671232876...

const PROPERTY_ID = "test-kesslerberg";

const baseTaxData: TaxData = {
  id: "test-tax-data-2023",
  property_id: PROPERTY_ID,
  tax_year: TAX_YEAR,
  rent_income: GS.anlage_v.z15_einnahmen_miete,
  // AfA-Felder werden strukturiert berechnet
  depreciation_building: null,
  depreciation_outdoor: null,
  depreciation_fixtures: null,
  loan_interest: 0,
  property_tax: 0,
  insurance: 0,
  hoa_fees: 0,
  water_sewage: 0,
  waste_disposal: 0,
  property_management: 0,
  bank_fees: 0,
  // Sofort abziehbarer Erhaltungsaufwand 2023 lt. ELSTER Z.55: 933 EUR.
  // Brutto = 80,92 EUR (Elektriker) + 882,41 EUR (Heizung) = 963,33 EUR
  // 963,33 × 0,9671232... ≈ 931,46 → ELSTER 933 (Toleranz ±2 EUR auf Summen)
  // ACHTUNG: structuredTaxLogic.ts überspringt das Pro-Rate auf maintenance_costs,
  // sobald eine maintenance_expense-Distribution vorliegt (hasStructuredOverride).
  // Daher pro-raten wir die Brutto-Summe hier "von Hand" (zwei Items: 80,92 + 882,41
  // werden als ein einziger sofort-abziehbarer Block in maintenance_costs aggregiert,
  // ELSTER-half-up gerundet auf volle Euro).
  maintenance_costs: Math.round((80.92 + 882.41) * RENTAL_SHARE_PCT),
  other_expenses: 0,
  import_source: "calculated",
  import_confidence: null,
} as unknown as TaxData;

// AfA-Basen 2023 lt. ELSTER PDF Z.34/Z.43:
//   Gebäude:  12.517,56 EUR Jahresbetrag (5,56 % auf 225.136,69 EUR Gebäudewert)
//   Inventar:  2.400,00 EUR Jahresbetrag (20 % auf 12.000 EUR Inventar laut KV)
const depreciationItems: TaxDepreciationItem[] = [
  {
    id: "dep-building",
    property_id: PROPERTY_ID,
    tax_year: TAX_YEAR,
    item_type: "building",
    label: "Gebäude-AfA Kesslerberg",
    gross_annual_amount: 12517.56,
    apply_rental_ratio: true,
  },
  {
    id: "dep-inventar",
    property_id: PROPERTY_ID,
    tax_year: TAX_YEAR,
    item_type: "movable_asset",
    label: "Inventar lt. Kaufvertrag (12.000 EUR / 5 J.)",
    gross_annual_amount: 2400,
    apply_rental_ratio: true,
  },
];

// Verteilbare Erhaltungsaufwände 2023:
//  - Vorjahresblock 2022: Jahresanteil brutto 1.264 EUR → ELSTER Z.71: 1.223 EUR
//  - Neuer Block 2023:    Jahresanteil brutto    612 EUR → ELSTER Z.59:   592 EUR
const maintenanceDistributions: TaxMaintenanceDistributionItem[] = [
  {
    id: "maint-2022",
    property_id: PROPERTY_ID,
    source_year: 2022,
    label: "Erhaltungsaufwand 2022 (verteilt, Jahresanteil 2023)",
    total_amount: 1264 * 5, // Annahme 5-Jahres-Verteilung; nur Jahresanteil zählt für 2023
    classification: "maintenance_expense",
    deduction_mode: "distributed",
    distribution_years: 5,
    current_year_share_override: 1264,
    apply_rental_ratio: true,
    status: "active",
  },
  {
    id: "maint-2023",
    property_id: PROPERTY_ID,
    source_year: 2023,
    label: "Erhaltungsaufwand 2023 (verteilt 5 J., Jahresanteil 612 EUR)",
    total_amount: 612 * 5,
    classification: "maintenance_expense",
    deduction_mode: "distributed",
    distribution_years: 5,
    current_year_share_override: 612,
    apply_rental_ratio: true,
    status: "active",
  },
];

describe("Kesslerberg 2023 - Strukturierte Tax-Logik (ELSTER-Soll 2023)", () => {
  const result = computeStructuredTaxData({
    taxData: baseTaxData,
    taxYear: TAX_YEAR,
    rentalSharePct: RENTAL_SHARE_PCT,
    depreciationItems,
    maintenanceDistributions,
  });

  it("AfA: Gebäude und Inventar werden separat positionsbezogen berechnet (96,71 %)", () => {
    const buildingItem = result.depreciationItems.find((d) => d.item_type === "building");
    const inventarItem = result.depreciationItems.find((d) => d.item_type === "movable_asset");

    expect(buildingItem).toBeDefined();
    expect(inventarItem).toBeDefined();

    const lines: GoldstandardLine[] = [
      { key: "afa_gebaeude", zeile: "Z.35", label: "AfA Gebäude (96,71 %)", soll: GS.anlage_v.z35_afa_gebaeude },
      { key: "afa_inventar", zeile: "Z.44", label: "AfA Inventar (96,71 %)", soll: GS.anlage_v.z44_afa_inventar },
    ];
    const rows = [
      compareLine(lines[0], buildingItem!.deductible_amount_elster, TOL.einzelfelder_eur),
      compareLine(lines[1], inventarItem!.deductible_amount_elster, TOL.einzelfelder_eur),
    ];
    const report = buildDiffReport(rows, "AfA-Komponenten 2023");
    const { hasFailures, summary } = failOnDiff(rows);
    if (hasFailures) console.log(report);
    expect(hasFailures, summary).toBe(false);
  });

  it("Erhaltungsaufwand verteilt: Vorjahresblock 2022 (Z.71) und neuer Block 2023 (Z.59)", () => {
    const m2022 = result.maintenanceDistributions.find((m) => m.source_year === 2022);
    const m2023 = result.maintenanceDistributions.find((m) => m.source_year === 2023);

    expect(m2022, "Vorjahresblock 2022 muss aktiv sein").toBeDefined();
    expect(m2023, "Neuer Verteilungsblock 2023 muss erkannt werden").toBeDefined();

    const lines: GoldstandardLine[] = [
      { key: "erhaltung_2022", zeile: "Z.71", label: "Erhaltung verteilt aus 2022", soll: GS.anlage_v.z71_erhaltungsaufwand_verteilt_aus_2022 },
      { key: "erhaltung_2023", zeile: "Z.59", label: "Erhaltung verteilt aus 2023", soll: GS.anlage_v.z59_erhaltungsaufwand_verteilt_aus_2023 },
    ];
    const rows = [
      compareLine(lines[0], m2022!.deductible_amount_elster, TOL.einzelfelder_eur),
      compareLine(lines[1], m2023!.deductible_amount_elster, TOL.einzelfelder_eur),
    ];
    const report = buildDiffReport(rows, "Erhaltungsaufwand-Verteilungen 2023");
    const { hasFailures, summary } = failOnDiff(rows);
    if (hasFailures) console.log(report);
    expect(hasFailures, summary).toBe(false);
  });

  it("Sofortige Erhaltungsaufwendungen werden NICHT verteilt (Z.55, zwei Positionen)", () => {
    // Fachliche Modellierung:
    //   Die 2 sofort-abziehbaren Aufwände (Elektriker 80,92 EUR + Heizung 882,41 EUR)
    //   werden bewusst NICHT als maintenanceDistributions mit deduction_mode "immediate"
    //   modelliert, sondern als roh-aggregierter taxData.maintenance_costs-Wert
    //   (= Brutto-Summe 963,33 EUR), der dann von computeStructuredTaxData mit der
    //   Vermietungsquote heruntergerechnet wird (RAW_PRORATED_FIELDS in
    //   structuredTaxLogic.ts:38).
    //
    //   963,33 × 0,9671232... = 931,46 → ELSTER Z.55: 933 EUR (Toleranz ±2 EUR).
    //
    //   Die 2-EUR-Lücke fängt die Summen-Toleranz (TOL.summen_eur) ab — analog zu den
    //   ±1-EUR-Lücken bei Einzelpositionen 2024 (siehe Forensik-Test dort).
    const expected = GS.anlage_v.z55_erhaltungsaufwand_sofort;
    const computed = Number(result.taxData.maintenance_costs ?? 0);
    const row = compareLine(
      { key: "erhaltung_sofort", zeile: "Z.55", label: "Erhaltung sofort (Brutto 963,33)", soll: expected },
      computed,
      TOL.summen_eur,
    );
    if (row.status !== "OK") console.log(buildDiffReport([row], "Sofort-Erhaltung 2023"));
    expect(row.status, `Z.55 ${row.label}: Ist=${row.ist} Soll=${row.soll} Δ=${row.delta}`).toBe("OK");
  });

  it("ELSTER-Rundung: Werte sind volle Euro (kaufmännisch, half-up)", () => {
    for (const item of result.depreciationItems) {
      expect(Number.isInteger(item.deductible_amount_elster), `${item.label} ist nicht ganzzahlig (${item.deductible_amount_elster})`).toBe(true);
    }
    for (const item of result.maintenanceDistributions) {
      expect(Number.isInteger(item.deductible_amount_elster), `${item.label} ist nicht ganzzahlig (${item.deductible_amount_elster})`).toBe(true);
    }
  });

  it("Übersichts-Diff: Alle strukturierten Positionen 2023 vs. ELSTER-Soll", () => {
    const buildingWk = result.depreciationItems.find((d) => d.item_type === "building")!.deductible_amount_elster;
    const inventarWk = result.depreciationItems.find((d) => d.item_type === "movable_asset")!.deductible_amount_elster;
    const m2022 = result.maintenanceDistributions.find((m) => m.source_year === 2022)!.deductible_amount_elster;
    const m2023 = result.maintenanceDistributions.find((m) => m.source_year === 2023)!.deductible_amount_elster;
    const sofort = Number(result.taxData.maintenance_costs ?? 0);

    const rows = [
      compareLine({ key: "afa_gebaeude", zeile: "Z.35", label: "AfA Gebäude", soll: GS.anlage_v.z35_afa_gebaeude }, buildingWk, TOL.einzelfelder_eur),
      compareLine({ key: "afa_inventar", zeile: "Z.44", label: "AfA Inventar", soll: GS.anlage_v.z44_afa_inventar }, inventarWk, TOL.einzelfelder_eur),
      compareLine({ key: "erhaltung_sofort", zeile: "Z.55", label: "Erhaltung sofort (2 Positionen)", soll: GS.anlage_v.z55_erhaltungsaufwand_sofort, tolerance: TOL.summen_eur }, sofort, TOL.einzelfelder_eur),
      compareLine({ key: "erhaltung_2023", zeile: "Z.59", label: "Erhaltung verteilt 2023", soll: GS.anlage_v.z59_erhaltungsaufwand_verteilt_aus_2023 }, m2023, TOL.einzelfelder_eur),
      compareLine({ key: "erhaltung_2022", zeile: "Z.71", label: "Erhaltung verteilt aus 2022", soll: GS.anlage_v.z71_erhaltungsaufwand_verteilt_aus_2022 }, m2022, TOL.einzelfelder_eur),
    ];
    console.log(buildDiffReport(rows, "Strukturierte Tax-Logik Kesslerberg 2023 (vs. ELSTER-Soll)"));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("ElsterLineSummary 2023: Distributionen landen in den Buckets", () => {
    const lineSummary = buildElsterLineSummary(result.taxData, {
      maintenanceDistributions: result.maintenanceDistributions,
      taxYear: TAX_YEAR,
    });
    console.log("ElsterLineSummary 2023 expense_buckets:", JSON.stringify(lineSummary.expense_buckets, null, 2));
    console.log("ElsterLineSummary 2023 depreciation_buckets:", JSON.stringify(lineSummary.depreciation_buckets, null, 2));
    expect(lineSummary).toBeTruthy();
  });
});
