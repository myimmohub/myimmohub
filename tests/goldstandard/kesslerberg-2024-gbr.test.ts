/**
 * Goldstandard-Test Kesslerberg GbR · Steuerjahr 2024 · GbR-Verteilung
 *
 * Prüft `buildGbrTaxReport` gegen die Sollwerte der ELSTER-Anlagen FE 1 / FB:
 *   - Z.58 (laufende Einkünfte GbR total): 12.625,00 EUR (Mieteinnahmen, NICHT
 *     Ergebnisverteilung)
 *   - Z.61 / Z.122 (Sonderwerbungskosten Beteiligter Nr.3 = Leo, Schuldzinsen
 *     allein finanziert): -7.822,90 EUR
 *
 * Aufteilung:
 *   - Beteiligter 1 (Uta Hedwig Tacke):  1/8
 *   - Beteiligter 2 (Maurus Tacke):       1/8
 *   - Beteiligter 3 (Leo Tacke):          3/4   ← trägt Schuldzinsen allein
 *
 * WICHTIG: `buildGbrTaxReport` erwartet Sonderwerbungskosten als
 *   `partnerTaxValues[]` mit `gbr_partner_id` + `special_expenses`.
 *   Falls die Engine die Werte als positive "Abzüge" speichert, prüfen wir die
 *   Vorzeichen entsprechend (Engine-Code: `Math.abs(...)` in gbrTaxReport.ts:280).
 *
 * Was hier NICHT gemacht wird:
 *   - Pipeline-Tests (separat: kesslerberg-2024-pipeline.test.ts)
 *   - Strukturierte Tax-Logik (separat: kesslerberg-2024-structured.test.ts)
 */

import { describe, it, expect } from "vitest";
import goldstandard from "../fixtures/kesslerberg/goldstandard.json" with { type: "json" };
import {
  buildGbrTaxReport,
  type GbrSettingsSummary,
  type GbrPartnerTaxValue,
  type TaxSettingsSummary,
} from "@/lib/tax/gbrTaxReport";
import type {
  TaxData,
  TaxDepreciationItem,
  TaxMaintenanceDistributionItem,
} from "@/types/tax";
import { buildDiffReport, compareLine } from "../util/diffReport";

const TAX_YEAR = 2024;
const GS = goldstandard.years["2024"];
const TOL = goldstandard._meta.tolerances;
const PROPERTY_ID = "test-kesslerberg";

const PROPERTY = {
  id: PROPERTY_ID,
  name: "Kesslerberg",
  address: "Am Kesslerberg 7, 79856 Hinterzarten",
};

// Tagesangaben aus Goldstandard 2024: 17 Selbstnutzung, 114 Vermietung, 234 Leerstand
const TAX_SETTINGS: TaxSettingsSummary = {
  eigennutzung_tage: 17,
  gesamt_tage: 365,
  rental_share_override_pct: null,
};

// Partner-Anteile: 1/8, 1/8, 3/4 entspricht 12,5 / 12,5 / 75 (Prozent)
const GBR_SETTINGS: GbrSettingsSummary = {
  property_id: PROPERTY_ID,
  name: "Kesslerberg GbR",
  steuernummer: "00000/00000",
  finanzamt: "Hinterzarten",
  veranlagungszeitraum: TAX_YEAR,
  sonder_werbungskosten: true,
  feststellungserklaerung: true,
  teilweise_eigennutzung: true,
  gbr_partner: [
    { id: "p1-uta", name: "Uta Hedwig Tacke", anteil: 12.5, email: null },
    { id: "p2-maurus", name: "Maurus Tacke", anteil: 12.5, email: null },
    { id: "p3-leo", name: "Leo Tacke", anteil: 75.0, email: null },
  ],
};

const baseTaxData: TaxData = {
  id: "test-tax-data-2024-gbr",
  property_id: PROPERTY_ID,
  tax_year: TAX_YEAR,
  rent_income: GS.anlage_v.z15_einnahmen_miete,
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
  maintenance_costs: 0,
  other_expenses: 0,
  import_source: "calculated",
  import_confidence: null,
} as unknown as TaxData;

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
    label: "Inventar lt. Kaufvertrag",
    gross_annual_amount: 2400,
    apply_rental_ratio: true,
  },
];

