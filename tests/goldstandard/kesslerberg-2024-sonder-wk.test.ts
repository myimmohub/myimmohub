/**
 * Goldstandard-Test Kesslerberg GbR · Steuerjahr 2024 · Sonderwerbungskosten-Feature
 *
 * Prüft das neue itemisierte `partnerSpecialItems`-Feature in
 * `buildGbrTaxReport`. Speist Schuldzinsen Leo (allein finanziert) als
 * `special_expense_interest` ein und verifiziert:
 *   - special_balance Leo = -7.822,90 EUR (entspricht Z.61/Z.122 in 2024)
 *   - special_income_total Leo = 0
 *   - special_expense_total Leo = -7.822,90
 *   - Uta/Maurus: alle Sonderfelder = 0
 *   - result Leo wird um den Sonder-WK-Betrag tiefer (vs. ohne Sonder-WK)
 *
 * Quelle Sollwerte: tests/fixtures/kesslerberg/goldstandard.json years.2024.fe_fb.
 */

import { describe, it, expect } from "vitest";
import goldstandard from "../fixtures/kesslerberg/goldstandard.json" with { type: "json" };
import {
  buildGbrTaxReport,
  type GbrPartnerSpecialItem,
  type GbrSettingsSummary,
  type TaxSettingsSummary,
} from "@/lib/tax/gbrTaxReport";
import type {
  TaxData,
  TaxDepreciationItem,
  TaxMaintenanceDistributionItem,
} from "@/types/tax";

const TAX_YEAR = 2024;
const GS = goldstandard.years["2024"];
const PROPERTY_ID = "test-kesslerberg-sonder";

const PROPERTY = {
  id: PROPERTY_ID,
  name: "Kesslerberg",
  address: "Am Kesslerberg 7, 79856 Hinterzarten",
};

const TAX_SETTINGS: TaxSettingsSummary = {
  eigennutzung_tage: 17,
  gesamt_tage: 365,
  rental_share_override_pct: null,
};

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
  id: "test-tax-data-2024-sonder",
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
];

const maintenanceDistributions: TaxMaintenanceDistributionItem[] = [];

const SCHULDZINSEN_LEO = Math.abs(GS.fe_fb.z61_sonderwerbungskosten_beteiligter_3_leo); // 7822.90

const partnerSpecialItems: GbrPartnerSpecialItem[] = [
  {
    gbr_partner_id: "p3-leo",
    tax_year: TAX_YEAR,
    label: "Schuldzinsen Kredit Leo (allein finanziert)",
    amount: -SCHULDZINSEN_LEO, // Konvention: negativ = Sonder-WK
    classification: "special_expense_interest",
    note: "Zinsbestätigung 2024",
  },
];

describe("Kesslerberg 2024 - Sonderwerbungskosten-Feature (itemisiert)", () => {
  const report = buildGbrTaxReport({
    property: PROPERTY,
    taxData: baseTaxData,
    gbrSettings: GBR_SETTINGS,
    partnerSpecialItems,
    taxSettings: TAX_SETTINGS,
    depreciationItems,
    maintenanceDistributions,
  });

  const leo = report.fb.find((p) => p.partner_name === "Leo Tacke");
  const uta = report.fb.find((p) => p.partner_name === "Uta Hedwig Tacke");
  const maurus = report.fb.find((p) => p.partner_name === "Maurus Tacke");

  it("Leo: special_balance = -7.822,90 EUR (Z.61 / Z.122)", () => {
    expect(leo, "Leo muss in FB existieren").toBeDefined();
    expect(leo!.special_balance).toBeCloseTo(-SCHULDZINSEN_LEO, 2);
  });

  it("Leo: special_income_total = 0, special_expense_total = -7.822,90", () => {
    expect(leo!.special_income_total).toBe(0);
    expect(leo!.special_expense_total).toBeCloseTo(-SCHULDZINSEN_LEO, 2);
  });

  it("Leo: special_items enthält genau einen Eintrag mit Klassifikation special_expense_interest", () => {
    expect(leo!.special_items).toHaveLength(1);
    expect(leo!.special_items[0].classification).toBe("special_expense_interest");
    expect(leo!.special_items[0].label).toContain("Schuldzinsen");
    expect(leo!.special_items[0].amount).toBeCloseTo(-SCHULDZINSEN_LEO, 2);
    expect(leo!.special_items[0].note).toBe("Zinsbestätigung 2024");
  });

  it("Uta + Maurus: keine Sonderposten (alle special_*-Felder = 0, special_items leer)", () => {
    for (const p of [uta!, maurus!]) {
      expect(p.special_items).toHaveLength(0);
      expect(p.special_income_total).toBe(0);
      expect(p.special_expense_total).toBe(0);
      expect(p.special_balance).toBe(0);
      expect(p.partner_special_expenses).toBe(0);
    }
  });

  it("Leo: result wird um den Sonder-WK-Saldo verringert (vertieft den Verlust)", () => {
    expect(leo!.result).toBeCloseTo(
      leo!.result_before_partner_adjustments + leo!.special_balance,
      2,
    );
  });

  it("Types: GbrPartnerAllocation hat die neuen Felder special_items / special_*_total / special_balance", () => {
    // Compile-Time-Check: wenn die Types fehlen, schlägt tsc fehl. Hier nur
    // ein Runtime-Smoke.
    expect(typeof leo!.special_balance).toBe("number");
    expect(Array.isArray(leo!.special_items)).toBe(true);
  });
});
