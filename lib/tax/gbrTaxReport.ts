import type {
  ComputedTaxDepreciationItem,
  ComputedTaxMaintenanceDistributionItem,
  StructuredTaxLineTotals,
  StructuredTaxWarning,
  TaxData,
  TaxDepreciationItem,
  TaxMaintenanceDistributionItem,
} from "@/types/tax";
import { computeStructuredTaxData } from "@/lib/tax/structuredTaxLogic";
import { mergeDuplicatePartners, mergePartnerTaxValuesByNormalizedName, normalizePartnerName } from "@/lib/tax/partnerNormalization";
import { computeRentalShare } from "@/lib/tax/rentalShare";
import {
  findOwnerAllocation,
  runRentalTaxEngineFromExistingData,
  summarizeEngineWarnings,
  summarizeOwnerSpecialExpense,
} from "@/lib/tax/rentalTaxEngineBridge";

export type GbrPartner = {
  id: string;
  name: string;
  anteil: number;
  email: string | null;
};

export type GbrSettingsSummary = {
  id?: string;
  property_id: string;
  name: string;
  steuernummer: string;
  finanzamt: string;
  veranlagungszeitraum: number;
  sonder_werbungskosten: boolean;
  feststellungserklaerung: boolean;
  teilweise_eigennutzung: boolean;
  gbr_partner: GbrPartner[];
};

export type TaxSettingsSummary = {
  eigennutzung_tage: number;
  gesamt_tage: number;
  rental_share_override_pct?: number | null;
};

export type GbrPartnerAllocation = {
  partner_id: string;
  partner_name: string;
  email: string | null;
  anteil_pct: number;
  rent_income: number;
  deposits_received: number;
  rent_prior_year: number;
  operating_costs_income: number;
  other_income: number;
  total_income: number;
  loan_interest: number;
  property_tax: number;
  hoa_fees: number;
  insurance: number;
  water_sewage: number;
  waste_disposal: number;
  property_management: number;
  bank_fees: number;
  maintenance_costs: number;
  other_expenses: number;
  total_expenses: number;
  depreciation_total: number;
  special_deductions_total: number;
  partner_special_expenses: number;
  result_before_partner_adjustments: number;
  result: number;
};

export type GbrTaxReport = {
  tax_year: number;
  property_id: string;
  property_name: string | null;
  property_address: string | null;
  is_gbr: boolean;
  warnings: string[];
  tax_data: TaxData;
  gbr: {
    name: string;
    steuernummer: string;
    finanzamt: string;
    feststellungserklaerung: boolean;
    sonder_werbungskosten: boolean;
    teilweise_eigennutzung: boolean;
    partner_count: number;
    partner_total_share_pct: number;
    eigennutzung_tage: number;
    gesamt_tage: number;
    rental_share_pct: number;
    rental_share_source: "auto" | "override";
  };
  fe: {
    total_income: number;
    total_expenses: number;
    depreciation_total: number;
    special_deductions_total: number;
    collective_result: number;
    partner_special_expenses_total: number;
    final_result: number;
  };
  fb: GbrPartnerAllocation[];
  logic: {
    depreciation_items: ComputedTaxDepreciationItem[];
    maintenance_distributions: ComputedTaxMaintenanceDistributionItem[];
    line_totals: StructuredTaxLineTotals;
    warnings: StructuredTaxWarning[];
  };
  engine?: {
    status: "ok" | "blocking_error" | "review_required";
    filing_profile: string;
    ownership_model: string;
    rental_mode: string;
    income_regime: string;
    blocking_errors: string[];
    review_flags: string[];
    warnings: string[];
  };
};

export type GbrPartnerTaxValue = {
  gbr_partner_id: string;
  special_expenses: number | null;
  note?: string | null;
};