const maintenanceDistributions: TaxMaintenanceDistributionItem[] = [
  {
    id: "maint-2022",
    property_id: PROPERTY_ID,
    source_year: 2022,
    label: "Erhaltungsaufwand 2022 (verteilt)",
    total_amount: 1264 * 5,
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
    label: "Erhaltungsaufwand 2023 (verteilt)",
    total_amount: 612 * 5,
    classification: "maintenance_expense",
    deduction_mode: "distributed",
    distribution_years: 5,
    current_year_share_override: 612,
    apply_rental_ratio: true,
    status: "active",
  },
  {
    id: "maint-2024-walerij",
    property_id: PROPERTY_ID,
    source_year: 2024,
    label: "Walerij Mut Dienstleistungen 2024 (verteilt 3 J.)",
    total_amount: 428.40 + 2085.47,
    classification: "maintenance_expense",
    deduction_mode: "distributed",
    distribution_years: 3,
    apply_rental_ratio: true,
    status: "active",
  },
];

// Sonderwerbungskosten Leo: Schuldzinsen 7.822,90 EUR (allein finanziert).
// gbrTaxReport speichert special_expenses positiv und zieht sie vom Anteil ab.
const PARTNER_TAX_VALUES: GbrPartnerTaxValue[] = [
  { gbr_partner_id: "p3-leo", special_expenses: 7822.90, note: "Schuldzinsen Leo allein lt. Zinsbestätigung 2024" },
];

describe("Kesslerberg 2024 - GbR-Verteilung (Anlage FE 1 / FB)", () => {
  const report = buildGbrTaxReport({
    property: PROPERTY,
    taxData: baseTaxData,
    gbrSettings: GBR_SETTINGS,
    partnerTaxValues: PARTNER_TAX_VALUES,
    taxSettings: TAX_SETTINGS,
    depreciationItems,
    maintenanceDistributions,
  });

  it("FE total income: 12.625 EUR Mieteinnahmen (Z.58 'laufende Einkünfte GbR')", () => {
    // Anmerkung: Das ELSTER-Feld Z.58 in der Anlage FE 1 wird im Goldstandard mit
    // 12.625,00 EUR ausgewiesen. Der Goldstandard-Kommentar betont: "das sind die
    // EINNAHMEN, nicht die Ergebnisaufteilung".
    const row = compareLine(
      { key: "fe_total_income", zeile: "Z.58", label: "FE laufende Einkünfte GbR (Einnahmen)", soll: GS.fe_fb.z58_laufende_einkuenfte_gbr_total },
      report.fe.total_income,
      TOL.summen_eur,
    );
    if (row.status !== "OK") {
      console.log(buildDiffReport([row], "GbR FE total income"));
    }
    expect(row.ist).toBeCloseTo(GS.fe_fb.z58_laufende_einkuenfte_gbr_total, 0);
  });

  it("FB Aufteilung: 1/8 + 1/8 + 3/4 = 100 %", () => {
    expect(report.fb).toHaveLength(3);
    const total = report.fb.reduce((sum, p) => sum + p.anteil_pct, 0);
    expect(total).toBeCloseTo(100, 2);

    const uta = report.fb.find((p) => p.partner_name === "Uta Hedwig Tacke");
    const maurus = report.fb.find((p) => p.partner_name === "Maurus Tacke");
    const leo = report.fb.find((p) => p.partner_name === "Leo Tacke");

    expect(uta?.anteil_pct).toBeCloseTo(12.5, 2);
    expect(maurus?.anteil_pct).toBeCloseTo(12.5, 2);
    expect(leo?.anteil_pct).toBeCloseTo(75.0, 2);
  });

  it("FB partner-spezifische Mieteinnahmen werden korrekt anteilig zugewiesen", () => {
    const totalIncome = GS.fe_fb.z58_laufende_einkuenfte_gbr_total;
    const uta = report.fb.find((p) => p.partner_name === "Uta Hedwig Tacke")!;
    const maurus = report.fb.find((p) => p.partner_name === "Maurus Tacke")!;
    const leo = report.fb.find((p) => p.partner_name === "Leo Tacke")!;

    expect(uta.rent_income).toBeCloseTo(totalIncome / 8, 1);
    expect(maurus.rent_income).toBeCloseTo(totalIncome / 8, 1);
    expect(leo.rent_income).toBeCloseTo((totalIncome * 3) / 4, 1);
  });

  it("FB Sonderwerbungskosten Leo: -7.822,90 EUR (Z.61 / Z.122)", () => {
    // gbrTaxReport speichert partner_special_expenses als positiven Betrag und zieht
    // sie vom Anteils-Ergebnis ab. Im ELSTER-Soll wird der Wert mit Minuszeichen
    // ausgewiesen (-7.822,90).
    const leo = report.fb.find((p) => p.partner_name === "Leo Tacke");
    expect(leo, "Beteiligter Leo muss in FB-Aufteilung existieren").toBeDefined();

    const expectedAbs = Math.abs(GS.fe_fb.z61_sonderwerbungskosten_beteiligter_3_leo);
    const row = compareLine(
      { key: "leo_sonder_wk", zeile: "Z.61/Z.122", label: "Sonderwerbungskosten Leo (Schuldzinsen)", soll: expectedAbs },
      leo!.partner_special_expenses,
      TOL.einzelfelder_eur,
    );
    if (row.status !== "OK") {
      console.log(buildDiffReport([row], "GbR Sonderwerbungskosten Leo"));
    }
    expect(leo!.partner_special_expenses).toBeCloseTo(expectedAbs, 1);

    // Gegenprobe: Uta und Maurus haben KEINE Sonderwerbungskosten
    const uta = report.fb.find((p) => p.partner_name === "Uta Hedwig Tacke")!;
    const maurus = report.fb.find((p) => p.partner_name === "Maurus Tacke")!;
    expect(uta.partner_special_expenses).toBe(0);
    expect(maurus.partner_special_expenses).toBe(0);
  });

  it("Übersichts-Diff: FE/FB-Sollwerte Kesslerberg 2024 GbR", () => {
    const leo = report.fb.find((p) => p.partner_name === "Leo Tacke")!;
    const expectedSonderAbs = Math.abs(GS.fe_fb.z61_sonderwerbungskosten_beteiligter_3_leo);

    const rows = [
      compareLine({ key: "fe_total_income", zeile: "Z.58", label: "FE total income (GbR)", soll: GS.fe_fb.z58_laufende_einkuenfte_gbr_total }, report.fe.total_income, TOL.summen_eur),
      compareLine({ key: "leo_sonder_wk", zeile: "Z.61", label: "Sonderwerbungskosten Leo (Z.61, abs)", soll: expectedSonderAbs }, leo.partner_special_expenses, TOL.einzelfelder_eur),
      compareLine({ key: "leo_sonder_wk_122", zeile: "Z.122", label: "Sonderwerbungskosten Leo (Z.122, abs)", soll: expectedSonderAbs }, leo.partner_special_expenses, TOL.einzelfelder_eur),
    ];
    console.log(buildDiffReport(rows, "GbR-Verteilung Kesslerberg 2024 (vs. ELSTER-Soll FE/FB)"));
    expect(rows.length).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE-TODOs: Felder, die der aktuelle gbrTaxReport noch NICHT direkt
  // unterstützt. Marker als it.fails / it.todo, damit der Test als
  // "to-do" sichtbar bleibt, aber das CI-Gate nicht blockiert.
  // ─────────────────────────────────────────────────────────────────────────

  it.fails(
    "FEATURE FEHLT: Sonderwerbungskosten als eigene Anlage-V-Zeile pro Beteiligter",
    () => {
      // Aktuell speichert gbrTaxReport `partner_special_expenses` als reine Summe je
      // Partner. ELSTER verlangt jedoch eine Aufgliederung nach Werbungskosten-Art
      // (Z.61 = Schuldzinsen, Z.122 = sonstige). Solange diese Aufgliederung fehlt,
      // schlägt der Test bewusst fehl.
      //
      // Erwartung wenn das Feature implementiert ist:
      //   leo.partner_special_expenses_by_zeile = { "Z.61": 7822.90 }
      //
      // it.fails erwartet, dass dieser Test fehlschlägt. Sobald das Feature da ist,
      // sollte der Test grün werden und it.fails entfernt werden.
      const leo = report.fb.find((p) => p.partner_name === "Leo Tacke")!;
      // @ts-expect-error - Feld existiert noch nicht in GbrPartnerAllocation
      expect(leo.partner_special_expenses_by_zeile?.["Z.61"]).toBeCloseTo(7822.90, 2);
    },
  );

  it.fails(
    "FEATURE FEHLT: Begründungstext / Note pro Sonderwerbungskosten-Posten in FB",
    () => {
      // gbrTaxReport reicht den `note`-Wert aus partnerTaxValues nicht in das
      // FB-Allocation-Objekt durch. Für ELSTER-Konformität müssen wir die
      // Begründung ("Schuldzinsen Leo allein") an Z.62 / Z.123 hängen.
      const leo = report.fb.find((p) => p.partner_name === "Leo Tacke")!;
      // @ts-expect-error - Feld existiert noch nicht in GbrPartnerAllocation
      expect(leo.partner_special_expenses_note).toContain("Schuldzinsen");
    },
  );
});