type PropertySummary = {
  id: string;
  name: string | null;
  address: string | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const num = (value: number | null | undefined) => Number(value ?? 0);

export function calculateTaxTotals(taxData: TaxData) {
  const totalIncome = round2(
    num(taxData.rent_income) +
    num(taxData.deposits_received) +
    num(taxData.rent_prior_year) +
    num(taxData.operating_costs_income) +
    num(taxData.other_income),
  );

  const totalExpenses = round2(
    num(taxData.loan_interest) +
    num(taxData.property_tax) +
    num(taxData.hoa_fees) +
    num(taxData.insurance) +
    num(taxData.water_sewage) +
    num(taxData.waste_disposal) +
    num(taxData.property_management) +
    num(taxData.bank_fees) +
    num(taxData.maintenance_costs) +
    num(taxData.other_expenses),
  );

  const depreciationTotal = round2(
    num(taxData.depreciation_building) +
    num(taxData.depreciation_outdoor) +
    num(taxData.depreciation_fixtures),
  );

  const specialDeductionsTotal = round2(
    num(taxData.special_deduction_7b) +
    num(taxData.special_deduction_renovation),
  );

  const result = round2(totalIncome - totalExpenses - depreciationTotal - specialDeductionsTotal);

  return {
    totalIncome,
    totalExpenses,
    depreciationTotal,
    specialDeductionsTotal,
    result,
  };
}

export function buildGbrTaxReport(args: {
  property: PropertySummary;
  taxData: TaxData;
  gbrSettings: GbrSettingsSummary | null;
  partnerTaxValues?: GbrPartnerTaxValue[];
  taxSettings?: TaxSettingsSummary | null;
  depreciationItems?: TaxDepreciationItem[];
  maintenanceDistributions?: TaxMaintenanceDistributionItem[];
}): GbrTaxReport {
  const {
    property,
    taxData,
    gbrSettings,
    partnerTaxValues = [],
    taxSettings,
    depreciationItems = [],
    maintenanceDistributions = [],
  } = args;
  const warnings: string[] = [];
  const rawPartners = gbrSettings?.gbr_partner ?? [];
  const { partners, duplicateWarnings } = mergeDuplicatePartners(rawPartners);
  const partnerTaxMap = mergePartnerTaxValuesByNormalizedName(partnerTaxValues, rawPartners);
  const rentalShare = computeRentalShare(taxSettings ?? {});
  const totalDays = rentalShare.gesamt_tage;
  const selfUseDays = rentalShare.eigennutzung_tage;
  const rentalShareSource = rentalShare.rental_share_source;
  const rentalSharePct = rentalShare.rental_share_pct;
  const partnerTotalSharePct = round2(
    partners.reduce((sum, partner) => sum + num(partner.anteil), 0),
  );

  if (!gbrSettings) warnings.push("Keine GbR-Stammdaten gefunden.");
  if (partners.length === 0) warnings.push("Es sind keine GbR-Partner hinterlegt.");
  warnings.push(...duplicateWarnings);
  warnings.push(...rentalShare.warnings);
  if (partners.length > 0 && Math.abs(partnerTotalSharePct - 100) > 0.01) {
    warnings.push(`Die Partneranteile summieren sich auf ${partnerTotalSharePct.toFixed(2)} % statt 100 %.`);
  }
  if (gbrSettings && !gbrSettings.feststellungserklaerung) {
    warnings.push("Die gesonderte und einheitliche Feststellungserklärung ist in den GbR-Einstellungen nicht aktiviert.");
  }
  if (gbrSettings?.sonder_werbungskosten && partnerTaxValues.length === 0 && partners.length > 0) {
    warnings.push("Sonderwerbungskosten sind aktiviert, aber für dieses Steuerjahr ist noch kein Partnerwert hinterlegt.");
  }
  if (gbrSettings?.teilweise_eigennutzung && selfUseDays > 0) {
    warnings.push(`Teilweise Eigennutzung aktiv: Kürzungsfaktor ${(rentalSharePct * 100).toFixed(2)} % (${rentalShareSource === "override" ? "manuell" : "automatisch"}).`);
  }

  const structured = computeStructuredTaxData({
    taxData,
    taxYear: taxData.tax_year,
    rentalSharePct,
    depreciationItems,
    maintenanceDistributions,
  });

  const adjustedTaxData: TaxData = { ...structured.taxData };
  const totals = calculateTaxTotals(adjustedTaxData);
  warnings.push(...structured.warnings.map((item) => item.message));

  const engineOutput = runRentalTaxEngineFromExistingData({
    property,
    taxData: adjustedTaxData,
    gbrSettings,
    partnerTaxValues: partnerTaxValues.map((item) => ({
      id: `${item.gbr_partner_id}-${taxData.tax_year}`,
      gbr_partner_id: item.gbr_partner_id,
      tax_year: taxData.tax_year,
      special_expenses: item.special_expenses ?? 0,
      note: item.note ?? null,
    })),
    taxSettings,
    depreciationItems,
    maintenanceDistributions,
  });
  warnings.push(...summarizeEngineWarnings(engineOutput));

  const fb = partners.map((partner) => {
    const factor = num(partner.anteil) / 100;
    const partnerSpecialExpenses = round2(partnerTaxMap.get(normalizePartnerName(partner.name)) ?? 0);
    const engineAllocation = findOwnerAllocation(engineOutput, partner.id);
    const resultBeforePartnerAdjustments = engineAllocation
      ? round2(engineAllocation.resultCents / 100 - engineAllocation.specialItemsCents / 100)
      : round2(totals.result * factor);
    const partnerIncome = engineAllocation ? round2(engineAllocation.revenueCents / 100) : round2(totals.totalIncome * factor);
    const partnerExpenses = engineAllocation ? round2(engineAllocation.expenseCents / 100) : round2(totals.totalExpenses * factor);
    const partnerDepreciation = engineAllocation ? round2(engineAllocation.depreciationCents / 100) : round2(totals.depreciationTotal * factor);
    const engineSpecialExpenses = summarizeOwnerSpecialExpense(engineOutput, partner.id);
    const allocation = {
      partner_id: partner.id,
      partner_name: partner.name,
      email: partner.email,
      anteil_pct: round2(num(partner.anteil)),
      rent_income: round2(num(taxData.rent_income) * factor),
      deposits_received: round2(num(taxData.deposits_received) * factor),
      rent_prior_year: round2(num(taxData.rent_prior_year) * factor),
      operating_costs_income: round2(num(taxData.operating_costs_income) * factor),
      other_income: round2(num(taxData.other_income) * factor),
      total_income: partnerIncome,
      loan_interest: round2(num(adjustedTaxData.loan_interest) * factor),
      property_tax: round2(num(adjustedTaxData.property_tax) * factor),
      hoa_fees: round2(num(adjustedTaxData.hoa_fees) * factor),
      insurance: round2(num(adjustedTaxData.insurance) * factor),
      water_sewage: round2(num(adjustedTaxData.water_sewage) * factor),
      waste_disposal: round2(num(adjustedTaxData.waste_disposal) * factor),
      property_management: round2(num(adjustedTaxData.property_management) * factor),
      bank_fees: round2(num(adjustedTaxData.bank_fees) * factor),
      maintenance_costs: round2(num(adjustedTaxData.maintenance_costs) * factor),
      other_expenses: round2(num(adjustedTaxData.other_expenses) * factor),
      total_expenses: partnerExpenses,
      depreciation_total: partnerDepreciation,
      special_deductions_total: round2(totals.specialDeductionsTotal * factor),
      partner_special_expenses: engineSpecialExpenses || partnerSpecialExpenses,
      result_before_partner_adjustments: resultBeforePartnerAdjustments,
      result: engineAllocation
        ? round2(engineAllocation.resultCents / 100)
        : round2(resultBeforePartnerAdjustments - partnerSpecialExpenses),
    };

    return allocation;
  });

  return {
    tax_year: taxData.tax_year,
    property_id: property.id,
    property_name: property.name,
    property_address: property.address,
    is_gbr: Boolean(gbrSettings),
    warnings,
    tax_data: adjustedTaxData,
    gbr: {
      name: gbrSettings?.name ?? "",
      steuernummer: gbrSettings?.steuernummer ?? "",
      finanzamt: gbrSettings?.finanzamt ?? "",
      feststellungserklaerung: gbrSettings?.feststellungserklaerung ?? false,
      sonder_werbungskosten: gbrSettings?.sonder_werbungskosten ?? false,
      teilweise_eigennutzung: gbrSettings?.teilweise_eigennutzung ?? false,
      partner_count: partners.length,
      partner_total_share_pct: partnerTotalSharePct,
      eigennutzung_tage: selfUseDays,
      gesamt_tage: totalDays,
      rental_share_pct: rentalSharePct,
      rental_share_source: rentalShareSource,
    },
    fe: {
      total_income: totals.totalIncome,
      total_expenses: totals.totalExpenses,
      depreciation_total: totals.depreciationTotal,
      special_deductions_total: totals.specialDeductionsTotal,
      collective_result: totals.result,
      partner_special_expenses_total: round2(fb.reduce((sum, partner) => sum + partner.partner_special_expenses, 0)),
      final_result: round2(fb.reduce((sum, partner) => sum + partner.result, 0)),
    },
    fb,
    logic: {
      depreciation_items: structured.depreciationItems,
      maintenance_distributions: structured.maintenanceDistributions,
      line_totals: structured.lineTotals,
      warnings: structured.warnings,
    },
    engine: {
      status: engineOutput.status,
      filing_profile: engineOutput.filingRecommendation.filingProfile,
      ownership_model: engineOutput.classification.ownershipModel,
      rental_mode: engineOutput.classification.rentalMode,
      income_regime: engineOutput.classification.incomeRegime,
      blocking_errors: engineOutput.blockingErrors.map((item) => item.message),
      review_flags: engineOutput.reviewFlags.map((item) => item.message),
      warnings: engineOutput.warnings.map((item) => item.message),
    },
  };
}
